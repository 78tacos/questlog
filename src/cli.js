import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { QuestStore, QuestlogError, resolveStoreDir } from "./store.js";
import {
  formatAdded,
  formatCompleted,
  formatError,
  formatHelp,
  formatInit,
  formatList,
  formatQuestDetail,
} from "./format.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream }} [io]
 */
export async function run(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dir: { type: "string" },
        all: { type: "boolean", short: "a", default: false },
        notes: { type: "string", short: "n" },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeLine(stderr, formatError(message));
    return 1;
  }

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.version) {
    writeLine(stdout, pkg.version);
    return 0;
  }

  if (values.help || command === "help" || !command) {
    writeLine(stdout, formatHelp());
    return 0;
  }

  const store = new QuestStore(resolveStoreDir(cwd, values.dir, env));

  try {
    switch (command) {
      case "init": {
        const root = await store.init();
        writeLine(stdout, formatInit(root));
        return 0;
      }
      case "add": {
        const title = positionals.slice(1).join(" ").trim();
        if (!title) {
          writeLine(stderr, formatError('Usage: questlog add "title"'));
          return 1;
        }
        const quest = await store.add(title, { notes: values.notes });
        writeLine(stdout, formatAdded(quest));
        return 0;
      }
      case "list":
      case "ls": {
        const quests = await store.list({ includeCompleted: values.all });
        writeLine(stdout, formatList(quests, { includeCompleted: values.all }));
        return 0;
      }
      case "complete":
      case "done": {
        const id = positionals[1];
        if (!id) {
          writeLine(stderr, formatError("Usage: questlog complete <id>"));
          return 1;
        }
        const quest = await store.complete(id);
        writeLine(stdout, formatCompleted(quest));
        return 0;
      }
      case "show": {
        const id = positionals[1];
        if (!id) {
          writeLine(stderr, formatError("Usage: questlog show <id>"));
          return 1;
        }
        const quest = await store.get(id);
        writeLine(stdout, formatQuestDetail(quest));
        return 0;
      }
      default: {
        writeLine(
          stderr,
          formatError(`Unknown command "${command}". Try questlog --help.`),
        );
        return 1;
      }
    }
  } catch (err) {
    if (err instanceof QuestlogError) {
      writeLine(stderr, formatError(err.message));
      return 1;
    }
    throw err;
  }
}

/** @param {NodeJS.WriteStream} stream @param {string} text */
function writeLine(stream, text) {
  stream.write(text.endsWith("\n") ? text : `${text}\n`);
}
