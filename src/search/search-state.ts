import {StateEffect, StateField} from '@codemirror/state';
import {EditorView, Decoration, DecorationSet} from '@codemirror/view';
import {SearchQuery, SearchState} from '../types';
import {findMatches, findNearestMatchIndex} from './search-logic';

export const setSearchQuery = StateEffect.define<Partial<SearchQuery>>();
export const setCurrentMatch = StateEffect.define<number>();
export const togglePanel = StateEffect.define<{ visible: boolean; showReplace: boolean }>();
export const closeSearch = StateEffect.define<null>();

export const searchStateField = StateField.define<SearchState>({
	create(): SearchState {
		return {
			query: {searchTerm: '', replaceTerm: '', caseSensitive: false, wholeWord: false, useRegex: false},
			matches: [],
			currentMatchIndex: -1,
			showReplace: false,
			panelVisible: false,
		};
	},
	update(state, tr) {
		let newState = state;

		for (const effect of tr.effects) {
			if (effect.is(togglePanel)) {
				newState = {...newState, panelVisible: effect.value.visible, showReplace: effect.value.showReplace};
			} else if (effect.is(closeSearch)) {
				newState = {
					...newState,
					panelVisible: false,
					matches: [],
					currentMatchIndex: -1,
					query: {...newState.query, searchTerm: ''}
				};
			} else if (effect.is(setSearchQuery)) {
				const nextQuery: SearchQuery = {...newState.query, ...effect.value};
				const matches = findMatches(tr.state.doc.toString(), nextQuery);
				// 从选区起点开始找：选中的文本本身就是匹配时，它就是当前匹配（与 VS Code 一致）。
				// 用 head（选区终点）会跳过选中的那一处，导致计数与选区错位、Enter 跳过一个匹配。
				const currentMatchIndex = matches.length > 0
					? findNearestMatchIndex(matches, tr.state.selection.main.from)
					: -1;
				newState = {...newState, query: nextQuery, matches, currentMatchIndex};
			} else if (effect.is(setCurrentMatch)) {
				newState = {...newState, currentMatchIndex: effect.value};
			}
		}

		if (tr.docChanged && newState.query.searchTerm) {
			const matches = findMatches(tr.state.doc.toString(), newState.query);
			let currentMatchIndex = newState.currentMatchIndex;
			if (currentMatchIndex >= matches.length) currentMatchIndex = matches.length - 1;
			if (matches.length === 0) currentMatchIndex = -1;
			newState = {...newState, matches, currentMatchIndex};
		}

		return newState;
	},
});

const matchHighlight = Decoration.mark({class: 'vss-highlight'});
const activeMatchHighlight = Decoration.mark({class: 'vss-highlight-active'});

export const searchDecorations = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(_, tr) {
		const searchState = tr.state.field(searchStateField);
		if (!searchState.panelVisible || searchState.matches.length === 0) {
			return Decoration.none;
		}

		const decorations = searchState.matches.map((match, i) => {
			const deco = i === searchState.currentMatchIndex ? activeMatchHighlight : matchHighlight;
			return deco.range(match.from, match.to);
		});

		return Decoration.set(decorations, true);
	},
	provide(field) {
		return EditorView.decorations.from(field);
	},
});

export function searchExtension() {
	return [searchStateField, searchDecorations];
}
