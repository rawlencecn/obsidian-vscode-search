# Enhanced search and replace

[中文 README](README_zh.md)

An inline editor search and replace panel for Obsidian.

## Features

- Inline find panel in the editor.
- Find and replace mode.
- Match case, whole word, and regex.
- Highlights matches in the current editor.
- `Esc` closes the panel globally (even when the input is not focused).
- VS Code keybindings while the editor or the panel is focused (see below).
- Works in reading view: the note switches to editing view while the panel is open and switches back when it closes. Text selected in reading view pre-fills the search box.

## Hotkeys

Bind hotkeys for this plugin via Obsidian settings:

1. Open **Settings → Hotkeys**.
2. Search `Enhanced search and replace` (or just `Find`).
3. Bind these commands:
   - `Enhanced search and replace: Find`
   - `Enhanced search and replace: Find and replace`
   - Optional: `Find next`, `Find previous`, `Toggle match case`, `Toggle match whole word`, `Toggle use regular expression`

Suggested defaults:
- Windows / Linux: `Ctrl+F` → Find, `Ctrl+H` → Find and replace
- macOS: `Cmd+F` → Find (set the other one to your preference)

### Built-in VS Code keybindings

These work out of the box while the panel is open and the focus is in the editor or the panel. They take precedence over global hotkeys bound to the same keys (for example `Cmd+G` → **Open graph view**) only in that situation.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Next match | `Enter`, `Cmd+G`, `F3` | `Enter`, `F3` |
| Previous match | `Shift+Enter`, `Shift+Cmd+G`, `Shift+F3` | `Shift+Enter`, `Shift+F3` |
| Toggle match case | `Alt+Cmd+C` | `Alt+C` |
| Toggle match whole word | `Alt+Cmd+W` | `Alt+W` |
| Toggle regular expression | `Alt+Cmd+R` | `Alt+R` |
| Replace (replace mode) | `Shift+Cmd+1` | `Shift+Ctrl+1` |
| Replace all (replace mode) | `Alt+Cmd+Enter` | `Alt+Ctrl+Enter` |

Running **Find** again while the panel is open moves the focus back to the search box. **Find next** / **Find previous** open the panel (pre-filled with the selection) when it is closed.

You can also trigger via Command Palette: `Cmd/Ctrl+P` and search `Enhanced search and replace: Find`.

## Install (manual)

- Copy `main.js`, `manifest.json`, and `styles.css` to:
  - `<Vault>/.obsidian/plugins/enhanced-search-replace/`
- Reload Obsidian and enable the plugin.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- The search UI is implemented as a CodeMirror 6 panel.
- Some internal editor fields (like the underlying CodeMirror view) are accessed via Obsidian runtime objects.
