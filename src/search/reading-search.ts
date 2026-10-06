import {App, MarkdownView, Plugin, TFile} from 'obsidian';
import {PreviewHighlightRange, PreviewRenderer, PreviewSection, SearchQuery} from '../types';
import {findMatches} from './search-logic';
import {SearchOption} from './search-actions';
import {SearchWidget} from './search-widget';
import {attachSearchKeymap} from './search-keymap';

/**
 * 阅读视图里的查找：不切换到编辑视图，直接在渲染后的页面上高亮。
 *
 * 复用阅读视图渲染器自带的高亮机制（与原生阅读视图搜索相同）：
 * - 匹配在每个 section 渲染后的纯文本上计算，写进 section.highlightRanges；
 * - 渲染器在 section 显示时画出高亮（虚拟滚动、折叠的标题都由它处理）；
 * - 跳转用 renderer.selectRange，它会展开折叠并滚动到匹配处，不会改变页面选区。
 *
 * 只能查找，不能替换：替换需要编辑 Markdown 源码，由「展开替换」切换到编辑视图完成。
 */

/** 在搜索结果中的位置：第几个 section、section 文本中的偏移量。 */
interface Anchor {
	sectionIndex: number;
	offset: number;
}

export interface ReadingSearchCallbacks {
	/** 搜索选项（区分大小写 / 全词 / 正则）变化时调用，用来与编辑视图共享选项。 */
	onOptionsChange(query: SearchQuery): void;
	/** 点击「展开替换」：替换需要切换到编辑视图。 */
	onRequestReplace(searchTerm: string): void;
}

/** 取阅读视图的渲染器；Obsidian 内部结构变化导致不可用时返回 null（调用方回退到切换编辑视图）。 */
function getPreviewRenderer(view: MarkdownView): PreviewRenderer | null {
	const renderer = (view.previewMode as unknown as {renderer?: Partial<PreviewRenderer>}).renderer;
	if (!renderer || !Array.isArray(renderer.sections) || !renderer.previewEl
		|| typeof renderer.queueRender !== 'function'
		|| typeof renderer.selectRange !== 'function'
		|| typeof renderer.getSectionTop !== 'function') {
		return null;
	}
	return renderer as PreviewRenderer;
}

/** section 内所有文本节点按顺序拼接的文本，与渲染器计算高亮位置的方式一致。 */
function getSectionText(section: PreviewSection): string {
	const walker = section.el.doc.createTreeWalker(section.el, NodeFilter.SHOW_TEXT);
	let text = '';
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		text += node.textContent ?? '';
	}
	return text;
}

/**
 * 页面选区在搜索结果中的位置（第几个 section、section 文本中的偏移量）。
 * 用选区预填搜索词时以它为起点：选中的文本本身就是当前匹配，与 VS Code 一致。
 */
function getSelectionAnchor(view: MarkdownView, renderer: PreviewRenderer): Anchor | null {
	const selection = view.containerEl.win.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	const sectionIndex = renderer.sections.findIndex((section) => section.el.contains(range.startContainer));
	const section = renderer.sections[sectionIndex];
	if (!section) return null;

	const walker = section.el.doc.createTreeWalker(section.el, NodeFilter.SHOW_TEXT);
	let offset = 0;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node === range.startContainer) return {sectionIndex, offset: offset + range.startOffset};
		offset += node.textContent?.length ?? 0;
	}
	// 选区起点不在文本节点上（例如整段选中）：从 section 开头算。
	return {sectionIndex, offset: 0};
}

/** 文件名标题、属性、底部反向链接等界面区块（mod-ui）不参与搜索。 */
function isContentSection(section: PreviewSection): boolean {
	return !section.el.hasClass('mod-ui');
}

export class ReadingSearch {
	private readonly widget: SearchWidget;
	private readonly host: HTMLElement;
	private readonly file: TFile | null;
	private readonly detachKeymap: () => void;
	private readonly resizeObserver: ResizeObserver;

	private query: SearchQuery;
	private ranges: PreviewHighlightRange[] = [];
	private current = -1;
	private renderedText: string | undefined;
	/** 打开浮窗时视口顶部的位置：还没有选中任何匹配时，从这里开始找。 */
	private readonly startAnchor: Anchor;
	/** 用选区预填搜索词时选区的位置。 */
	private seedAnchor: Anchor | null = null;
	private searchTimer: number | null = null;
	private closed = false;

	constructor(
		app: App,
		readonly view: MarkdownView,
		readonly renderer: PreviewRenderer,
		options: Pick<SearchQuery, SearchOption>,
		private readonly callbacks: ReadingSearchCallbacks,
		private readonly onClosed: () => void,
	) {
		this.file = view.file;
		this.query = {searchTerm: '', replaceTerm: '', ...options};
		this.host = view.previewMode.containerEl;
		this.startAnchor = this.getViewportAnchor();

		this.widget = new SearchWidget(this.host.doc, {
			onSearchInput: (value) => this.scheduleSearch(value),
			onReplaceInput: () => undefined,
			onToggleOption: (option) => this.toggleOption(option),
			onNext: () => this.next(),
			onPrev: () => this.prev(),
			onReplace: () => undefined,
			onReplaceAll: () => undefined,
			onToggleReplace: () => this.callbacks.onRequestReplace(this.query.searchTerm),
			onClose: () => this.close(),
		});
		this.widget.setToggleReplaceLabel('Find and replace (switches to editing view)');
		this.widget.setQuery(this.query);
		this.updateCount();

		this.host.addClass('vss-reading-host');
		this.host.appendChild(this.widget.dom);

		// 切到编辑视图时阅读视图会被隐藏：除了 layout-change 事件，再用尺寸变化兜底
		// （其他插件用代码切换模式时不一定触发 layout-change）。
		this.resizeObserver = new ResizeObserver(() => this.closeIfInvalid());
		this.resizeObserver.observe(this.host);

		// 焦点在这个视图内（正文或浮窗）时启用快捷键；阅读视图的正文可以获得焦点（tabindex=-1）。
		this.detachKeymap = attachSearchKeymap(app, view.containerEl, {
			next: () => this.next(),
			prev: () => this.prev(),
			toggleOption: (option) => this.toggleOption(option),
			close: () => {
				this.close();
				return true;
			},
		});
	}

	/**
	 * 打开或再次唤出：有 seed 时用它替换搜索词并搜索，然后聚焦搜索框。
	 * anchor 是 seed 在页面上的位置（来自选区），从这里开始找。
	 */
	show(seed?: string, anchor?: Anchor | null) {
		if (seed) {
			this.cancelScheduledSearch();
			this.query = {...this.query, searchTerm: seed};
			this.widget.setQuery(this.query);
			this.seedAnchor = anchor ?? null;
			this.search(anchor ?? undefined);
		}
		this.widget.focus();
	}

	/** 当前匹配是否就是预填搜索词时选中的那段文本。 */
	isCurrentAtSeed(): boolean {
		const current = this.getCurrentAnchor();
		const seed = this.seedAnchor;
		return Boolean(current && seed && current.sectionIndex === seed.sectionIndex && current.offset === seed.offset);
	}

	next() {
		this.flush();
		if (this.ranges.length === 0) return;
		this.select((this.current + 1) % this.ranges.length);
	}

	prev() {
		this.flush();
		if (this.ranges.length === 0) return;
		const index = this.current < 0 ? this.ranges.length - 1 : this.current - 1;
		this.select((index + this.ranges.length) % this.ranges.length);
	}

	toggleOption(option: SearchOption) {
		this.query = {...this.query, [option]: !this.query[option]};
		this.widget.setQuery(this.query);
		this.callbacks.onOptionsChange(this.query);
		this.cancelScheduledSearch();
		this.search();
	}

	/** 笔记内容变化后（重新渲染完成），按原位置重新搜索。 */
	refreshIfStale() {
		if (this.closed || !this.query.searchTerm) return;
		if (this.renderer.lastText === this.renderedText) return;
		this.search();
	}

	/** 视图已关闭、切到了编辑视图、或换了文件时关闭浮窗。 */
	closeIfInvalid() {
		if (!this.view.containerEl.isConnected || this.view.getMode() !== 'preview' || this.view.file !== this.file) {
			this.close(false);
		}
	}

	close(restoreFocus = true) {
		if (this.closed) return;
		this.closed = true;
		this.resizeObserver.disconnect();
		this.cancelScheduledSearch();
		this.clearHighlights();
		this.ranges = [];
		this.widget.dom.detach();
		this.host.removeClass('vss-reading-host');
		this.detachKeymap();
		this.onClosed();
		// 与 VS Code 一致：关闭后焦点回到正文，方便继续用键盘滚动。
		if (restoreFocus) this.renderer.previewEl.focus();
	}

	/** 输入时稍作防抖，避免长笔记每敲一个字都全文搜索。 */
	private scheduleSearch(value: string) {
		this.query = {...this.query, searchTerm: value};
		this.cancelScheduledSearch();
		this.searchTimer = this.host.win.setTimeout(() => {
			this.searchTimer = null;
			this.search();
		}, 100);
	}

	private cancelScheduledSearch() {
		if (this.searchTimer === null) return;
		this.host.win.clearTimeout(this.searchTimer);
		this.searchTimer = null;
	}

	/** 执行尚未执行的搜索（例如输入后立刻按 Enter），并在笔记内容变化后重新搜索。 */
	private flush() {
		if (this.searchTimer !== null) {
			this.cancelScheduledSearch();
			this.search();
		} else {
			this.refreshIfStale();
		}
	}

	/**
	 * 重新计算所有匹配，并选中「当前位置」及之后的第一个：
	 * 当前位置是已选中的匹配（修改搜索词、切换选项时保持在原处），否则是打开浮窗时的视口顶部。
	 */
	private search(from?: Anchor) {
		const anchor = from ?? this.getCurrentAnchor() ?? this.startAnchor;
		this.collectRanges();
		this.selectAtOrAfter(anchor);
	}

	private collectRanges() {
		this.clearHighlights();
		const ranges: PreviewHighlightRange[] = [];
		if (this.query.searchTerm) {
			for (const section of this.renderer.sections) {
				if (!isContentSection(section)) continue;
				const matches = findMatches(getSectionText(section), this.query).filter((m) => m.to > m.from);
				if (matches.length === 0) continue;
				const sectionRanges = matches.map((m) => ({section, start: m.from, end: m.to, active: false}));
				section.highlightRanges = sectionRanges;
				ranges.push(...sectionRanges);
			}
		}
		this.ranges = ranges;
		this.current = -1;
		this.renderedText = this.renderer.lastText;
		this.renderer.queueRender();
	}

	private clearHighlights() {
		for (const section of this.renderer.sections) {
			section.highlightRanges = null;
		}
		this.renderer.queueRender();
	}

	private selectAtOrAfter(anchor: Anchor) {
		if (this.ranges.length === 0) {
			this.updateCount();
			return;
		}
		const sectionIndex = new Map(this.renderer.sections.map((section, i) => [section, i]));
		const index = this.ranges.findIndex((range) => {
			const i = sectionIndex.get(range.section) ?? -1;
			return i > anchor.sectionIndex || (i === anchor.sectionIndex && range.start >= anchor.offset);
		});
		this.select(index === -1 ? 0 : index);
	}

	private select(index: number) {
		const previous = this.ranges[this.current];
		if (previous) previous.active = false;
		this.current = index;
		const range = this.ranges[index];
		if (range) {
			range.active = true;
			this.renderer.selectRange(range);
			this.renderer.queueRender();
		}
		this.updateCount();
	}

	private getCurrentAnchor(): Anchor | null {
		const range = this.ranges[this.current];
		if (!range) return null;
		return {sectionIndex: this.renderer.sections.indexOf(range.section), offset: range.start};
	}

	/** 视口顶部所在的 section。 */
	private getViewportAnchor(): Anchor {
		const scrollTop = this.renderer.previewEl.scrollTop;
		const sections = this.renderer.sections;
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			if (section && this.renderer.getSectionTop(section) >= scrollTop) return {sectionIndex: i, offset: 0};
		}
		return {sectionIndex: 0, offset: 0};
	}

	private updateCount() {
		this.widget.setCount(this.current, this.ranges.length);
	}
}

const openSearches = new Map<MarkdownView, ReadingSearch>();

export function getReadingSearch(view: MarkdownView): ReadingSearch | undefined {
	return openSearches.get(view);
}

/**
 * 在阅读视图中打开（或再次唤出）查找浮窗。
 * 渲染器不可用时返回 false，由调用方回退到切换编辑视图。
 */
export function openReadingSearch(
	app: App,
	view: MarkdownView,
	seed: string,
	options: Pick<SearchQuery, SearchOption>,
	callbacks: ReadingSearchCallbacks,
): boolean {
	let search = openSearches.get(view);
	if (!search) {
		const renderer = getPreviewRenderer(view);
		if (!renderer) return false;
		search = new ReadingSearch(app, view, renderer, options, callbacks, () => openSearches.delete(view));
		openSearches.set(view, search);
	}
	search.show(seed, seed ? getSelectionAnchor(view, search.renderer) : null);
	return true;
}

/** 监听视图切换、笔记修改和插件卸载，保持阅读视图查找的状态正确。 */
export function registerReadingSearch(plugin: Plugin) {
	const {workspace, vault} = plugin.app;

	plugin.registerEvent(workspace.on('layout-change', () => {
		for (const search of [...openSearches.values()]) search.closeIfInvalid();
	}));
	plugin.registerEvent(workspace.on('file-open', () => {
		for (const search of [...openSearches.values()]) search.closeIfInvalid();
	}));

	// 笔记被修改后，阅读视图会异步重新渲染；稍等再按新的内容重新搜索。
	plugin.registerEvent(vault.on('modify', (file) => {
		for (const search of openSearches.values()) {
			if (search.view.file !== file) continue;
			search.view.containerEl.win.setTimeout(() => search.refreshIfStale(), 300);
		}
	}));

	plugin.register(() => {
		for (const search of [...openSearches.values()]) search.close(false);
	});
}
