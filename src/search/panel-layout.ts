/**
 * 浮窗的位置和宽度：拖动空白处移动浮窗，拖动左边缘调整宽度（与 VS Code 查找小部件的左侧拖拽条一致）。
 *
 * - 位置用「距离容器顶部 / 右侧」表示：容器变宽变窄时浮窗仍贴着右侧，与默认位置的行为一致；
 * - 浮窗始终限制在正文区域内（不盖住滚动条），容器缩小时自动挪回可见范围，但不改动保存的值；
 * - 位置和宽度在所有笔记、编辑视图与阅读视图之间共享，并跨会话保存；
 * - 双击空白处恢复默认位置；双击左边缘在默认宽度与最大宽度之间切换（与 VS Code 一致）。
 */

export interface PanelPosition {
	top: number;
	right: number;
}

export interface PanelLayout {
	/** null 表示默认位置（右上角）。 */
	position: PanelPosition | null;
	/** null 表示默认宽度。 */
	width: number | null;
}

/** 与 styles.css 中的默认值保持一致。 */
const DEFAULT_TOP = 6;
const DEFAULT_RIGHT = 24;
const MIN_WIDTH = 340;

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function parsePosition(value: unknown): PanelPosition | null {
	if (!value || typeof value !== 'object') return null;
	const {top, right} = value as Partial<PanelPosition>;
	return isFiniteNumber(top) && isFiniteNumber(right) ? {top, right} : null;
}

function parseLayout(value: unknown): PanelLayout {
	if (!value || typeof value !== 'object') return {position: null, width: null};
	const {position, width} = value as Partial<PanelLayout>;
	return {
		position: parsePosition(position),
		width: isFiniteNumber(width) && width > 0 ? width : null,
	};
}

/** 保存的布局；所有浮窗共用一份。 */
export class PanelLayoutStore {
	private layout: PanelLayout;

	constructor(saved: unknown, private readonly save: (layout: PanelLayout) => void) {
		this.layout = parseLayout(saved);
	}

	get(): PanelLayout {
		return this.layout;
	}

	set(layout: PanelLayout) {
		this.layout = layout;
		this.save(layout);
	}
}

interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** 元素内容区（不含边框和滚动条）在视口中的位置。 */
function clientBox(el: HTMLElement): Box {
	const rect = el.getBoundingClientRect();
	const left = rect.left + el.clientLeft;
	const top = rect.top + el.clientTop;
	return {left, top, right: left + el.clientWidth, bottom: top + el.clientHeight};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

type DragKind = 'move' | 'resize';

interface DragState {
	kind: DragKind;
	/** 按下的元素：在它上面捕获指针，之后的 click / dblclick 仍以它为目标。 */
	target: Element;
	pointerId: number;
	startX: number;
	startY: number;
	startPosition: PanelPosition;
	startWidth: number;
	moved: boolean;
}

/**
 * 让浮窗可以拖动和调整宽度。
 *
 * panel 必须已经插入文档，且它的 offsetParent 就是定位参照（编辑视图里是 CodeMirror 的 panel 容器，
 * 阅读视图里是 .markdown-reading-view）；bounds 是允许浮窗出现的区域（正文的滚动容器）。
 * 返回清理函数，在浮窗关闭时调用。
 */
export function attachPanelLayout(panel: HTMLElement, bounds: HTMLElement, store: PanelLayoutStore): () => void {
	const win = panel.win;
	const sash = panel.createDiv({cls: 'vss-resize-sash'});
	let layout = store.get();
	let drag: DragState | null = null;
	let frame: number | null = null;

	/** 计算限制在 bounds 内的实际位置和宽度，写入 CSS 变量；没有自定义时交给样式表的默认值。 */
	const apply = () => {
		if (!layout.position && layout.width === null) {
			panel.setCssProps({'--vss-panel-top': '', '--vss-panel-right': '', '--vss-panel-width': ''});
			return;
		}
		const parent = panel.offsetParent;
		if (!(parent instanceof HTMLElement) || bounds.clientWidth === 0) return;

		const area = clientBox(bounds);
		const origin = clientBox(parent);
		const areaWidth = area.right - area.left;

		let width = panel.offsetWidth;
		if (layout.width !== null) {
			width = Math.min(Math.max(layout.width, MIN_WIDTH), areaWidth);
			panel.setCssProps({'--vss-panel-width': `${width}px`});
		} else {
			panel.setCssProps({'--vss-panel-width': ''});
		}

		const height = panel.offsetHeight;
		const position = layout.position ?? {top: DEFAULT_TOP, right: DEFAULT_RIGHT};
		const right = clamp(position.right, origin.right - area.right, origin.right - area.left - width);
		const top = clamp(position.top, area.top - origin.top, area.bottom - origin.top - height);
		panel.setCssProps({'--vss-panel-top': `${top}px`, '--vss-panel-right': `${right}px`});
	};

	/** 浮窗当前实际所在的位置（相对定位参照）。 */
	const currentPosition = (): PanelPosition | null => {
		const parent = panel.offsetParent;
		if (!(parent instanceof HTMLElement)) return null;
		const origin = clientBox(parent);
		const rect = panel.getBoundingClientRect();
		return {top: Math.round(rect.top - origin.top), right: Math.round(origin.right - rect.right)};
	};

	const update = (next: PanelLayout, persist: boolean) => {
		layout = next;
		apply();
		if (persist) store.set(layout);
	};

	const dragKindAt = (target: EventTarget | null): DragKind | null => {
		if (!(target instanceof Element)) return null;
		if (target === sash) return 'resize';
		// 输入框和按钮保持原有交互，其余空白处（含匹配计数）都可以拖动。
		if (target.closest('button, input, .vss-input-box')) return null;
		return 'move';
	};

	const onPointerDown = (evt: PointerEvent) => {
		if (evt.button !== 0 || drag) return;
		const target = evt.target;
		const kind = dragKindAt(target);
		if (!kind || !(target instanceof Element)) return;
		const startPosition = currentPosition();
		if (!startPosition) return;
		drag = {
			kind,
			target,
			pointerId: evt.pointerId,
			startX: evt.clientX,
			startY: evt.clientY,
			startPosition,
			startWidth: panel.offsetWidth,
			moved: false,
		};
		target.setPointerCapture(evt.pointerId);
		panel.addClass(kind === 'move' ? 'is-dragging' : 'is-resizing');
	};

	const onPointerMove = (evt: PointerEvent) => {
		if (!drag || evt.pointerId !== drag.pointerId) return;
		const dx = evt.clientX - drag.startX;
		const dy = evt.clientY - drag.startY;
		if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
		drag.moved = true;
		if (drag.kind === 'move') {
			update({...layout, position: {top: drag.startPosition.top + dy, right: drag.startPosition.right - dx}}, false);
		} else {
			// 右边缘不动，向左拖变宽。
			update({...layout, width: Math.max(drag.startWidth - dx, MIN_WIDTH)}, false);
		}
	};

	const endDrag = () => {
		if (!drag) return;
		const {kind, moved} = drag;
		drag = null;
		panel.removeClass('is-dragging', 'is-resizing');
		if (!moved) return;
		// 保存实际显示的位置和宽度（已限制在可见范围内），下次拖动不会有「拖了却不动」的死区。
		if (kind === 'move') {
			update({...layout, position: currentPosition() ?? layout.position}, true);
		} else {
			update({...layout, width: Math.round(panel.getBoundingClientRect().width)}, true);
		}
	};

	const onPointerUp = (evt: PointerEvent) => {
		if (drag && evt.pointerId === drag.pointerId && drag.target.hasPointerCapture(evt.pointerId)) {
			drag.target.releasePointerCapture(evt.pointerId);
		}
		endDrag();
	};

	// 阻止 mousedown 的默认行为：拖动时不选中文字，焦点也留在输入框里（快捷键继续可用）。
	const onMouseDown = (evt: MouseEvent) => {
		if (dragKindAt(evt.target)) evt.preventDefault();
	};

	const onDoubleClick = (evt: MouseEvent) => {
		const kind = dragKindAt(evt.target);
		if (kind === 'move') {
			update({...layout, position: null}, true);
		} else if (kind === 'resize') {
			// 与 VS Code 一致：默认宽度时双击加宽到接近正文宽度，已调整过时双击恢复默认。
			const width = layout.width === null ? bounds.clientWidth - DEFAULT_RIGHT * 2 : null;
			update({...layout, width}, true);
		}
	};

	panel.addEventListener('pointerdown', onPointerDown);
	panel.addEventListener('pointermove', onPointerMove);
	panel.addEventListener('pointerup', onPointerUp);
	panel.addEventListener('pointercancel', onPointerUp);
	panel.addEventListener('lostpointercapture', endDrag);
	panel.addEventListener('mousedown', onMouseDown);
	panel.addEventListener('dblclick', onDoubleClick);

	// 窗口或侧栏改变正文区域大小、展开替换行改变浮窗高度时，重新限制在可见范围内。
	// 放到下一帧执行：在 ResizeObserver 回调里直接改尺寸会触发「ResizeObserver loop」警告。
	const resizeObserver = new ResizeObserver(() => {
		if (frame !== null) return;
		frame = win.requestAnimationFrame(() => {
			frame = null;
			apply();
		});
	});
	resizeObserver.observe(bounds);
	resizeObserver.observe(panel);
	apply();

	return () => {
		resizeObserver.disconnect();
		if (frame !== null) win.cancelAnimationFrame(frame);
		panel.removeEventListener('pointerdown', onPointerDown);
		panel.removeEventListener('pointermove', onPointerMove);
		panel.removeEventListener('pointerup', onPointerUp);
		panel.removeEventListener('pointercancel', onPointerUp);
		panel.removeEventListener('lostpointercapture', endDrag);
		panel.removeEventListener('mousedown', onMouseDown);
		panel.removeEventListener('dblclick', onDoubleClick);
		panel.removeClass('is-dragging', 'is-resizing');
		sash.detach();
	};
}
