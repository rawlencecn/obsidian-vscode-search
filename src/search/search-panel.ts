import {App, Platform, setIcon} from 'obsidian';
import {showPanel, Panel, EditorView} from '@codemirror/view';
import {searchStateField, setSearchQuery, setCurrentMatch, togglePanel, closeSearch} from './search-state';
import {goToNext, goToPrev, replaceAll, replaceCurrent, toggleOption} from './search-actions';
import {attachSearchKeymap} from './search-keymap';
import {SearchState} from '../types';

/** 按平台生成快捷键提示，例如 macOS 上是「⌥⌘C」，其他平台是「Alt+C」。 */
function shortcut(mac: string, other: string): string {
	return Platform.isMacOS ? mac : other;
}

function createIconButton(container: HTMLElement, icon: string, cls: string, title: string): HTMLButtonElement {
	const btn = container.createEl('button', {cls: ['vss-icon-btn', cls], attr: {type: 'button', 'aria-label': title}});
	setIcon(btn, icon);
	return btn;
}

function createToggleButton(container: HTMLElement, icon: string, cls: string, title: string): HTMLButtonElement {
	const btn = createIconButton(container, icon, cls, title);
	btn.addClass('vss-toggle-btn');
	return btn;
}

function createSearchPanel(app: App, view: EditorView): Panel {
	// 从编辑器所在的文档创建，兼容弹出窗口（popout window）。
	const dom = view.dom.ownerDocument.createElement('div');
	dom.className = 'vss-search-panel';

	let searchState: SearchState = view.state.field(searchStateField);

	const updateQuery = (newQuery: Parameters<typeof setSearchQuery.of>[0]) => {
		view.dispatch({effects: setSearchQuery.of(newQuery)});
	};

	const close = () => {
		view.dispatch({effects: closeSearch.of(null)});
		view.focus();
	};

	// 布局与 VS Code 的查找小部件一致：
	// [展开替换] [查找输入框 + 区分大小写/全词/正则] [计数] [上一个] [下一个] [关闭]
	//            [替换输入框]                       [替换] [全部替换]
	const toggleReplaceBtn = createIconButton(dom, 'lucide-chevron-right', 'vss-btn-toggle-replace', 'Toggle replace');
	const rows = dom.createDiv({cls: 'vss-rows'});

	const searchRow = rows.createDiv({cls: 'vss-row'});
	const searchInputBox = searchRow.createDiv({cls: 'vss-input-box'});
	const searchInput = searchInputBox.createEl('input', {
		cls: 'vss-search-input',
		attr: {type: 'text', placeholder: 'Find', spellcheck: 'false'}
	});
	searchInput.value = searchState.query.searchTerm;
	const findClearBtn = createIconButton(searchInputBox, 'lucide-x', 'vss-clear-btn', 'Clear');
	const caseSensitiveBtn = createToggleButton(searchInputBox, 'lucide-case-sensitive', 'vss-btn-case', `Match case (${shortcut('⌥⌘C', 'Alt+C')})`);
	const wholeWordBtn = createToggleButton(searchInputBox, 'lucide-whole-word', 'vss-btn-whole-word', `Match whole word (${shortcut('⌥⌘W', 'Alt+W')})`);
	const regexBtn = createToggleButton(searchInputBox, 'lucide-regex', 'vss-btn-regex', `Use regular expression (${shortcut('⌥⌘R', 'Alt+R')})`);

	caseSensitiveBtn.classList.toggle('active', searchState.query.caseSensitive);
	wholeWordBtn.classList.toggle('active', searchState.query.wholeWord);
	regexBtn.classList.toggle('active', searchState.query.useRegex);

	const searchControls = searchRow.createDiv({cls: 'vss-row-controls'});
	const matchCount = searchControls.createDiv({cls: 'vss-match-count'});
	const prevBtn = createIconButton(searchControls, 'lucide-arrow-up', 'vss-btn-prev', `Previous match (${shortcut('⇧Enter, ⇧⌘G', 'Shift+Enter, Shift+F3')})`);
	const nextBtn = createIconButton(searchControls, 'lucide-arrow-down', 'vss-btn-next', `Next match (${shortcut('Enter, ⌘G', 'Enter, F3')})`);
	const closeBtn = createIconButton(searchControls, 'lucide-x', 'vss-close-btn', 'Close (Escape)');

	const replaceRow = rows.createDiv({cls: 'vss-row'});
	replaceRow.toggleClass('vss-hidden', !searchState.showReplace);
	const replaceInputBox = replaceRow.createDiv({cls: 'vss-input-box'});
	const replaceInput = replaceInputBox.createEl('input', {
		cls: 'vss-search-input',
		attr: {type: 'text', placeholder: 'Replace', spellcheck: 'false'}
	});
	replaceInput.value = searchState.query.replaceTerm;
	const replaceClearBtn = createIconButton(replaceInputBox, 'lucide-x', 'vss-clear-btn', 'Clear');
	const replaceControls = replaceRow.createDiv({cls: 'vss-row-controls'});
	const replaceBtn = createIconButton(replaceControls, 'lucide-replace', 'vss-btn-replace', `Replace (${shortcut('⇧⌘1', 'Shift+Ctrl+1')})`);
	const replaceAllBtn = createIconButton(replaceControls, 'lucide-replace-all', 'vss-btn-replace-all', `Replace all (${shortcut('⌥⌘Enter', 'Ctrl+Alt+Enter')})`);

	// 与 VS Code 一致：打开替换模式且已有搜索词时，焦点直接进入替换框；否则进入搜索框。
	const focusInput = () => {
		const state = view.state.field(searchStateField);
		const input = state.showReplace && state.query.searchTerm ? replaceInput : searchInput;
		input.focus();
		input.select();
	};

	const syncReplaceToggle = (showReplace: boolean) => {
		replaceRow.toggleClass('vss-hidden', !showReplace);
		toggleReplaceBtn.toggleClass('is-expanded', showReplace);
		setIcon(toggleReplaceBtn, showReplace ? 'lucide-chevron-down' : 'lucide-chevron-right');
	};
	syncReplaceToggle(searchState.showReplace);

	const updateMatchCount = () => {
		const state = view.state.field(searchStateField);
		if (state.matches.length === 0) {
			matchCount.textContent = 'No results';
			matchCount.classList.add('is-empty');
		} else {
			const current = state.currentMatchIndex >= 0 ? state.currentMatchIndex + 1 : 0;
			matchCount.textContent = `${current} of ${state.matches.length}`;
			matchCount.classList.remove('is-empty');
		}
	};

	// 输入框为空时隐藏清空按钮（占位保留，避免其他按钮跳动）。
	const syncClearButtons = () => {
		findClearBtn.toggleClass('vss-invisible', !searchInput.value);
		replaceClearBtn.toggleClass('vss-invisible', !replaceInput.value);
	};

	updateMatchCount();
	syncClearButtons();

	// 避免点击清空按钮导致输入框失焦
	findClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
	replaceClearBtn.addEventListener('mousedown', (e) => e.preventDefault());

	findClearBtn.addEventListener('click', () => {
		updateQuery({searchTerm: ''});
		searchInput.focus();
	});

	replaceClearBtn.addEventListener('click', () => {
		updateQuery({replaceTerm: ''});
		replaceInput.focus();
	});

	searchInput.addEventListener('input', () => updateQuery({searchTerm: searchInput.value}));
	searchInput.addEventListener('input', syncClearButtons);
	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) {
				goToPrev(view);
			} else {
				goToNext(view);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	});

	replaceInput.addEventListener('input', () => updateQuery({replaceTerm: replaceInput.value}));
	replaceInput.addEventListener('input', syncClearButtons);
	replaceInput.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	});

	// 按钮的 active 状态由 update() 根据 state 同步，这里只负责切换 state。
	caseSensitiveBtn.addEventListener('click', () => toggleOption(view, 'caseSensitive'));
	wholeWordBtn.addEventListener('click', () => toggleOption(view, 'wholeWord'));
	regexBtn.addEventListener('click', () => toggleOption(view, 'useRegex'));

	prevBtn.addEventListener('click', () => goToPrev(view));
	nextBtn.addEventListener('click', () => goToNext(view));
	replaceBtn.addEventListener('click', () => replaceCurrent(view));
	replaceAllBtn.addEventListener('click', () => replaceAll(view));
	closeBtn.addEventListener('click', close);
	toggleReplaceBtn.addEventListener('click', () => {
		const showReplace = !view.state.field(searchStateField).showReplace;
		view.dispatch({effects: togglePanel.of({visible: true, showReplace})});
	});

	const detachKeymap = attachSearchKeymap(app, view);
	let panelsHost: HTMLElement | null = null;

	return {
		dom,
		// 挂在编辑器顶部的 panel 容器里，再通过 CSS 让它浮在右上角（不占据布局空间）。
		top: true,
		update(update) {
			const hasSearchEffects = update.transactions.some((tr) =>
				tr.effects.some((e) =>
					e.is(togglePanel) || e.is(closeSearch) || e.is(setSearchQuery) || e.is(setCurrentMatch)
				)
			);

			// 通过 Cmd+P 触发时，通常只有 StateEffect，没有 docChanged/selectionSet。
			if (update.docChanged || update.selectionSet || hasSearchEffects) {
				const newState = update.state.field(searchStateField);
				if (newState.showReplace === replaceRow.hasClass('vss-hidden')) {
					syncReplaceToggle(newState.showReplace);
				}
				if (searchInput.value !== newState.query.searchTerm) {
					searchInput.value = newState.query.searchTerm;
				}
				if (replaceInput.value !== newState.query.replaceTerm) {
					replaceInput.value = newState.query.replaceTerm;
				}
				syncClearButtons();
				caseSensitiveBtn.classList.toggle('active', newState.query.caseSensitive);
				wholeWordBtn.classList.toggle('active', newState.query.wholeWord);
				regexBtn.classList.toggle('active', newState.query.useRegex);
				updateMatchCount();
			}

			// 面板已打开时再次触发 Find / Find and replace（或点击展开箭头）：焦点回到输入框并全选。
			const reopened = update.transactions.some((tr) =>
				tr.effects.some((e) => e.is(togglePanel) && e.value.visible)
			);
			if (reopened) focusInput();
		},
		mount() {
			// 记下容器引用：destroy 时面板可能已从容器中移除，parentElement 会是 null。
			panelsHost = dom.parentElement;
			panelsHost?.addClass('vss-panels-host');
			focusInput();
		},
		destroy() {
			panelsHost?.removeClass('vss-panels-host');
			detachKeymap();
		}
	};
}

export function createSearchPanelExtension(app: App) {
	const create = (view: EditorView) => createSearchPanel(app, view);
	return showPanel.compute([searchStateField], (state) => {
		const searchState = state.field(searchStateField);
		if (!searchState.panelVisible) return null;
		return create;
	});
}
