import {EditorView} from '@codemirror/view';

/** Obsidian's Editor exposes a `cm` property for the underlying CodeMirror EditorView. */
export interface ObsidianEditor {
	cm?: EditorView;
}

/** Obsidian's App exposes an internal `commands` registry. */
export interface ObsidianApp {
	commands?: {
		commands?: Record<string, unknown>;
	};
}

export interface SearchQuery {
	searchTerm: string;
	replaceTerm: string;
	caseSensitive: boolean;
	wholeWord: boolean;
	useRegex: boolean;
}

export interface SearchMatch {
	from: number;
	to: number;
}

export interface SearchState {
	query: SearchQuery;
	matches: SearchMatch[];
	currentMatchIndex: number;
	showReplace: boolean;
	panelVisible: boolean;
}
