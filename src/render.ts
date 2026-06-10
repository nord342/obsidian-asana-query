import { setIcon } from "obsidian";
import { AsanaTask } from "./api";
import { AsanaQuery, isoDate } from "./query";

export interface RenderCallbacks {
	onToggle: (task: AsanaTask, completed: boolean) => Promise<void>;
	onRefresh: () => void;
}

export function renderError(el: HTMLElement, message: string) {
	el.empty();
	el.createDiv({ cls: "asana-query asana-query-error", text: message });
}

export function renderLoading(el: HTMLElement) {
	el.empty();
	el.createDiv({
		cls: "asana-query asana-query-loading",
		text: "Loading Asana tasks…",
	});
}

function dueBadge(parent: HTMLElement, dueOn: string, now: Date) {
	const today = isoDate(now);
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	let cls = "asana-due";
	let text: string;
	if (dueOn < today) {
		cls += " asana-due-overdue";
		text = formatDate(dueOn);
	} else if (dueOn === today) {
		cls += " asana-due-today";
		text = "Today";
	} else if (dueOn === isoDate(tomorrow)) {
		text = "Tomorrow";
	} else {
		text = formatDate(dueOn);
	}
	parent.createSpan({ cls, text });
}

function formatDate(dueOn: string): string {
	const [y, m, d] = dueOn.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: sameYear ? undefined : "numeric",
	});
}

function renderItem(
	list: HTMLElement,
	task: AsanaTask,
	callbacks: RenderCallbacks,
	now: Date
) {
	const item = list.createEl("li", { cls: "asana-task" });
	const checkbox = item.createEl("input", {
		type: "checkbox",
		cls: "asana-task-checkbox",
	});
	checkbox.checked = task.completed;
	checkbox.addEventListener("change", async () => {
		checkbox.disabled = true;
		try {
			await callbacks.onToggle(task, checkbox.checked);
		} catch (e) {
			checkbox.checked = task.completed;
			checkbox.disabled = false;
			throw e;
		}
	});
	const link = item.createEl("a", {
		cls: "asana-task-name" + (task.completed ? " asana-task-completed" : ""),
		text: task.name,
		href: task.permalink_url,
	});
	link.setAttr("target", "_blank");
	link.setAttr("rel", "noopener");
	if (task.due_on) dueBadge(item, task.due_on, now);
	if (task.assignee) {
		item.createSpan({ cls: "asana-assignee", text: task.assignee.name });
	}
}

function sectionOf(task: AsanaTask): string {
	for (const membership of task.memberships ?? []) {
		if (membership.section?.name) return membership.section.name;
	}
	return "No section";
}

export function renderTasks(
	el: HTMLElement,
	title: string,
	tasks: AsanaTask[],
	query: AsanaQuery,
	callbacks: RenderCallbacks
) {
	el.empty();
	el.addClass("asana-query");
	const now = new Date();

	const header = el.createDiv({ cls: "asana-query-header" });
	const logo = header.createSpan({ cls: "asana-query-logo" });
	setIcon(logo, "circle-dot");
	header.createSpan({ cls: "asana-query-title", text: title });
	header.createSpan({
		cls: "asana-query-count",
		text: `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
	});
	const refresh = header.createEl("button", {
		cls: "asana-query-refresh clickable-icon",
		attr: { "aria-label": "Refresh from Asana" },
	});
	setIcon(refresh, "refresh-cw");
	refresh.addEventListener("click", () => callbacks.onRefresh());

	if (tasks.length === 0) {
		el.createDiv({
			cls: "asana-query-empty",
			text: "No tasks match this query.",
		});
		return;
	}

	if (query.group === "section") {
		const groups = new Map<string, AsanaTask[]>();
		for (const task of tasks) {
			const section = sectionOf(task);
			const group = groups.get(section) ?? [];
			group.push(task);
			groups.set(section, group);
		}
		for (const [section, sectionTasks] of groups) {
			el.createDiv({ cls: "asana-query-section", text: section });
			const list = el.createEl("ul", { cls: "asana-task-list" });
			for (const task of sectionTasks) renderItem(list, task, callbacks, now);
		}
	} else {
		const list = el.createEl("ul", { cls: "asana-task-list" });
		for (const task of tasks) renderItem(list, task, callbacks, now);
	}
}
