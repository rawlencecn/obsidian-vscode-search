import {Plugin, MarkdownView} from 'obsidian';
import {StateEffect} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {togglePanel, setSearchQuery, searchStateField} from './search-state';
import {forgetReadingViewSwitch, getReadingViewSelection, switchToEditingView} from './reading-view';
import {goToNext, goToPrev, revealMatch, SearchOption, toggleOption} from './search-actions';
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

/** 当前处于编辑视图、且搜索面板已打开的编辑器。 */
function getEditorWithOpenPanel(plugin: Plugin): EditorView | null {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView || activeView.getMode() !== 'source') return null;
	const cmView = (activeView.editor as ObsidianEditor).cm;
	if (!cmView || !cmView.state.field(searchStateField).panelVisible) return null;
	return cmView;
}

/** 与 VS Code 一致：面板未打开时先打开面板（用选区预填），并跳到最近的匹配。 */
async function findNextOrPrevious(plugin: Plugin, direction: 'next' | 'previous') {
	const cmView = getEditorWithOpenPanel(plugin);
	if (cmView) {
		if (direction === 'next') goToNext(cmView);
		else goToPrev(cmView);
		return;
	}

	await openSearchPanel(plugin, false);
	const opened = getEditorWithOpenPanel(plugin);
	if (!opened) return;
	const state = opened.state.field(searchStateField);
	const current = state.matches[state.currentMatchIndex];
	if (!current) return;

	// 当前匹配是光标之后（或选区本身）的第一个：
	// - 向后：选区本身就是当前匹配时跳到下一个，否则跳到当前匹配；
	// - 向前：总是跳到它前面那一个。
	const selection = opened.state.selection.main;
	const selectionIsCurrent = current.from === selection.from && current.to === selection.to;
	if (direction === 'previous') goToPrev(opened);
	else if (selectionIsCurrent) goToNext(opened);
	else revealMatch(opened, state.currentMatchIndex);
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

	plugin.addCommand({
		id: 'find-next',
		name: 'Find next',
		checkCallback: (checking: boolean) => {
			if (!plugin.app.workspace.getActiveViewOfType(MarkdownView)) return false;
			if (!checking) void findNextOrPrevious(plugin, 'next');
			return true;
		}
	});

	plugin.addCommand({
		id: 'find-previous',
		name: 'Find previous',
		checkCallback: (checking: boolean) => {
			if (!plugin.app.workspace.getActiveViewOfType(MarkdownView)) return false;
			if (!checking) void findNextOrPrevious(plugin, 'previous');
			return true;
		}
	});

	const toggleCommands: {id: string; name: string; option: SearchOption}[] = [
		{id: 'toggle-match-case', name: 'Toggle match case', option: 'caseSensitive'},
		{id: 'toggle-whole-word', name: 'Toggle match whole word', option: 'wholeWord'},
		{id: 'toggle-regex', name: 'Toggle use regular expression', option: 'useRegex'},
	];
	for (const {id, name, option} of toggleCommands) {
		plugin.addCommand({
			id,
			name,
			checkCallback: (checking: boolean) => {
				const cmView = getEditorWithOpenPanel(plugin);
				if (!cmView) return false;
				if (!checking) toggleOption(cmView, option);
				return true;
			}
		});
	}

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
