import {App, KeymapEventListener, Modifier, Platform, Scope} from 'obsidian';
import {SearchOption} from './search-actions';

/** 快捷键对应的操作，由编辑视图 / 阅读视图分别实现。 */
export interface SearchKeymapActions {
	next(): void;
	prev(): void;
	toggleOption(option: SearchOption): void;
	/** 不提供则不注册替换快捷键（例如阅读视图）。 */
	replaceCurrent?(): void;
	replaceAll?(): void;
	/** 返回 false 表示不处理，让按键继续传给编辑器（例如 Vim 插入模式下的 Esc）。 */
	close(): boolean;
}

/**
 * VS Code 风格的查找快捷键（与 VS Code 默认键位一致；括号内为 Windows / Linux）：
 *
 * - 下一个 / 上一个匹配：Cmd+G / Shift+Cmd+G（仅 macOS），F3 / Shift+F3
 * - 区分大小写：Alt+Cmd+C（Alt+C）
 * - 全词匹配：Alt+Cmd+W（Alt+W）
 * - 正则表达式：Alt+Cmd+R（Alt+R）
 * - 替换当前：Shift+Cmd+1（Shift+Ctrl+1）
 * - 全部替换：Alt+Cmd+Enter（Alt+Ctrl+Enter）
 * - 关闭：Escape
 *
 * Obsidian 在 window 的 capture 阶段处理快捷键，普通的 keydown 监听抢不过全局快捷键
 * （例如 Mod+G 默认是「打开关系图谱」），所以这里用 Scope：只在焦点位于 focusRoot
 * （编辑器或阅读视图，含浮窗）内时压入 keymap 栈，焦点离开即弹出，不影响其他地方的全局快捷键。
 */
function createSearchScope(app: App, actions: SearchKeymapActions): Scope {
	const scope = new Scope(app.scope);
	const bind = (modifiers: Modifier[], key: string, action: () => void) => {
		const listener: KeymapEventListener = () => {
			action();
			return false;
		};
		scope.register(modifiers, key, listener);
	};

	if (Platform.isMacOS) {
		bind(['Mod'], 'G', () => actions.next());
		bind(['Mod', 'Shift'], 'G', () => actions.prev());
	}
	bind([], 'F3', () => actions.next());
	bind(['Shift'], 'F3', () => actions.prev());

	const toggleModifiers: Modifier[] = Platform.isMacOS ? ['Mod', 'Alt'] : ['Alt'];
	bind(toggleModifiers, 'C', () => actions.toggleOption('caseSensitive'));
	bind(toggleModifiers, 'W', () => actions.toggleOption('wholeWord'));
	bind(toggleModifiers, 'R', () => actions.toggleOption('useRegex'));

	if (actions.replaceCurrent) bind(['Mod', 'Shift'], '1', () => actions.replaceCurrent?.());
	if (actions.replaceAll) bind(['Mod', 'Alt'], 'Enter', () => actions.replaceAll?.());

	// 返回 true：不拦截，事件照常传给编辑器（例如 Vim）。
	scope.register([], 'Escape', () => (actions.close() ? false : true));

	return scope;
}

/**
 * 浮窗打开期间，跟随焦点启用/停用快捷键 Scope。
 * 返回清理函数，在浮窗关闭时调用。
 */
export function attachSearchKeymap(app: App, focusRoot: HTMLElement, actions: SearchKeymapActions): () => void {
	const scope = createSearchScope(app, actions);
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
		// 焦点只是在 focusRoot 内部移动（例如正文与浮窗之间）时，保持启用。
		const next = evt.relatedTarget as Node | null;
		if (next && focusRoot.contains(next)) return;
		deactivate();
	};

	focusRoot.addEventListener('focusin', activate);
	focusRoot.addEventListener('focusout', onFocusOut);
	if (focusRoot.contains(focusRoot.doc.activeElement)) activate();

	return () => {
		focusRoot.removeEventListener('focusin', activate);
		focusRoot.removeEventListener('focusout', onFocusOut);
		deactivate();
	};
}
