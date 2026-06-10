import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AsanaQueryPlugin from "./main";

export interface AsanaQuerySettings {
	token: string;
	defaultWorkspaceGid: string;
	defaultWorkspaceName: string;
	cacheMinutes: number;
}

export const DEFAULT_SETTINGS: AsanaQuerySettings = {
	token: "",
	defaultWorkspaceGid: "",
	defaultWorkspaceName: "",
	cacheMinutes: 5,
};

export class AsanaSettingTab extends PluginSettingTab {
	plugin: AsanaQueryPlugin;

	constructor(app: App, plugin: AsanaQueryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Personal access token")
			.setDesc(
				createFragment((frag) => {
					frag.appendText("Create one at ");
					frag.createEl("a", {
						text: "app.asana.com/0/my-apps",
						href: "https://app.asana.com/0/my-apps",
					});
					frag.appendText(
						". The token is stored locally in your vault's plugin data."
					);
				})
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("1/1234567890:abcdef…")
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						this.plugin.client.clearCache();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default workspace")
			.setDesc(
				this.plugin.settings.defaultWorkspaceName
					? `Currently: ${this.plugin.settings.defaultWorkspaceName}`
					: "Connect to load your workspaces. Queries use this workspace unless they set `workspace:`."
			)
			.addButton((button) =>
				button
					.setButtonText("Connect & load workspaces")
					.setCta()
					.onClick(async () => {
						try {
							const me = await this.plugin.client.me();
							const workspaces = await this.plugin.client.workspaces(true);
							new Notice(`Connected to Asana as ${me.name}`);
							if (
								!this.plugin.settings.defaultWorkspaceGid &&
								workspaces.length > 0
							) {
								this.plugin.settings.defaultWorkspaceGid = workspaces[0].gid;
								this.plugin.settings.defaultWorkspaceName = workspaces[0].name;
								await this.plugin.saveSettings();
							}
							this.workspaces = workspaces;
							this.display();
						} catch (e) {
							new Notice(e instanceof Error ? e.message : String(e));
						}
					})
			);

		if (this.workspaces.length > 0) {
			new Setting(containerEl)
				.setName("Choose workspace")
				.addDropdown((dropdown) => {
					for (const ws of this.workspaces) {
						dropdown.addOption(ws.gid, ws.name);
					}
					dropdown
						.setValue(this.plugin.settings.defaultWorkspaceGid)
						.onChange(async (gid) => {
							const ws = this.workspaces.find((w) => w.gid === gid);
							this.plugin.settings.defaultWorkspaceGid = gid;
							this.plugin.settings.defaultWorkspaceName = ws?.name ?? "";
							this.plugin.client.clearCache("tasks:");
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName("Cache duration (minutes)")
			.setDesc(
				"How long task results are reused before fetching from Asana again. Use the refresh button on any block to bypass the cache."
			)
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.cacheMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cacheMinutes = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private workspaces: { gid: string; name: string }[] = [];
}
