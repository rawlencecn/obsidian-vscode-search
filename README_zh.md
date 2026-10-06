# Enhanced search and replace（中文）

[English README](README.md)

一个用于 Obsidian 的编辑器内联搜索与替换面板。

## 功能

- 在编辑器中显示内联查找面板。
- 支持查找与替换模式。
- 支持区分大小写、全词匹配、正则表达式。
- 高亮当前编辑器中的匹配项。
- 全局 `Esc` 关闭面板（即使输入框没有焦点）。
- 编辑器或面板有焦点时支持 VS Code 快捷键（见下文）。
- 支持阅读视图：面板打开期间笔记会临时切到编辑视图，关闭面板后切回阅读视图；阅读视图中选中的文本会预填到搜索框。

## 快捷键

通过 Obsidian 的快捷键设置为本插件命令绑定按键：

1. 打开 **设置 → 快捷键**。
2. 在搜索框输入 `Enhanced search and replace`（或直接搜 `Find`）。
3. 找到并绑定以下命令：
   - `Enhanced search and replace: Find`
   - `Enhanced search and replace: Find and replace`
   - 可选：`Find next`、`Find previous`、`Toggle match case`、`Toggle match whole word`、`Toggle use regular expression`

建议绑定：
- Windows / Linux：`Ctrl+F` → Find，`Ctrl+H` → Find and replace
- macOS：`Cmd+F` → Find（另一条按个人习惯设置）

### 内置 VS Code 快捷键

面板打开、且焦点在编辑器或面板内时直接可用，无需配置。仅在这种情况下，它们会优先于绑定在同一按键上的全局快捷键（例如 `Cmd+G` →「打开关系图谱」）。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 下一个匹配 | `Enter`、`Cmd+G`、`F3` | `Enter`、`F3` |
| 上一个匹配 | `Shift+Enter`、`Shift+Cmd+G`、`Shift+F3` | `Shift+Enter`、`Shift+F3` |
| 切换区分大小写 | `Alt+Cmd+C` | `Alt+C` |
| 切换全词匹配 | `Alt+Cmd+W` | `Alt+W` |
| 切换正则表达式 | `Alt+Cmd+R` | `Alt+R` |
| 替换当前（替换模式） | `Shift+Cmd+1` | `Shift+Ctrl+1` |
| 全部替换（替换模式） | `Alt+Cmd+Enter` | `Alt+Ctrl+Enter` |

面板已打开时再次执行 **Find**，焦点会回到搜索框。面板关闭时执行 **Find next** / **Find previous** 会先打开面板（用选区预填）。

也可以通过命令面板触发：`Cmd/Ctrl+P` 搜索 `Enhanced search and replace: Find`。

## 安装（手动）

- 复制 `main.js`、`manifest.json`、`styles.css` 到：
  - `<Vault>/.obsidian/plugins/enhanced-search-replace/`
- 重载 Obsidian 并启用插件。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 备注

- 搜索 UI 以 CodeMirror 6 panel 的形式实现。
- 一些内部编辑器字段（例如底层的 CodeMirror view）通过 Obsidian 运行时对象访问。
