import {App} from 'obsidian';
import {showPanel, Panel, EditorView} from '@codemirror/view';
import {searchStateField, setSearchQuery, setCurrentMatch, togglePanel, closeSearch} from './search-state';
import {goToNext, goToPrev, replaceAll, replaceCurrent, toggleOption} from './search-actions';
import {attachSearchKeymap} from './search-keymap';
import {SearchState} from '../types';

function createToggleButton(container: HTMLElement, text: string, cls: string, title: string): HTMLButtonElement {
	const btn = container.createEl('button', {cls: ['esr-toggle-btn', cls], attr: {type: 'button', title}});
	btn.textContent = text;
	return btn;
}

function createIconButton(container: HTMLElement, icon: string, cls: string, title: string): HTMLButtonElement {
	const btn = container.createEl('button', {cls: ['esr-icon-btn', cls], attr: {type: 'button', title}});
	btn.textContent = icon;
	return btn;
}

function createSearchPanel(app: App, view: EditorView): Panel {
	const dom = document.createElement('div');
	dom.className = 'esr-search-panel';

	let searchState: SearchState = view.state.field(searchStateField);

	const updateQuery = (newQuery: Parameters<typeof setSearchQuery.of>[0]) => {
		view.dispatch({effects: setSearchQuery.of(newQuery)});
	};

	const close = () => {
		view.dispatch({effects: closeSearch.of(null)});
		view.focus();
	};

	const searchRow = dom.createDiv({cls: 'esr-search-row'});
	const searchInputWrap = searchRow.createDiv({cls: 'esr-input-wrap'});
	const searchInput = searchInputWrap.createEl('input', {
		cls: 'esr-search-input',
		attr: {type: 'text', placeholder: 'Find', spellcheck: 'false'}
	});
	searchInput.value = searchState.query.searchTerm;
	const findInlineActions = searchInputWrap.createDiv({cls: 'esr-input-actions'});
	const searchControls = searchRow.createDiv({cls: 'esr-row-controls'});
	const searchRowEnd = searchRow.createDiv({cls: 'esr-row-end'});

	// 三个 toggle 按钮内嵌到输入框右侧
	const findClearBtn = createIconButton(findInlineActions, '×', 'esr-clear-btn', 'Clear');
	const toggleContainer = findInlineActions.createDiv({cls: 'esr-toggle-container esr-toggle-container-inline'});
	const caseSensitiveBtn = createToggleButton(toggleContainer, 'Aa', 'esr-btn-case', 'Match case');
	const wholeWordBtn = createToggleButton(toggleContainer, 'ab', 'esr-btn-whole-word', 'Match whole word');
	const regexBtn = createToggleButton(toggleContainer, '.*', 'esr-btn-regex', 'Use regular expression');

	caseSensitiveBtn.classList.toggle('active', searchState.query.caseSensitive);
	wholeWordBtn.classList.toggle('active', searchState.query.wholeWord);
	regexBtn.classList.toggle('active', searchState.query.useRegex);

	const navContainer = searchControls.createDiv({cls: 'esr-nav-container'});
	const matchCount = navContainer.createDiv({cls: 'esr-match-count'});
	const prevBtn = createIconButton(navContainer, '↑', 'esr-btn-prev', 'Previous match (Shift+Enter)');
	const nextBtn = createIconButton(navContainer, '↓', 'esr-btn-next', 'Next match (Enter)');

	const replaceRow = dom.createDiv({cls: 'esr-search-row'});
	// 注意：`.esr-search-row` 使用的是 grid；这里不要设置为 flex，否则两行输入框无法对齐。
	replaceRow.style.display = searchState.showReplace ? 'grid' : 'none';
	const replaceInputWrap = replaceRow.createDiv({cls: 'esr-input-wrap'});
	const replaceInput = replaceInputWrap.createEl('input', {
		cls: 'esr-search-input',
		attr: {type: 'text', placeholder: 'Replace', spellcheck: 'false'}
	});
	replaceInput.value = searchState.query.replaceTerm;
	const replaceInlineActions = replaceInputWrap.createDiv({cls: 'esr-input-actions'});
	const replaceClearBtn = createIconButton(replaceInlineActions, '×', 'esr-clear-btn', 'Clear');
	const replaceControls = replaceRow.createDiv({cls: 'esr-row-controls'});
	// 占位：保证 Replace 行与 Find 行同样的三列布局
	replaceRow.createDiv({cls: 'esr-row-end'});
	const replaceBtnsContainer = replaceControls.createDiv({cls: 'esr-replace-btns'});
	const replaceBtn = createIconButton(replaceBtnsContainer, 'Replace', 'esr-btn-replace', 'Replace');
	const replaceAllBtn = createIconButton(replaceBtnsContainer, 'Replace all', 'esr-btn-replace-all', 'Replace all');

	const closeBtn = searchRowEnd.createEl('button', {cls: 'esr-close-btn', attr: {type: 'button', title: 'Close (esc)'}});
	closeBtn.textContent = '×';


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

	updateMatchCount();
	findClearBtn.style.visibility = searchInput.value ? 'visible' : 'hidden';
	replaceClearBtn.style.visibility = replaceInput.value ? 'visible' : 'hidden';

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
	searchInput.addEventListener('input', () => {
		findClearBtn.style.visibility = searchInput.value ? 'visible' : 'hidden';
	});
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
	replaceInput.addEventListener('input', () => {
		replaceClearBtn.style.visibility = replaceInput.value ? 'visible' : 'hidden';
	});
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

	const detachKeymap = attachSearchKeymap(app, view);

	return {
		dom,
		// 将 panel 放到编辑器顶部（默认会在底部）
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
				if (newState.showReplace !== (replaceRow.style.display !== 'none')) {
					replaceRow.style.display = newState.showReplace ? 'grid' : 'none';
				}
				if (searchInput.value !== newState.query.searchTerm) {
					searchInput.value = newState.query.searchTerm;
					findClearBtn.style.visibility = searchInput.value ? 'visible' : 'hidden';
				}
				if (replaceInput.value !== newState.query.replaceTerm) {
					replaceInput.value = newState.query.replaceTerm;
					replaceClearBtn.style.visibility = replaceInput.value ? 'visible' : 'hidden';
				}
				caseSensitiveBtn.classList.toggle('active', newState.query.caseSensitive);
				wholeWordBtn.classList.toggle('active', newState.query.wholeWord);
				regexBtn.classList.toggle('active', newState.query.useRegex);
				updateMatchCount();
			}

			// 面板已打开时再次触发 Find / Find and replace：与 VS Code 一致，焦点回到搜索框并全选。
			const reopened = update.transactions.some((tr) =>
				tr.effects.some((e) => e.is(togglePanel) && e.value.visible)
			);
			if (reopened) {
				searchInput.focus();
				searchInput.select();
			}
		},
		mount() {
			searchInput.focus();
			searchInput.select();
		},
		destroy() {
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
