import {App} from 'obsidian';
import {showPanel, Panel, EditorView} from '@codemirror/view';
import {searchStateField, setSearchQuery, setCurrentMatch, togglePanel, closeSearch} from './search-state';
import {goToNext, goToPrev, replaceAll, replaceCurrent, toggleOption} from './search-actions';
import {attachSearchKeymap} from './search-keymap';
import {SearchWidget} from './search-widget';
import {SearchState, VimEditorView} from '../types';

/** Vim 处于插入/可视模式，或有未完成的按键序列时，Esc 应该交给 Vim 处理。 */
function vimWantsEscape(view: EditorView): boolean {
	const vim = (view as VimEditorView).cm?.state?.vim;
	if (!vim) return false;
	const pending = Boolean(vim.inputState?.operator) || (vim.inputState?.keyBuffer?.length ?? 0) > 0;
	return Boolean(vim.insertMode || vim.visualMode) || pending;
}

function createSearchPanel(app: App, view: EditorView): Panel {
	const updateQuery = (newQuery: Parameters<typeof setSearchQuery.of>[0]) => {
		view.dispatch({effects: setSearchQuery.of(newQuery)});
	};

	const close = () => {
		view.dispatch({effects: closeSearch.of(null)});
		view.focus();
	};

	const whenReplaceShown = (action: (view: EditorView) => void) => () => {
		if (view.state.field(searchStateField).showReplace) action(view);
	};

	const widget = new SearchWidget(view.dom.ownerDocument, {
		onSearchInput: (value) => updateQuery({searchTerm: value}),
		onReplaceInput: (value) => updateQuery({replaceTerm: value}),
		onToggleOption: (option) => toggleOption(view, option),
		onNext: () => goToNext(view),
		onPrev: () => goToPrev(view),
		onReplace: () => replaceCurrent(view),
		onReplaceAll: () => replaceAll(view),
		onToggleReplace: () => {
			const showReplace = !view.state.field(searchStateField).showReplace;
			view.dispatch({effects: togglePanel.of({visible: true, showReplace})});
		},
		onClose: close,
	});

	const sync = (state: SearchState) => {
		widget.setQuery(state.query);
		if (state.showReplace !== widget.isReplaceVisible()) widget.setReplaceVisible(state.showReplace);
		widget.setCount(state.currentMatchIndex, state.matches.length);
	};
	sync(view.state.field(searchStateField));

	const detachKeymap = attachSearchKeymap(app, view.dom, {
		next: () => goToNext(view),
		prev: () => goToPrev(view),
		toggleOption: (option) => toggleOption(view, option),
		replaceCurrent: whenReplaceShown(replaceCurrent),
		replaceAll: whenReplaceShown(replaceAll),
		close: () => {
			// 焦点在正文且 Vim 处于插入/可视模式时，Esc 先交给 Vim（与 VSCodeVim 一致）。
			if (view.hasFocus && vimWantsEscape(view)) return false;
			close();
			return true;
		},
	});
	let panelsHost: HTMLElement | null = null;

	return {
		dom: widget.dom,
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
				sync(update.state.field(searchStateField));
			}

			// 面板已打开时再次触发 Find / Find and replace（或点击展开箭头）：焦点回到输入框并全选。
			const reopened = update.transactions.some((tr) =>
				tr.effects.some((e) => e.is(togglePanel) && e.value.visible)
			);
			if (reopened) widget.focus();
		},
		mount() {
			// 记下容器引用：destroy 时面板可能已从容器中移除，parentElement 会是 null。
			panelsHost = widget.dom.parentElement;
			panelsHost?.addClass('vss-panels-host');
			widget.focus();
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
