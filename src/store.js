import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DIRNAME = ".questlog";
const QUESTS_DIRNAME = "quests";

const INIT_README = `# questlog

This folder is your local quest store. Each file in \`quests/\` is one quest.

Keep the YAML-ish frontmatter keys (\`id\`, \`status\`, \`created\`, \`completed\`) intact if you edit by hand.

Managed by questlog — https://github.com/78tacos/questlog
`;

export class QuestlogError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = "QuestlogError";
    this.code = code;
  }
}

/**
 * @typedef {object} Quest
 * @property {string} id
 * @property {"open" | "completed"} status
 * @property {string} created
 * @property {string | null} completed
 * @property {string} title
 * @property {string} notes
 * @property {string} [filename]
 */

export class QuestStore {
  /** @param {string} rootDir */
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.questsDir = path.join(this.rootDir, QUESTS_DIRNAME);
  }

  async init() {
    await mkdir(this.questsDir, { recursive: true });
    const readmePath = path.join(this.rootDir, "README.md");
    try {
      await access(readmePath);
    } catch {
      await writeFile(readmePath, INIT_README, "utf8");
    }
    return this.rootDir;
  }

  /**
   * @param {string} title
   * @param {{ notes?: string }} [options]
   * @returns {Promise<Quest>}
   */
  async add(title, options = {}) {
    await this.ensureReady();
    const trimmed = title.trim();
    if (!trimmed) {
      throw new QuestlogError("Quest title cannot be empty.", "EMPTY_TITLE");
    }

    const notes = (options.notes ?? "").trim();
    const quests = await this.loadAll();
    const id = String(nextId(quests));
    const created = new Date().toISOString();
    const quest = {
      id,
      status: /** @type {const} */ ("open"),
      created,
      completed: null,
      title: trimmed,
      notes,
    };
    const filename = `${id}-${slugify(trimmed)}.md`;
    await this.writeQuest(filename, quest);
    return { ...quest, filename };
  }

  /**
   * @param {{ includeCompleted?: boolean }} [options]
   * @returns {Promise<Quest[]>}
   */
  async list(options = {}) {
    await this.ensureReady();
    const quests = await this.loadAll();
    if (options.includeCompleted) {
      return quests;
    }
    return quests.filter((quest) => quest.status === "open");
  }

  /**
   * @param {string} id
   * @returns {Promise<Quest>}
   */
  async get(id) {
    await this.ensureReady();
    const quest = await this.findById(id);
    if (!quest) {
      throw new QuestlogError(`No quest with id ${id}.`, "NOT_FOUND");
    }
    return quest;
  }

  /**
   * @param {string} id
   * @returns {Promise<Quest>}
   */
  async complete(id) {
    await this.ensureReady();
    const quest = await this.get(id);
    if (quest.status === "completed") {
      throw new QuestlogError(
        `Quest ${quest.id} is already completed.`,
        "ALREADY_COMPLETE",
      );
    }
    const updated = {
      ...quest,
      status: /** @type {const} */ ("completed"),
      completed: new Date().toISOString(),
    };
    await this.writeQuest(quest.filename, updated);
    return updated;
  }

  async ensureReady() {
    try {
      await access(this.questsDir);
    } catch {
      throw new QuestlogError(
        `No questlog found at ${this.rootDir}. Run \`questlog init\` first.`,
        "NOT_INITIALIZED",
      );
    }
  }

  /** @returns {Promise<Quest[]>} */
  async loadAll() {
    const names = await readdir(this.questsDir);
    /** @type {Quest[]} */
    const quests = [];
    for (const name of names) {
      if (!name.endsWith(".md")) {
        continue;
      }
      const raw = await readFile(path.join(this.questsDir, name), "utf8");
      try {
        quests.push({ ...parseQuest(raw), filename: name });
      } catch (err) {
        if (err instanceof QuestlogError && err.code === "INVALID_FILE") {
          process.stderr.write(`questlog: skipping invalid quest file ${name}\n`);
          continue;
        }
        throw err;
      }
    }
    return quests.sort((a, b) => Number(a.id) - Number(b.id));
  }

  /**
   * @param {string} id
   * @returns {Promise<Quest | undefined>}
   */
  async findById(id) {
    const wanted = String(id).trim();
    const quests = await this.loadAll();
    return quests.find((quest) => quest.id === wanted);
  }

  /**
   * @param {string} filename
   * @param {Quest} quest
   */
  async writeQuest(filename, quest) {
    const safeName = path.basename(filename);
    const questsRoot = path.resolve(this.questsDir);
    const target = path.resolve(questsRoot, safeName);
    if (path.dirname(target) !== questsRoot) {
      throw new QuestlogError(
        `Refusing to write outside the quests directory: ${filename}`,
        "INVALID_FILENAME",
      );
    }
    await writeFile(target, serializeQuest(quest), "utf8");
  }
}

/**
 * @param {string} cwd
 * @param {string | undefined} dirFlag
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveStoreDir(cwd, dirFlag, env = process.env) {
  if (dirFlag) {
    return path.resolve(cwd, dirFlag);
  }
  if (env.QUESTLOG_DIR) {
    return path.resolve(cwd, env.QUESTLOG_DIR);
  }
  return path.join(cwd, DEFAULT_DIRNAME);
}

/**
 * @param {string} raw
 * @returns {Quest}
 */
export function parseQuest(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new QuestlogError("Quest file is missing frontmatter.", "INVALID_FILE");
  }

  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    meta[key] = value;
  }

  const body = match[2].trim();
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const notes = body.replace(/^#\s+.+$/m, "").trim();

  const status = meta.status === "completed" ? "completed" : "open";
  const completed = meta.completed && meta.completed !== "null" ? meta.completed : null;

  return {
    id: String(meta.id ?? ""),
    status,
    created: meta.created ?? "",
    completed,
    title,
    notes,
  };
}

/** @param {Quest} quest */
export function serializeQuest(quest) {
  const notesBlock = quest.notes ? `\n${quest.notes}\n` : "\n";
  return `---
id: ${quest.id}
status: ${quest.status}
created: ${quest.created}
completed: ${quest.completed ?? ""}
---

# ${quest.title}
${notesBlock}`;
}

/** @param {Quest[]} quests */
function nextId(quests) {
  let max = 0;
  for (const quest of quests) {
    const n = Number(quest.id);
    if (Number.isInteger(n) && n > max) {
      max = n;
    }
  }
  return max + 1;
}

/** @param {string} title */
export function slugify(title) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "quest";
}
