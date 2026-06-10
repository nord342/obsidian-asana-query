# Asana Query for Obsidian

Embed **live Asana tasks** in your Obsidian notes with simple query code blocks — the way [Dataview](https://github.com/blacksmithgu/obsidian-dataview) queries your vault, or [Jira Issue](https://github.com/marc0l92/obsidian-jira-issue) embeds Jira tickets.

No imported files, no vault clutter, no one-way "sync" dumps. Your notes query Asana directly, render the results inline, and let you **complete tasks right from the note** — the checkbox updates Asana.

```asana
project: Website Redesign
assignee: me
due: this-week
group: section
```

That block renders as a live, grouped task list with checkboxes, due-date badges, and links back to each task in Asana.

## Why this instead of the other Asana plugins?

Existing Obsidian ↔ Asana plugins either *create* tasks from selected text, or *import* tasks as Markdown files into your vault. Asana Query takes the opposite approach:

- **Asana stays the source of truth.** Nothing is written into your vault.
- **Queries live in templates.** Drop a `my-tasks` block into your daily-note template and every daily note shows what's actually due that day.
- **Two-way where it matters.** Ticking a checkbox completes the task in Asana (and unticking reopens it).

## Setup

1. Install the plugin and enable it.
2. Create an Asana **personal access token** at [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps).
3. In **Settings → Asana Query**, paste the token and click **Connect & load workspaces**, then pick your default workspace.

Works on desktop and mobile. The token is stored locally in your vault's plugin data folder — keep that in mind if you sync your vault to untrusted locations.

## Writing queries

Add a code block with the `asana` language:

````markdown
```asana
my-tasks: true
due: today-or-overdue
```
````

Every query needs either `project: <name>` or `my-tasks: true`. All other keys are optional:

| Key | Values | Default | What it does |
| --- | --- | --- | --- |
| `project` | project name | — | Tasks from this project (fuzzy name match) |
| `my-tasks` | `true` / `false` | `false` | Tasks from your Asana "My Tasks" list |
| `section` | section name | — | Only tasks in a matching section |
| `assignee` | `me` or a person's name | — | Only tasks assigned to this person |
| `due` | see below | — | Filter by due date |
| `completed` | `true` / `false` | `false` | Show completed instead of open tasks |
| `workspace` | workspace name | settings default | Override the default workspace |
| `sort` | `due`, `name`, `none` | `due` | Sort order |
| `group` | `section`, `none` | `none` | Group tasks under section headings |
| `limit` | 1–500 | `25` | Max tasks to show |

### `due` values

`today` · `tomorrow` · `overdue` · `today-or-overdue` · `this-week` (through Sunday) · `next-7-days` · `none` (no due date) · `any` (has a due date) · `2026-07-01` (exact date) · `before 2026-07-01`

### Examples

Daily-note template — what needs my attention today:

````markdown
```asana
my-tasks: true
due: today-or-overdue
```
````

Project dashboard note, grouped like the Asana board:

````markdown
```asana
project: Q3 Marketing Launch
group: section
limit: 100
```
````

What did I ship this week (completed tasks):

````markdown
```asana
my-tasks: true
completed: true
limit: 50
```
````

A teammate's plate before a 1:1:

````markdown
```asana
project: Platform Team
assignee: Jane
due: next-7-days
```
````

## Commands

- **Asana Query: Insert project task list** — inserts a starter `project:` block at the cursor.
- **Asana Query: Insert my tasks due today** — inserts a `my-tasks` block at the cursor.

## Notes & limits

- Results are cached (default 5 minutes, configurable). The ↻ button on any block fetches fresh data.
- Uses only standard Asana API endpoints — no Asana premium/paid plan required.
- Project name resolution uses Asana's typeahead: an exact name match wins, otherwise the closest match is used.

## Installation (until it's in the community plugin directory)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/nord342/obsidian-asana-query/releases).
2. Put them in `<your vault>/.obsidian/plugins/asana-query/`.
3. Reload Obsidian and enable **Asana Query** under Community plugins.

Or install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with the repo path `nord342/obsidian-asana-query`.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # type-check + production build
```

## Roadmap

- Paste an Asana task URL → render an inline task chip
- Create a task in Asana from the current line
- Custom fields and tags in query filters

## License

[MIT](LICENSE)
