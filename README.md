# questlog

Markdown-backed personal quest and habit CLI.

Quests live as ordinary markdown files on disk. No account, no cloud, no tracking — just a tiny local log you can `cat`, `grep`, and git.

## Install

Requires Node.js 18.11+.

```bash
git clone https://github.com/78tacos/questlog.git
cd questlog
npm install -g .
```

Or run without installing:

```bash
npm test
node bin/questlog.js --help
```

## Usage

```bash
questlog init
questlog add "Drink water"
questlog add "Ship v1" -n "README, tests, license"
questlog list
questlog complete 1
questlog list --all
questlog show 2
```

Example session:

```text
$ questlog init
  ✦ Initialized questlog at /home/you/project/.questlog
  Next: questlog add "My first quest"

$ questlog add "Drink water"
  + Added  1  Drink water

$ questlog add "Stretch after meetings"
  + Added  2  Stretch after meetings

$ questlog list
  ✦ questlog  ·  2 open

  ○   1  Drink water
  ○   2  Stretch after meetings

$ questlog complete 1
  ✓ Completed  1  Drink water

$ questlog list --all
  ✦ questlog  ·  1 open · 1 done

  ✓   1  Drink water  done
  ○   2  Stretch after meetings
```

### Commands

| Command | What it does |
| --- | --- |
| `questlog init` | Create `./.questlog/` |
| `questlog add "title"` | Add a quest (`-n` / `--notes` for extra text) |
| `questlog list` | List open quests (`-a` / `--all` includes completed) |
| `questlog complete <id>` | Mark a quest complete |
| `questlog show <id>` | Print one quest |

`list` also accepts `ls`. `complete` also accepts `done`.

### Store location

Default store: `./.questlog` in the current working directory.

Override with `--dir` or `QUESTLOG_DIR`:

```bash
questlog --dir ~/quests init
QUESTLOG_DIR=~/quests questlog list
```

## Store format

Each quest is a markdown file under `.questlog/quests/`:

```text
.questlog/
  README.md
  quests/
    1-drink-water.md
    2-stretch-after-meetings.md
```

File contents:

```markdown
---
id: 1
status: open
created: 2026-09-16T17:00:00.000Z
completed:
---

# Drink water

eight glasses
```

Frontmatter keys: `id`, `status` (`open` or `completed`), `created`, `completed`. The H1 is the title; anything after it is notes. Hand-edits are fine as long as those keys stay put. Markdown files without that frontmatter are skipped (with a warning) so a stray note cannot brick the store.

## Tests

```bash
npm test
```

Zero runtime dependencies. Tests use Node's built-in test runner.

## License

MIT © 78tacos
