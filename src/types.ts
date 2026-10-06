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

/**
 * 阅读视图渲染器（MarkdownPreviewRenderer）的内部结构，只声明本插件用到的字段。
 * 原生的阅读视图搜索也是这样工作的：把匹配位置写进 section.highlightRanges，
 * 由渲染器在 section 显示时画出高亮；跳转时调用 selectRange 展开并滚动到对应位置。
 */
export interface PreviewSection {
	/** section 渲染后的 DOM；即使没有挂到页面上（虚拟滚动）也是完整的。 */
	el: HTMLElement;
	highlightRanges: PreviewHighlightRange[] | null;
}

export interface PreviewHighlightRange {
	section: PreviewSection;
	/** 在 section 内所有文本节点拼接后的文本中的偏移量。 */
	start: number;
	end: number;
	active: boolean;
}

export interface PreviewRenderer {
	sections: PreviewSection[];
	previewEl: HTMLElement;
	lastText?: string;
	queueRender(): void;
	selectRange(range: PreviewHighlightRange): void;
	getSectionTop(section: PreviewSection): number;
}
