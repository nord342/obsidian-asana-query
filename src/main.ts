import { Editor, Notice, Plugin } from "obsidian";
import { AsanaClient, AsanaTask } from "./api";
import { AsanaQuery, dueMatches, parseQuery, QueryError } from "./query";
import { renderError, renderLoading, renderTasks } from "./render";
import {
	AsanaQuerySettings,
	AsanaSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";

export default class AsanaQueryPlugin extends Plugin {
	settings: AsanaQuerySettings;
	client: AsanaClient;

	async onload() {
		await this.loadSettings();
		this.client = new AsanaClient(
			() => this.settings.token,
			() => this.settings.cacheMinutes * 60_000
		);

		this.addSettingTab(new AsanaSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("asana", (source, el) => {
			void this.runBlock(source, el);
		});

		this.addCommand({
			id: "insert-project-block",
			name: "Insert project task list",
			editorCallback: (editor: Editor) => {
				this.insertBlock(editor, [
					"project: Project name",
					"due: this-week",
				]);
			},
		});

		this.addCommand({
			id: "insert-my-tasks-block",
			name: "Insert my tasks due today",
			editorCallback: (editor: Editor) => {
				this.insertBlock(editor, [
					"my-tasks: true",
					"due: today-or-overdue",
				]);
			},
		});
	}

	private insertBlock(editor: Editor, lines: string[]) {
		const fence = "```";
		editor.replaceSelection(
			`${fence}asana\n${lines.join("\n")}\n${fence}\n`
		);
	}

	async runBlock(source: string, el: HTMLElement, force = false) {
		let query: AsanaQuery;
		try {
			query = parseQuery(source);
		} catch (e) {
			renderError(el, e instanceof Error ? e.message : String(e));
			return;
		}
		renderLoading(el);
		try {
			const { title, tasks } = await this.fetchTasks(query, force);
			renderTasks(el, title, tasks, query, {
				onToggle: async (task: AsanaTask, completed: boolean) => {
					try {
						await this.client.setCompleted(task.gid, completed);
						new Notice(
							completed ? "Completed in Asana" : "Reopened in Asana"
						);
					} catch (e) {
						new Notice(e instanceof Error ? e.message : String(e));
						throw e;
					}
					await this.runBlock(source, el, true);
				},
				onRefresh: () => void this.runBlock(source, el, true),
			});
		} catch (e) {
			renderError(el, e instanceof Error ? e.message : String(e));
		}
	}

	private async resolveWorkspace(query: AsanaQuery): Promise<string> {
		if (query.workspace) {
			const workspaces = await this.client.workspaces();
			const needle = query.workspace.toLowerCase();
			const match = workspaces.find(
				(w) => w.name.toLowerCase() === needle
			);
			if (!match) {
				throw new QueryError(
					`No workspace named "${query.workspace}". Available: ${workspaces
						.map((w) => w.name)
						.join(", ")}.`
				);
			}
			return match.gid;
		}
		if (this.settings.defaultWorkspaceGid) {
			return this.settings.defaultWorkspaceGid;
		}
		const workspaces = await this.client.workspaces();
		if (workspaces.length === 1) return workspaces[0].gid;
		throw new QueryError(
			"No default workspace set. Pick one in Settings → Asana Query, or add `workspace: <name>` to the query."
		);
	}

	private async fetchTasks(
		query: AsanaQuery,
		force: boolean
	): Promise<{ title: string; tasks: AsanaTask[] }> {
		const workspaceGid = await this.resolveWorkspace(query);
		let tasks: AsanaTask[];
		let title: string;
		if (query.myTasks) {
			tasks = await this.client.myTasks(workspaceGid, query.completed, force);
			title = "My tasks";
		} else {
			const project = await this.client.findProject(
				workspaceGid,
				query.project as string
			);
			tasks = await this.client.projectTasks(
				project.gid,
				query.completed,
				force
			);
			title = project.name;
		}

		tasks = tasks.filter((t) => t.completed === query.completed);

		if (query.assignee) {
			if (query.assignee.toLowerCase() === "me") {
				const me = await this.client.me();
				tasks = tasks.filter((t) => t.assignee?.gid === me.gid);
			} else {
				const needle = query.assignee.toLowerCase();
				tasks = tasks.filter((t) =>
					t.assignee?.name.toLowerCase().includes(needle)
				);
			}
		}

		if (query.section) {
			const needle = query.section.toLowerCase();
			tasks = tasks.filter((t) =>
				(t.memberships ?? []).some((m) =>
					m.section?.name?.toLowerCase().includes(needle)
				)
			);
		}

		if (query.due) {
			const now = new Date();
			tasks = tasks.filter((t) => dueMatches(t.due_on, query.due as string, now));
		}

		if (query.sort === "due") {
			tasks.sort((a, b) => {
				if (a.due_on === b.due_on) return a.name.localeCompare(b.name);
				if (a.due_on === null) return 1;
				if (b.due_on === null) return -1;
				return a.due_on < b.due_on ? -1 : 1;
			});
		} else if (query.sort === "name") {
			tasks.sort((a, b) => a.name.localeCompare(b.name));
		}

		return { title, tasks: tasks.slice(0, query.limit) };
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
