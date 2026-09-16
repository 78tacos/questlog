import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  QuestStore,
  QuestlogError,
  parseQuest,
  resolveStoreDir,
  serializeQuest,
  slugify,
} from "../src/store.js";

/** @type {string[]} */
const temps = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "questlog-"));
  temps.push(dir);
  const store = new QuestStore(path.join(dir, ".questlog"));
  await store.init();
  return store;
}

test("init scaffolds a quests directory and readme", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "questlog-"));
  temps.push(dir);
  const root = path.join(dir, ".questlog");
  const store = new QuestStore(root);

  const created = await store.init();
  assert.equal(created, path.resolve(root));

  const names = await readdir(root);
  assert.ok(names.includes("quests"));
  assert.ok(names.includes("README.md"));

  const again = await store.init();
  assert.equal(again, path.resolve(root));
});

test("add creates a markdown quest with open status", async () => {
  const store = await tempStore();
  const quest = await store.add("Drink water", { notes: "eight glasses" });

  assert.equal(quest.id, "1");
  assert.equal(quest.status, "open");
  assert.equal(quest.title, "Drink water");
  assert.equal(quest.notes, "eight glasses");
  assert.ok(quest.created);
  assert.equal(quest.completed, null);
  assert.equal(quest.filename, "1-drink-water.md");

  const raw = await readFile(
    path.join(store.questsDir, quest.filename),
    "utf8",
  );
  assert.match(raw, /^---\n/);
  assert.match(raw, /id: 1/);
  assert.match(raw, /status: open/);
  assert.match(raw, /# Drink water/);
  assert.match(raw, /eight glasses/);
});

test("list returns created quests and hides completed by default", async () => {
  const store = await tempStore();
  await store.add("Drink water");
  await store.add("Stretch");
  await store.complete("1");

  const open = await store.list();
  assert.deepEqual(
    open.map((q) => q.id),
    ["2"],
  );

  const all = await store.list({ includeCompleted: true });
  assert.deepEqual(
    all.map((q) => q.id),
    ["1", "2"],
  );
  assert.equal(all[0].status, "completed");
  assert.ok(all[0].completed);
});

test("complete marks a quest done and persists it", async () => {
  const store = await tempStore();
  await store.add("Ship v1");
  const done = await store.complete("1");

  assert.equal(done.status, "completed");
  assert.ok(done.completed);

  const loaded = await store.get("1");
  assert.equal(loaded.status, "completed");
  assert.equal(loaded.completed, done.completed);

  const raw = await readFile(path.join(store.questsDir, loaded.filename ?? ""), "utf8");
  const parsed = parseQuest(raw);
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.completed, done.completed);
});

test("ids increment across adds", async () => {
  const store = await tempStore();
  const a = await store.add("One");
  const b = await store.add("Two");
  const c = await store.add("Three");
  assert.deepEqual([a.id, b.id, c.id], ["1", "2", "3"]);
});

test("add rejects an empty title", async () => {
  const store = await tempStore();
  await assert.rejects(() => store.add("   "), (err) => {
    assert.ok(err instanceof QuestlogError);
    assert.equal(err.code, "EMPTY_TITLE");
    return true;
  });
});

test("complete rejects missing and already-done quests", async () => {
  const store = await tempStore();
  await store.add("Only one");

  await assert.rejects(() => store.complete("99"), (err) => {
    assert.ok(err instanceof QuestlogError);
    assert.equal(err.code, "NOT_FOUND");
    return true;
  });

  await store.complete("1");
  await assert.rejects(() => store.complete("1"), (err) => {
    assert.ok(err instanceof QuestlogError);
    assert.equal(err.code, "ALREADY_COMPLETE");
    return true;
  });
});

test("loadAll skips non-quest markdown so list and add still work", async () => {
  const store = await tempStore();
  await store.add("Keep me");
  await writeFile(
    path.join(store.questsDir, "notes.md"),
    "# stray notes\nthis is not a quest file\n",
    "utf8",
  );

  const listed = await store.list();
  assert.deepEqual(
    listed.map((q) => q.id),
    ["1"],
  );
  assert.equal(listed[0].title, "Keep me");

  const added = await store.add("Still works");
  assert.equal(added.id, "2");
  const after = await store.list();
  assert.deepEqual(
    after.map((q) => q.id),
    ["1", "2"],
  );
});

test("store methods fail before init", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "questlog-"));
  temps.push(dir);
  const store = new QuestStore(path.join(dir, ".questlog"));

  await assert.rejects(() => store.list(), (err) => {
    assert.ok(err instanceof QuestlogError);
    assert.equal(err.code, "NOT_INITIALIZED");
    return true;
  });
});

test("parse and serialize round-trip a quest", () => {
  const quest = {
    id: "4",
    status: /** @type {const} */ ("open"),
    created: "2026-09-16T17:00:00.000Z",
    completed: null,
    title: "Write tests",
    notes: "cover create/list/complete",
  };
  const parsed = parseQuest(serializeQuest(quest));
  assert.deepEqual(parsed, quest);
});

test("slugify keeps filenames readable", () => {
  assert.equal(slugify("Drink water!"), "drink-water");
  assert.equal(slugify("   "), "quest");
});

test("resolveStoreDir prefers --dir then QUESTLOG_DIR then cwd default", () => {
  const cwd = "/tmp/project";
  assert.equal(
    resolveStoreDir(cwd, "custom-log"),
    path.resolve(cwd, "custom-log"),
  );
  assert.equal(
    resolveStoreDir(cwd, undefined, { QUESTLOG_DIR: "from-env" }),
    path.resolve(cwd, "from-env"),
  );
  assert.equal(resolveStoreDir(cwd, undefined, {}), path.join(cwd, ".questlog"));
});
