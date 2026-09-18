const useColor =
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

/** @param {string} code */
const wrap = (code) => {
  /** @param {string} text */
  return (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
};

const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  magenta: wrap("35"),
};

/**
 * @param {import("./store.js").Quest[]} quests
 * @param {{ includeCompleted?: boolean }} [options]
 */
export function formatList(quests, options = {}) {
  if (quests.length === 0) {
    const hint = options.includeCompleted
      ? "No quests yet."
      : "No open quests.";
    return [
      "",
      `  ${c.magenta("✦")} ${c.bold("questlog")}`,
      "",
      `  ${c.dim(hint)}`,
      `  ${c.dim('Add one with')} ${c.cyan('questlog add "…"')}`,
      "",
    ].join("\n");
  }

  const openCount = quests.filter((q) => q.status === "open").length;
  const doneCount = quests.filter((q) => q.status === "completed").length;
  const lines = [
    "",
    `  ${c.magenta("✦")} ${c.bold("questlog")}  ${c.dim("·")}  ${summary(openCount, doneCount, options.includeCompleted)}`,
    "",
  ];

  for (const quest of quests) {
    lines.push(formatQuestRow(quest));
  }

  lines.push("");
  return lines.join("\n");
}

/** @param {import("./store.js").Quest} quest */
function formatQuestRow(quest) {
  const done = quest.status === "completed";
  const mark = done ? c.green("✓") : c.yellow("○");
  const id = c.cyan(String(quest.id).padStart(2, " "));
  const title = done ? c.dim(quest.title) : quest.title;
  const extra = done ? `  ${c.dim("done")}` : "";
  return `  ${mark}  ${id}  ${title}${extra}`;
}

/** @param {import("./store.js").Quest} quest */
export function formatQuestDetail(quest) {
  const done = quest.status === "completed";
  const mark = done ? c.green("✓ completed") : c.yellow("○ open");
  const lines = [
    "",
    `  ${c.magenta("✦")} ${c.bold(quest.title)}`,
    "",
    `  ${c.dim("id")}         ${c.cyan(quest.id)}`,
    `  ${c.dim("status")}     ${mark}`,
    `  ${c.dim("created")}    ${quest.created}`,
  ];
  if (quest.completed) {
    lines.push(`  ${c.dim("completed")}  ${quest.completed}`);
  }
  if (quest.notes) {
    lines.push("", `  ${quest.notes}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** @param {string} rootDir */
export function formatInit(rootDir) {
  return [
    "",
    `  ${c.magenta("✦")} Initialized questlog at ${c.bold(rootDir)}`,
    `  ${c.dim("Next:")} ${c.cyan('questlog add "My first quest"')}`,
    "",
  ].join("\n");
}

/** @param {import("./store.js").Quest} quest */
export function formatAdded(quest) {
  return [
    "",
    `  ${c.green("+")} Added  ${c.cyan(quest.id)}  ${quest.title}`,
    "",
  ].join("\n");
}

/** @param {import("./store.js").Quest} quest */
export function formatCompleted(quest) {
  return [
    "",
    `  ${c.green("✓")} Completed  ${c.cyan(quest.id)}  ${quest.title}`,
    "",
  ].join("\n");
}

/** @param {string} message */
export function formatError(message) {
  return `  ${c.red("✗")} ${message}`;
}

export function formatHelp() {
  return `
  ${c.magenta("✦")} ${c.bold("questlog")}  ${c.dim("markdown-backed personal quests")}

  ${c.bold("Usage")}
    questlog <command> [options]

  ${c.bold("Commands")}
    init                 Create a local .questlog/ store
    add <title>          Add a quest
    list                 List open quests
    complete <id>        Mark a quest complete
    show <id>            Show one quest

  ${c.bold("Options")}
    -a, --all            Include completed quests in list
    -n, --notes <text>   Notes when adding a quest
        --dir <path>     Store path (default: ./.questlog)
    -h, --help           Show help
    -v, --version        Show version

  ${c.bold("Examples")}
    questlog init
    questlog add "Drink water"
    questlog add "Ship v1" -n "README, tests, license"
    questlog list
    questlog complete 1
`;
}

/**
 * @param {number} openCount
 * @param {number} doneCount
 * @param {boolean | undefined} includeCompleted
 */
function summary(openCount, doneCount, includeCompleted) {
  if (includeCompleted) {
    return c.dim(`${openCount} open · ${doneCount} done`);
  }
  return c.dim(`${openCount} open`);
}
