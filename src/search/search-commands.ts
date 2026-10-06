import {MarkdownView} from 'obsidian';
import {StateEffect} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {togglePanel, setSearchQuery, searchStateField} from './search-state';
import {forgetReadingViewSwitch, getReadingViewSelection, switchToEditingView} from './reading-view';
import {getReadingSearch, openReadingSearch, ReadingSearch} from './reading-search';
import {goToNext, goToPrev, revealMatch, SearchOption, toggleOption} from './search-actions';
import {ObsidianEditor, SearchPlugin} from '../types';

function getActiveMarkdownView(plugin: SearchPlugin): MarkdownView | null {
	return plugin.app.workspace.getActiveViewOfType(MarkdownView);
}

/**
 * 打开查找浮窗。
 * - 编辑视图：浮窗挂在编辑器上。
 * - 阅读视图 + 查找：直接在阅读视图里查找，不切换模式。
 * - 阅读视图 + 替换：替换需要编辑源码，先切到编辑视图，关闭浮窗时再切回。
 *
 * seed：预填的搜索词；不传则使用当前选区。
 */
async function openSearchPanel(plugin: SearchPlugin, showReplace: boolean, seed?: string) {
	const activeView = getActiveMarkdownView(plugin);
	if (!activeView) return;

	const editor = activeView.editor;
	const cmView = (editor as ObsidianEditor).cm;
	if (!cmView) {
		console.error('VSCode Search: CodeMirror view not found');
		return;
	}

	let selection: string;
	if (activeView.getMode() === 'preview') {
		selection = seed ?? getReadingViewSelection(activeView);
		if (!showReplace && openSearchInReadingView(plugin, activeView, cmView, selection)) return;

		// 阅读视图下编辑器被隐藏，面板无法显示：先切到编辑视图，关闭面板时再切回。
		getReadingSearch(activeView)?.close(false);
		await switchToEditingView(activeView, cmView);
	} else {
		selection = seed ?? editor.getSelection();
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
}

/** 在阅读视图中打开查找；搜索选项与该笔记的编辑器共享。渲染器不可用时返回 false。 */
function openSearchInReadingView(plugin: SearchPlugin, view: MarkdownView, cmView: EditorView, seed: string): boolean {
	const {caseSensitive, wholeWord, useRegex} = cmView.state.field(searchStateField).query;
	return openReadingSearch(plugin.app, view, seed, {caseSensitive, wholeWord, useRegex}, plugin.panelLayout, {
		onOptionsChange: (query) => {
			cmView.dispatch({
				effects: setSearchQuery.of({
					caseSensitive: query.caseSensitive,
					wholeWord: query.wholeWord,
					useRegex: query.useRegex,
				}),
			});
		},
		onRequestReplace: (searchTerm) => {
			getReadingSearch(view)?.close(false);
			void openSearchPanel(plugin, true, searchTerm);
		},
	});
}

/** 当前活动的阅读视图中已打开的查找浮窗。 */
function getActiveReadingSearch(plugin: SearchPlugin): ReadingSearch | null {
	const activeView = getActiveMarkdownView(plugin);
	if (!activeView || activeView.getMode() !== 'preview') return null;
	return getReadingSearch(activeView) ?? null;
}

/** 当前处于编辑视图、且搜索面板已打开的编辑器。 */
function getEditorWithOpenPanel(plugin: SearchPlugin): EditorView | null {
	const activeView = getActiveMarkdownView(plugin);
	if (!activeView || activeView.getMode() !== 'source') return null;
	const cmView = (activeView.editor as ObsidianEditor).cm;
	if (!cmView || !cmView.state.field(searchStateField).panelVisible) return null;
	return cmView;
}

/** 与 VS Code 一致：面板未打开时先打开面板（用选区预填），并跳到最近的匹配。 */
async function findNextOrPrevious(plugin: SearchPlugin, direction: 'next' | 'previous') {
	const readingSearch = getActiveReadingSearch(plugin);
	if (readingSearch) {
		if (direction === 'next') readingSearch.next();
		else readingSearch.prev();
		return;
	}

	const cmView = getEditorWithOpenPanel(plugin);
	if (cmView) {
		if (direction === 'next') goToNext(cmView);
		else goToPrev(cmView);
		return;
	}

	await openSearchPanel(plugin, false);

	// 在阅读视图中打开：当前匹配是选区本身，或视口内的第一个匹配。
	// - 向后：当前匹配就是选区时跳到下一个，否则停在当前匹配；
	// - 向前：总是跳到它前面那一个。
	const openedReadingSearch = getActiveReadingSearch(plugin);
	if (openedReadingSearch) {
		if (direction === 'previous') openedReadingSearch.prev();
		else if (openedReadingSearch.isCurrentAtSeed()) openedReadingSearch.next();
		return;
	}

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

export function registerSearchCommands(plugin: SearchPlugin) {

	plugin.addCommand({
		// 注意：Obsidian 会自动把命令 id 前缀为 manifest.json 里的 plugin id。
		// 这里不要再手动拼 "pluginId:xxx"，否则可能导致命令面板里不可见/不可检索。
		id: 'find',
		name: 'Find',
		// 用 checkCallback 而不是 editorCallback：editorCallback 在阅读视图下不可用。
		checkCallback: (checking: boolean) => {
			if (!getActiveMarkdownView(plugin)) return false;
			if (!checking) void openSearchPanel(plugin, false);
			return true;
		}
	});

	plugin.addCommand({
		id: 'find-and-replace',
		name: 'Find and replace',
		checkCallback: (checking: boolean) => {
			if (!getActiveMarkdownView(plugin)) return false;
			if (!checking) void openSearchPanel(plugin, true);
			return true;
		}
	});

	plugin.addCommand({
		id: 'find-next',
		name: 'Find next',
		checkCallback: (checking: boolean) => {
			if (!getActiveMarkdownView(plugin)) return false;
			if (!checking) void findNextOrPrevious(plugin, 'next');
			return true;
		}
	});

	plugin.addCommand({
		id: 'find-previous',
		name: 'Find previous',
		checkCallback: (checking: boolean) => {
			if (!getActiveMarkdownView(plugin)) return false;
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
				const readingSearch = getActiveReadingSearch(plugin);
				const cmView = getEditorWithOpenPanel(plugin);
				if (!readingSearch && !cmView) return false;
				if (!checking) {
					if (readingSearch) readingSearch.toggleOption(option);
					else if (cmView) toggleOption(cmView, option);
				}
				return true;
			}
		});
	}
}
