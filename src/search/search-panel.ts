import {showPanel, Panel, EditorView} from '@codemirror/view';
import {searchStateField, setSearchQuery, setCurrentMatch, togglePanel, closeSearch} from './search-state';
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

function createSearchPanel(view: EditorView): Panel {
	const dom = document.createElement('div');
	dom.className = 'esr-search-panel';

	let searchState: SearchState = view.state.field(searchStateField);

	const updateQuery = (newQuery: Parameters<typeof setSearchQuery.of>[0]) => {
		view.dispatch({effects: setSearchQuery.of(newQuery)});
	};

	const goToNext = () => {
		const state = view.state.field(searchStateField);
		if (state.matches.length > 0) {
			const nextIndex = (state.currentMatchIndex + 1) % state.matches.length;
			view.dispatch({effects: setCurrentMatch.of(nextIndex)});
			const match = state.matches[nextIndex];
			if (match) {
				view.dispatch({selection: {anchor: match.from, head: match.to}});
				view.dispatch({effects: EditorView.scrollIntoView(view.state.selection.main, {y: 'center'})});
			}
		}
	};

	const goToPrev = () => {
		const state = view.state.field(searchStateField);
		if (state.matches.length > 0) {
			const prevIndex = (state.currentMatchIndex - 1 + state.matches.length) % state.matches.length;
			view.dispatch({effects: setCurrentMatch.of(prevIndex)});
			const match = state.matches[prevIndex];
			if (match) {
				view.dispatch({selection: {anchor: match.from, head: match.to}});
				view.dispatch({effects: EditorView.scrollIntoView(view.state.selection.main, {y: 'center'})});
			}
		}
	};

	const replaceCurrent = () => {
		const state = view.state.field(searchStateField);
		const match = state.matches[state.currentMatchIndex];
		if (match) {
			const currentIndex = state.currentMatchIndex;
			view.dispatch({changes: {from: match.from, to: match.to, insert: state.query.replaceTerm}});

			// 替换会触发 matches 重算；此时“下一个匹配”通常会落在原 index 位置。
			const newState = view.state.field(searchStateField);
			if (newState.matches.length === 0) return;
			const nextIndex = Math.min(Math.max(currentIndex, 0), newState.matches.length - 1);
			view.dispatch({effects: setCurrentMatch.of(nextIndex)});

			const nextMatch = newState.matches[nextIndex];
			if (nextMatch) {
				view.dispatch({selection: {anchor: nextMatch.from, head: nextMatch.to}});
				view.dispatch({effects: EditorView.scrollIntoView(view.state.selection.main, {y: 'center'})});
			}
		}
	};

	const replaceAll = () => {
		const state = view.state.field(searchStateField);
		const changes = state.matches.map(m => ({
			from: m.from,
			to: m.to,
			insert: state.query.replaceTerm
		}));
		if (changes.length > 0) {
			view.dispatch({changes});
		}
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
				goToPrev();
			} else {
				goToNext();
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

	caseSensitiveBtn.addEventListener('click', () => {
		caseSensitiveBtn.classList.toggle('active');
		updateQuery({caseSensitive: caseSensitiveBtn.classList.contains('active')});
	});

	wholeWordBtn.addEventListener('click', () => {
		wholeWordBtn.classList.toggle('active');
		updateQuery({wholeWord: wholeWordBtn.classList.contains('active')});
	});

	regexBtn.addEventListener('click', () => {
		regexBtn.classList.toggle('active');
		updateQuery({useRegex: regexBtn.classList.contains('active')});
	});

	prevBtn.addEventListener('click', goToPrev);
	nextBtn.addEventListener('click', goToNext);
	replaceBtn.addEventListener('click', replaceCurrent);
	replaceAllBtn.addEventListener('click', replaceAll);
	closeBtn.addEventListener('click', close);

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
		},
		mount() {
			searchInput.focus();
			searchInput.select();
		}
	};
}

export const searchPanelExtension = showPanel.compute([searchStateField], (state) => {
	const searchState = state.field(searchStateField);
	if (!searchState.panelVisible) return null;
	return createSearchPanel;
});
