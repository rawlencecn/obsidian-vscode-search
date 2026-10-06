import {Platform, setIcon} from 'obsidian';
import {SearchQuery} from '../types';
import {SearchOption} from './search-actions';

/** 浮窗上的用户操作，由使用方（编辑视图 / 阅读视图）决定具体行为。 */
export interface SearchWidgetHandlers {
	onSearchInput(value: string): void;
	onReplaceInput(value: string): void;
	onToggleOption(option: SearchOption): void;
	onNext(): void;
	onPrev(): void;
	onReplace(): void;
	onReplaceAll(): void;
	onToggleReplace(): void;
	onClose(): void;
}

/** 按平台生成快捷键提示，例如 macOS 上是「⌥⌘C」，其他平台是「Alt+C」。 */
function shortcut(mac: string, other: string): string {
	return Platform.isMacOS ? mac : other;
}

function createIconButton(container: HTMLElement, icon: string, cls: string, title: string): HTMLButtonElement {
	const btn = container.createEl('button', {cls: ['vss-icon-btn', cls], attr: {type: 'button', 'aria-label': title}});
	setIcon(btn, icon);
	return btn;
}

function createToggleButton(container: HTMLElement, icon: string, cls: string, title: string): HTMLButtonElement {
	const btn = createIconButton(container, icon, cls, title);
	btn.addClass('vss-toggle-btn');
	return btn;
}

/**
 * VS Code 风格的查找浮窗（只负责 DOM 和交互，不包含搜索逻辑）。
 *
 * 布局与 VS Code 的查找小部件一致：
 * [展开替换] [查找输入框 + 区分大小写/全词/正则] [计数] [上一个] [下一个] [关闭]
 *            [替换输入框]                       [替换] [全部替换]
 */
export class SearchWidget {
	readonly dom: HTMLDivElement;
	readonly searchInput: HTMLInputElement;
	readonly replaceInput: HTMLInputElement;

	private readonly toggleReplaceBtn: HTMLButtonElement;
	private readonly replaceRow: HTMLDivElement;
	private readonly matchCount: HTMLDivElement;
	private readonly findClearBtn: HTMLButtonElement;
	private readonly replaceClearBtn: HTMLButtonElement;
	private readonly optionButtons: Record<SearchOption, HTMLButtonElement>;

	constructor(doc: Document, handlers: SearchWidgetHandlers) {
		// 从目标文档创建，兼容弹出窗口（popout window）。
		const dom = this.dom = doc.createElement('div');
		dom.className = 'vss-search-panel';

		this.toggleReplaceBtn = createIconButton(dom, 'lucide-chevron-right', 'vss-btn-toggle-replace', 'Toggle replace');
		const rows = dom.createDiv({cls: 'vss-rows'});

		const searchRow = rows.createDiv({cls: 'vss-row'});
		const searchInputBox = searchRow.createDiv({cls: 'vss-input-box'});
		this.searchInput = searchInputBox.createEl('input', {
			cls: 'vss-search-input',
			attr: {type: 'text', placeholder: 'Find', spellcheck: 'false'}
		});
		this.findClearBtn = createIconButton(searchInputBox, 'lucide-x', 'vss-clear-btn', 'Clear');
		this.optionButtons = {
			caseSensitive: createToggleButton(searchInputBox, 'lucide-case-sensitive', 'vss-btn-case', `Match case (${shortcut('⌥⌘C', 'Alt+C')})`),
			wholeWord: createToggleButton(searchInputBox, 'lucide-whole-word', 'vss-btn-whole-word', `Match whole word (${shortcut('⌥⌘W', 'Alt+W')})`),
			useRegex: createToggleButton(searchInputBox, 'lucide-regex', 'vss-btn-regex', `Use regular expression (${shortcut('⌥⌘R', 'Alt+R')})`),
		};

		const searchControls = searchRow.createDiv({cls: 'vss-row-controls'});
		this.matchCount = searchControls.createDiv({cls: 'vss-match-count'});
		const prevBtn = createIconButton(searchControls, 'lucide-arrow-up', 'vss-btn-prev', `Previous match (${shortcut('⇧Enter, ⇧⌘G', 'Shift+Enter, Shift+F3')})`);
		const nextBtn = createIconButton(searchControls, 'lucide-arrow-down', 'vss-btn-next', `Next match (${shortcut('Enter, ⌘G', 'Enter, F3')})`);
		const closeBtn = createIconButton(searchControls, 'lucide-x', 'vss-close-btn', 'Close (Escape)');

		this.replaceRow = rows.createDiv({cls: 'vss-row'});
		const replaceInputBox = this.replaceRow.createDiv({cls: 'vss-input-box'});
		this.replaceInput = replaceInputBox.createEl('input', {
			cls: 'vss-search-input',
			attr: {type: 'text', placeholder: 'Replace', spellcheck: 'false'}
		});
		this.replaceClearBtn = createIconButton(replaceInputBox, 'lucide-x', 'vss-clear-btn', 'Clear');
		const replaceControls = this.replaceRow.createDiv({cls: 'vss-row-controls'});
		const replaceBtn = createIconButton(replaceControls, 'lucide-replace', 'vss-btn-replace', `Replace (${shortcut('⇧⌘1', 'Shift+Ctrl+1')})`);
		const replaceAllBtn = createIconButton(replaceControls, 'lucide-replace-all', 'vss-btn-replace-all', `Replace all (${shortcut('⌥⌘Enter', 'Ctrl+Alt+Enter')})`);

		this.setReplaceVisible(false);
		this.setCount(0, 0);

		// 避免点击清空按钮导致输入框失焦
		this.findClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
		this.replaceClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
		this.findClearBtn.addEventListener('click', () => {
			this.searchInput.value = '';
			this.syncClearButtons();
			handlers.onSearchInput('');
			this.searchInput.focus();
		});
		this.replaceClearBtn.addEventListener('click', () => {
			this.replaceInput.value = '';
			this.syncClearButtons();
			handlers.onReplaceInput('');
			this.replaceInput.focus();
		});

		this.searchInput.addEventListener('input', () => {
			this.syncClearButtons();
			handlers.onSearchInput(this.searchInput.value);
		});
		this.searchInput.addEventListener('keydown', (e) => {
			if (e.isComposing) return;
			if (e.key === 'Enter') {
				e.preventDefault();
				if (e.shiftKey) handlers.onPrev();
				else handlers.onNext();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				handlers.onClose();
			}
		});

		this.replaceInput.addEventListener('input', () => {
			this.syncClearButtons();
			handlers.onReplaceInput(this.replaceInput.value);
		});
		this.replaceInput.addEventListener('keydown', (e) => {
			if (e.isComposing) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				handlers.onClose();
			}
		});

		// 开关的 active 状态由 setQuery() 根据最新状态同步，这里只负责通知切换。
		for (const option of Object.keys(this.optionButtons) as SearchOption[]) {
			this.optionButtons[option].addEventListener('click', () => handlers.onToggleOption(option));
		}
		prevBtn.addEventListener('click', () => handlers.onPrev());
		nextBtn.addEventListener('click', () => handlers.onNext());
		replaceBtn.addEventListener('click', () => handlers.onReplace());
		replaceAllBtn.addEventListener('click', () => handlers.onReplaceAll());
		closeBtn.addEventListener('click', () => handlers.onClose());
		this.toggleReplaceBtn.addEventListener('click', () => handlers.onToggleReplace());
	}

	/** 把查询状态同步到输入框和开关上（输入框内容相同时不覆盖，避免打断输入）。 */
	setQuery(query: SearchQuery) {
		if (this.searchInput.value !== query.searchTerm) this.searchInput.value = query.searchTerm;
		if (this.replaceInput.value !== query.replaceTerm) this.replaceInput.value = query.replaceTerm;
		for (const option of Object.keys(this.optionButtons) as SearchOption[]) {
			this.optionButtons[option].toggleClass('active', query[option]);
		}
		this.syncClearButtons();
	}

	setReplaceVisible(visible: boolean) {
		this.replaceRow.toggleClass('vss-hidden', !visible);
		this.toggleReplaceBtn.toggleClass('is-expanded', visible);
		setIcon(this.toggleReplaceBtn, visible ? 'lucide-chevron-down' : 'lucide-chevron-right');
	}

	setToggleReplaceLabel(label: string) {
		this.toggleReplaceBtn.setAttribute('aria-label', label);
	}

	isReplaceVisible(): boolean {
		return !this.replaceRow.hasClass('vss-hidden');
	}

	/** current 从 0 开始；没有匹配时显示 No results。 */
	setCount(current: number, total: number) {
		if (total === 0) {
			this.matchCount.textContent = 'No results';
			this.matchCount.addClass('is-empty');
		} else {
			this.matchCount.textContent = `${current >= 0 ? current + 1 : 0} of ${total}`;
			this.matchCount.removeClass('is-empty');
		}
	}

	/** 与 VS Code 一致：替换行展开且已有搜索词时聚焦替换框，否则聚焦搜索框；并全选内容。 */
	focus() {
		const input = this.isReplaceVisible() && this.searchInput.value ? this.replaceInput : this.searchInput;
		input.focus();
		input.select();
	}

	/** 输入框为空时隐藏清空按钮（占位保留，避免其他按钮跳动）。 */
	private syncClearButtons() {
		this.findClearBtn.toggleClass('vss-invisible', !this.searchInput.value);
		this.replaceClearBtn.toggleClass('vss-invisible', !this.replaceInput.value);
	}
}
