import { requestUrl } from "obsidian";

export interface AsanaUser {
	gid: string;
	name: string;
}

export interface AsanaWorkspace {
	gid: string;
	name: string;
}

export interface AsanaProject {
	gid: string;
	name: string;
}

export interface AsanaMembership {
	project?: { gid: string; name: string } | null;
	section?: { gid: string; name: string } | null;
}

export interface AsanaTask {
	gid: string;
	name: string;
	completed: boolean;
	due_on: string | null;
	permalink_url: string;
	assignee: AsanaUser | null;
	memberships: AsanaMembership[];
}

const API_BASE = "https://app.asana.com/api/1.0";
const TASK_FIELDS =
	"name,completed,due_on,permalink_url,assignee.name,memberships.section.name,memberships.project.name";
const MAX_PAGES = 5;
const PAGE_SIZE = "100";

export class AsanaApiError extends Error {}

interface RawResponse {
	data: unknown;
	next_page?: { offset: string } | null;
}

export class AsanaClient {
	private cache = new Map<string, { at: number; data: unknown }>();

	constructor(
		private getToken: () => string,
		private getCacheTtlMs: () => number
	) {}

	clearCache(prefix?: string) {
		if (!prefix) {
			this.cache.clear();
			return;
		}
		for (const key of [...this.cache.keys()]) {
			if (key.startsWith(prefix)) this.cache.delete(key);
		}
	}

	private async raw(
		path: string,
		params?: Record<string, string>,
		method = "GET",
		body?: object
	): Promise<RawResponse> {
		const token = this.getToken();
		if (!token) {
			throw new AsanaApiError(
				"No Asana personal access token configured. Add one in Settings → Asana Query."
			);
		}
		const qs = params ? "?" + new URLSearchParams(params).toString() : "";
		const res = await requestUrl({
			url: API_BASE + path + qs,
			method,
			throw: false,
			contentType: "application/json",
			headers: { Authorization: `Bearer ${token}` },
			body: body ? JSON.stringify({ data: body }) : undefined,
		});
		if (res.status === 401) {
			throw new AsanaApiError(
				"Asana rejected the access token (401). Check it in Settings → Asana Query."
			);
		}
		if (res.status >= 400) {
			let message = `Asana API error (${res.status})`;
			try {
				const errors = (res.json as { errors?: { message?: string }[] })
					?.errors;
				if (errors?.[0]?.message) message += `: ${errors[0].message}`;
			} catch {
				// keep the generic message
			}
			throw new AsanaApiError(message);
		}
		return res.json as RawResponse;
	}

	private async paged<T>(
		path: string,
		params: Record<string, string>
	): Promise<T[]> {
		const items: T[] = [];
		let offset: string | undefined;
		for (let page = 0; page < MAX_PAGES; page++) {
			const pageParams: Record<string, string> = {
				...params,
				limit: PAGE_SIZE,
			};
			if (offset) pageParams.offset = offset;
			const res = await this.raw(path, pageParams);
			items.push(...(res.data as T[]));
			if (!res.next_page?.offset) break;
			offset = res.next_page.offset;
		}
		return items;
	}

	private async cached<T>(
		key: string,
		fetcher: () => Promise<T>,
		force = false
	): Promise<T> {
		const ttl = this.getCacheTtlMs();
		const hit = this.cache.get(key);
		if (!force && hit && Date.now() - hit.at < ttl) return hit.data as T;
		const data = await fetcher();
		this.cache.set(key, { at: Date.now(), data });
		return data;
	}

	async me(): Promise<AsanaUser> {
		return this.cached("me", async () => {
			const res = await this.raw("/users/me", { opt_fields: "name" });
			return res.data as AsanaUser;
		});
	}

	async workspaces(force = false): Promise<AsanaWorkspace[]> {
		return this.cached(
			"workspaces",
			() => this.paged<AsanaWorkspace>("/workspaces", { opt_fields: "name" }),
			force
		);
	}

	async findProject(
		workspaceGid: string,
		name: string
	): Promise<AsanaProject> {
		const needle = name.toLowerCase();
		return this.cached(`project:${workspaceGid}:${needle}`, async () => {
			const res = await this.raw(`/workspaces/${workspaceGid}/typeahead`, {
				resource_type: "project",
				query: name,
				opt_fields: "name",
				count: "20",
			});
			const projects = res.data as AsanaProject[];
			const exact = projects.find((p) => p.name.toLowerCase() === needle);
			const partial = projects.find((p) =>
				p.name.toLowerCase().includes(needle)
			);
			const match = exact ?? partial ?? projects[0];
			if (!match) {
				throw new AsanaApiError(
					`No Asana project matching "${name}" found in this workspace.`
				);
			}
			return match;
		});
	}

	async projectTasks(
		projectGid: string,
		includeCompleted: boolean,
		force = false
	): Promise<AsanaTask[]> {
		const params: Record<string, string> = {
			project: projectGid,
			opt_fields: TASK_FIELDS,
		};
		if (!includeCompleted) params.completed_since = "now";
		return this.cached(
			`tasks:project:${projectGid}:${includeCompleted}`,
			() => this.paged<AsanaTask>("/tasks", params),
			force
		);
	}

	private async myTaskListGid(workspaceGid: string): Promise<string> {
		return this.cached(`utl:${workspaceGid}`, async () => {
			const res = await this.raw("/users/me/user_task_lists", {
				workspace: workspaceGid,
			});
			return (res.data as { gid: string }).gid;
		});
	}

	async myTasks(
		workspaceGid: string,
		includeCompleted: boolean,
		force = false
	): Promise<AsanaTask[]> {
		const listGid = await this.myTaskListGid(workspaceGid);
		const params: Record<string, string> = { opt_fields: TASK_FIELDS };
		if (!includeCompleted) params.completed_since = "now";
		return this.cached(
			`tasks:mytasks:${listGid}:${includeCompleted}`,
			() => this.paged<AsanaTask>(`/user_task_lists/${listGid}/tasks`, params),
			force
		);
	}

	async setCompleted(taskGid: string, completed: boolean): Promise<void> {
		await this.raw(`/tasks/${taskGid}`, undefined, "PUT", { completed });
		this.clearCache("tasks:");
	}
}
