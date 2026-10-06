import {EditorView} from '@codemirror/view';

/** Obsidian's Editor exposes a `cm` property for the underlying CodeMirror EditorView. */
export interface ObsidianEditor {
	cm?: EditorView;
}

/**
 * Obsidian 开启 Vim 模式时，CodeMirror vim 会在 EditorView 上挂一个 CM5 兼容对象 `cm`，
 * 其中 `state.vim` 记录当前的 Vim 模式。
 */
export interface VimEditorView {
	cm?: {
		state?: {
			vim?: {
				insertMode?: boolean;
				visualMode?: boolean;
				inputState?: {
					operator?: unknown;
					keyBuffer?: unknown[];
				};
			};
		};
	};
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
