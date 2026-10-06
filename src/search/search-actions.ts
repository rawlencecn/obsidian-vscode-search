import {EditorSelection} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {SearchQuery} from '../types';
import {searchStateField, setCurrentMatch, setSearchQuery} from './search-state';

export type SearchOption = 'caseSensitive' | 'wholeWord' | 'useRegex';

/** 选中第 index 个匹配并滚动到视图中央。 */
export function revealMatch(view: EditorView, index: number) {
	const match = view.state.field(searchStateField).matches[index];
	if (!match) return;

	const range = EditorSelection.range(match.from, match.to);
	view.dispatch({
		selection: range,
		effects: [setCurrentMatch.of(index), EditorView.scrollIntoView(range, {y: 'center'})],
	});
}

export function goToNext(view: EditorView) {
	const state = view.state.field(searchStateField);
	if (state.matches.length === 0) return;
	revealMatch(view, (state.currentMatchIndex + 1) % state.matches.length);
}

export function goToPrev(view: EditorView) {
	const state = view.state.field(searchStateField);
	if (state.matches.length === 0) return;
	revealMatch(view, (state.currentMatchIndex - 1 + state.matches.length) % state.matches.length);
}

export function replaceCurrent(view: EditorView) {
	const state = view.state.field(searchStateField);
	const match = state.matches[state.currentMatchIndex];
	if (!match) return;

	const currentIndex = state.currentMatchIndex;
	view.dispatch({changes: {from: match.from, to: match.to, insert: state.query.replaceTerm}});

	// 替换会触发 matches 重算；此时“下一个匹配”通常会落在原 index 位置。
	const newState = view.state.field(searchStateField);
	if (newState.matches.length === 0) return;
	revealMatch(view, Math.min(Math.max(currentIndex, 0), newState.matches.length - 1));
}

export function replaceAll(view: EditorView) {
	const state = view.state.field(searchStateField);
	const changes = state.matches.map(m => ({
		from: m.from,
		to: m.to,
		insert: state.query.replaceTerm
	}));
	if (changes.length > 0) {
		view.dispatch({changes});
	}
}

export function toggleOption(view: EditorView, option: SearchOption) {
	const query = view.state.field(searchStateField).query;
	const next: Partial<SearchQuery> = {[option]: !query[option]};
	view.dispatch({effects: setSearchQuery.of(next)});
}
