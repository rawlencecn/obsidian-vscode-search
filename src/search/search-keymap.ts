import {App, KeymapEventListener, Modifier, Platform, Scope} from 'obsidian';
import {EditorView} from '@codemirror/view';
import {goToNext, goToPrev, replaceAll, replaceCurrent, toggleOption} from './search-actions';
import {searchStateField} from './search-state';

/**
 * VS Code 风格的查找快捷键（与 VS Code 默认键位一致；括号内为 Windows / Linux）：
 *
 * - 下一个 / 上一个匹配：Cmd+G / Shift+Cmd+G（仅 macOS），F3 / Shift+F3
 * - 区分大小写：Alt+Cmd+C（Alt+C）
 * - 全词匹配：Alt+Cmd+W（Alt+W）
 * - 正则表达式：Alt+Cmd+R（Alt+R）
 * - 替换当前：Shift+Cmd+1（Shift+Ctrl+1），仅在显示替换行时生效
 * - 全部替换：Alt+Cmd+Enter（Alt+Ctrl+Enter），仅在显示替换行时生效
 *
 * Obsidian 在 window 的 capture 阶段处理快捷键，普通的 keydown 监听抢不过全局快捷键
 * （例如 Mod+G 默认是「打开关系图谱」），所以这里用 Scope：只在焦点位于该编辑器
 * （含搜索面板）时压入 keymap 栈，焦点离开即弹出，不影响其他地方的全局快捷键。
 */
function createSearchScope(app: App, view: EditorView): Scope {
	const scope = new Scope(app.scope);
	const bind = (modifiers: Modifier[], key: string, action: () => void) => {
		const listener: KeymapEventListener = () => {
			action();
			return false;
		};
		scope.register(modifiers, key, listener);
	};
	const whenReplaceShown = (action: (view: EditorView) => void) => () => {
		if (view.state.field(searchStateField).showReplace) action(view);
	};

	if (Platform.isMacOS) {
		bind(['Mod'], 'G', () => goToNext(view));
		bind(['Mod', 'Shift'], 'G', () => goToPrev(view));
	}
	bind([], 'F3', () => goToNext(view));
	bind(['Shift'], 'F3', () => goToPrev(view));

	const toggleModifiers: Modifier[] = Platform.isMacOS ? ['Mod', 'Alt'] : ['Alt'];
	bind(toggleModifiers, 'C', () => toggleOption(view, 'caseSensitive'));
	bind(toggleModifiers, 'W', () => toggleOption(view, 'wholeWord'));
	bind(toggleModifiers, 'R', () => toggleOption(view, 'useRegex'));

	bind(['Mod', 'Shift'], '1', whenReplaceShown(replaceCurrent));
	bind(['Mod', 'Alt'], 'Enter', whenReplaceShown(replaceAll));

	return scope;
}

/**
 * 面板打开期间，跟随焦点启用/停用快捷键 Scope。
 * 返回清理函数，在面板销毁时调用。
 */
export function attachSearchKeymap(app: App, view: EditorView): () => void {
	const scope = createSearchScope(app, view);
	let active = false;

	const activate = () => {
		if (active) return;
		app.keymap.pushScope(scope);
		active = true;
	};
	const deactivate = () => {
		if (!active) return;
		app.keymap.popScope(scope);
		active = false;
	};
	const onFocusOut = (evt: FocusEvent) => {
		// 焦点只是在编辑器和搜索面板之间移动时，保持启用。
		const next = evt.relatedTarget as Node | null;
		if (next && view.dom.contains(next)) return;
		deactivate();
	};

	view.dom.addEventListener('focusin', activate);
	view.dom.addEventListener('focusout', onFocusOut);
	if (view.dom.contains(view.dom.doc.activeElement)) activate();

	return () => {
		view.dom.removeEventListener('focusin', activate);
		view.dom.removeEventListener('focusout', onFocusOut);
		deactivate();
	};
}
