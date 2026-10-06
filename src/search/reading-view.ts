import {MarkdownView} from 'obsidian';
import {EditorSelection} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {closeSearch} from './search-state';

/**
 * 搜索面板挂在 CodeMirror 编辑器上，阅读视图下编辑器是隐藏的（display: none），面板无法显示。
 * 因此在阅读视图中触发查找时，先临时切到编辑视图；面板关闭后再切回阅读视图。
 *
 * key：CodeMirror view；value：被临时切换的 Markdown 视图。
 */
const switchedFromReadingView = new WeakMap<EditorView, MarkdownView>();

/** 读取阅读视图中选中的文本，用于预填搜索词（与编辑视图下用选区预填的行为保持一致）。 */
export function getReadingViewSelection(view: MarkdownView): string {
	// 用视图所在窗口取选区，兼容弹出窗口（popout window）。
	const selection = view.containerEl.win.getSelection();
	if (!selection || selection.isCollapsed || !selection.anchorNode) return '';
	if (!view.contentEl.contains(selection.anchorNode)) return '';

	// 渲染后的多行文本和 Markdown 源码差异较大（列表符号、表格等），只用单行选区预填。
	const text = selection.toString().trim();
	return text.includes('\n') ? '' : text;
}

/** 从阅读视图切到编辑视图，并记录下来，以便关闭面板时切回。 */
export async function switchToEditingView(view: MarkdownView, cmView: EditorView): Promise<void> {
	await view.setState({...view.getState(), mode: 'source'}, {history: false});
	switchedFromReadingView.set(cmView, view);
	moveCursorIntoViewport(cmView);
}

/** 面板是在编辑视图中直接打开的：关闭时不需要切回阅读视图。 */
export function forgetReadingViewSwitch(cmView: EditorView) {
	switchedFromReadingView.delete(cmView);
}

/**
 * 阅读视图没有光标，切换后编辑器光标可能停在很远的位置；而「最近的匹配」是从光标开始算的。
 * 如果光标不在可视区域内，就把它移到可视区域第一行，让搜索从用户正在看的位置开始。
 */
function moveCursorIntoViewport(cmView: EditorView) {
	const rect = cmView.scrollDOM.getBoundingClientRect();
	const x = rect.left + rect.width / 2;
	const top = cmView.posAtCoords({x, y: rect.top + 1}, false);
	const bottom = cmView.posAtCoords({x, y: rect.bottom - 1}, false);
	const head = cmView.state.selection.main.head;
	if (head >= top && head <= bottom) return;

	cmView.dispatch({selection: EditorSelection.cursor(cmView.state.doc.lineAt(top).from)});
}

/** 面板关闭时，如果之前是从阅读视图切过来的，就切回阅读视图。 */
export const restoreReadingViewOnClose = EditorView.updateListener.of((update) => {
	const closed = update.transactions.some((tr) => tr.effects.some((e) => e.is(closeSearch)));
	if (!closed) return;

	const markdownView = switchedFromReadingView.get(update.view);
	if (!markdownView) return;
	switchedFromReadingView.delete(update.view);

	// 不能在 CodeMirror 的 update 周期内切换视图模式，延后到下一轮事件循环。
	markdownView.containerEl.win.setTimeout(() => {
		if (markdownView.getMode() !== 'source') return;
		void markdownView.setState({...markdownView.getState(), mode: 'preview'}, {history: false});
	}, 0);
});
