import {Plugin, MarkdownView} from 'obsidian';
import {StateEffect} from '@codemirror/state';
import {togglePanel, setSearchQuery, searchStateField} from './search-state';
import {forgetReadingViewSwitch, getReadingViewSelection, switchToEditingView} from './reading-view';
import {ObsidianEditor, ObsidianApp} from '../types';

async function openSearchPanel(plugin: Plugin, showReplace: boolean) {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		console.error('Enhanced Search Replace: 没有活动的 Markdown 视图');
		return;
	}

	const editor = activeView.editor;
	const cmView = (editor as ObsidianEditor).cm;
	if (cmView) {
		let selection: string;
		if (activeView.getMode() === 'preview') {
			// 阅读视图下编辑器被隐藏，面板无法显示：先切到编辑视图，关闭面板时再切回。
			selection = getReadingViewSelection(activeView);
			await switchToEditingView(activeView, cmView);
		} else {
			selection = editor.getSelection();
			if (!cmView.state.field(searchStateField).panelVisible) {
				forgetReadingViewSwitch(cmView);
			}
		}

		// 合并为一次 dispatch：保证面板创建时就能读到最新 query，且避免 UI 需要额外交互才刷新。
		const effects: StateEffect<unknown>[] = [togglePanel.of({visible: true, showReplace})];
		if (selection) {
			effects.push(
				// 只更新 searchTerm，避免覆盖用户已有的 replaceTerm/选项
				setSearchQuery.of({searchTerm: selection})
			);
		}

		cmView.dispatch({effects});
	} else {
		console.error('Enhanced Search Replace: 未找到 CodeMirror view');
	}
}

export function registerSearchCommands(plugin: Plugin) {

	plugin.addCommand({
		// 注意：Obsidian 会自动把命令 id 前缀为 manifest.json 里的 plugin id。
		// 这里不要再手动拼 "pluginId:xxx"，否则可能导致命令面板里不可见/不可检索。
		id: 'find',
		name: 'Find',
		// 用 checkCallback 而不是 editorCallback：editorCallback 在阅读视图下不可用。
		checkCallback: (checking: boolean) => {
			if (!plugin.app.workspace.getActiveViewOfType(MarkdownView)) return false;
			if (!checking) void openSearchPanel(plugin, false);
			return true;
		}
	});

	plugin.addCommand({
		id: 'find-and-replace',
		name: 'Find and replace',
		checkCallback: (checking: boolean) => {
			if (!plugin.app.workspace.getActiveViewOfType(MarkdownView)) return false;
			if (!checking) void openSearchPanel(plugin, true);
			return true;
		}
	});

	// 额外校验：打印当前已注册的命令 key（方便确认 Obsidian 是否真正收到了命令）。
	try {
		const commands = (plugin.app as ObsidianApp)?.commands?.commands;
		if (commands && typeof commands === 'object') {
			const keys = Object.keys(commands).filter((k) => k.includes('enhanced-search-replace'));
			console.debug('Enhanced Search Replace: 已注册命令 keys =', keys);
		}
	} catch (e) {
		console.error('Enhanced Search Replace: 打印已注册命令 keys 失败', e);
	}
}
