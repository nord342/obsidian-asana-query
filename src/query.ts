export class QueryError extends Error {}

export interface AsanaQuery {
	project?: string;
	section?: string;
	assignee?: string;
	workspace?: string;
	due?: string;
	completed: boolean;
	limit: number;
	sort: "due" | "name" | "none";
	group: "section" | "none";
	myTasks: boolean;
}

const BOOL_TRUE = new Set(["true", "yes", "1"]);
const BOOL_FALSE = new Set(["false", "no", "0"]);

function parseBool(key: string, value: string): boolean {
	const v = value.toLowerCase();
	if (BOOL_TRUE.has(v)) return true;
	if (BOOL_FALSE.has(v)) return false;
	throw new QueryError(`\`${key}\` must be true or false, got "${value}".`);
}

export function parseQuery(source: string): AsanaQuery {
	const query: AsanaQuery = {
		completed: false,
		limit: 25,
		sort: "due",
		group: "none",
		myTasks: false,
	};
	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
		if (!match || !match[2]) {
			throw new QueryError(
				`Can't parse line "${line}". Expected \`key: value\`.`
			);
		}
		const key = match[1].toLowerCase();
		const value = match[2].trim();
		switch (key) {
			case "project":
				query.project = value;
				break;
			case "section":
				query.section = value;
				break;
			case "assignee":
				query.assignee = value;
				break;
			case "workspace":
				query.workspace = value;
				break;
			case "due":
				query.due = value.toLowerCase();
				break;
			case "completed":
				query.completed = parseBool(key, value);
				break;
			case "my-tasks":
			case "mytasks":
				query.myTasks = parseBool(key, value);
				break;
			case "limit": {
				const n = parseInt(value, 10);
				if (isNaN(n) || n < 1 || n > 500) {
					throw new QueryError("`limit` must be a number between 1 and 500.");
				}
				query.limit = n;
				break;
			}
			case "sort":
				if (value !== "due" && value !== "name" && value !== "none") {
					throw new QueryError("`sort` must be due, name, or none.");
				}
				query.sort = value;
				break;
			case "group":
				if (value !== "section" && value !== "none") {
					throw new QueryError("`group` must be section or none.");
				}
				query.group = value;
				break;
			default:
				throw new QueryError(
					`Unknown key \`${key}\`. Valid keys: project, section, assignee, workspace, due, completed, my-tasks, limit, sort, group.`
				);
		}
	}
	if (!query.myTasks && !query.project) {
		throw new QueryError(
			"Query needs either `project: <name>` or `my-tasks: true`."
		);
	}
	return query;
}

export function isoDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number): string {
	const d = new Date(base);
	d.setDate(d.getDate() + days);
	return isoDate(d);
}

/** End of the current week (upcoming Sunday, or today if today is Sunday). */
function endOfWeek(base: Date): string {
	const d = new Date(base);
	const day = d.getDay(); // 0 = Sunday
	d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
	return isoDate(d);
}

export function dueMatches(dueOn: string | null, spec: string, now: Date): boolean {
	const today = isoDate(now);
	if (spec === "none") return dueOn === null;
	if (spec === "any") return dueOn !== null;
	if (dueOn === null) return false;
	switch (spec) {
		case "today":
			return dueOn === today;
		case "tomorrow":
			return dueOn === addDays(now, 1);
		case "overdue":
			return dueOn < today;
		case "today-or-overdue":
			return dueOn <= today;
		case "this-week":
			return dueOn >= today && dueOn <= endOfWeek(now);
		case "next-7-days":
			return dueOn >= today && dueOn <= addDays(now, 6);
		default: {
			const before = spec.match(/^before\s+(\d{4}-\d{2}-\d{2})$/);
			if (before) return dueOn < before[1];
			if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) return dueOn === spec;
			throw new QueryError(
				`Unknown \`due\` value "${spec}". Use today, tomorrow, overdue, today-or-overdue, this-week, next-7-days, none, any, YYYY-MM-DD, or before YYYY-MM-DD.`
			);
		}
	}
}
