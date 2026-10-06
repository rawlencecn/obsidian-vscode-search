import {MarkdownView, Plugin} from 'obsidian';
import {closeSearch, searchExtension, searchStateField} from './search/search-state';
import {searchPanelExtension} from './search/search-panel';
import {registerSearchCommands} from './search/search-commands';
import {restoreReadingViewOnClose} from './search/reading-view';
import {ObsidianEditor} from './types';

export default class EnhancedSearchReplacePlugin extends Plugin {

	onload() {

		this.registerEditorExtension([searchExtension(), searchPanelExtension, restoreReadingViewOnClose]);

		registerSearchCommands(this);

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			// 全局 Esc：只要面板是打开状态，就关闭（即使搜索框不在焦点）
			if (evt.key === 'Escape') {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return;
				const cmView = (view.editor as ObsidianEditor)?.cm;
				if (!cmView) return;

				try {
					const state = cmView.state.field(searchStateField);
					if (!state?.panelVisible) return;
				} catch {
					return;
				}

				evt.preventDefault();
				evt.stopPropagation();
				cmView.dispatch({effects: closeSearch.of(null)});
				cmView.focus?.();
				return;
			}
		});
	}

	onunload() {
	}
}
