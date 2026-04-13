# Enhanced search and replace（中文）

[English README](README.md)

一个用于 Obsidian 的编辑器内联搜索与替换面板。

## 功能

- 在编辑器中显示内联查找面板。
- 支持查找与替换模式。
- 支持区分大小写、全词匹配、正则表达式。
- 高亮当前编辑器中的匹配项。
- 全局 `Esc` 关闭面板（即使输入框没有焦点）。

## 快捷键

通过 Obsidian 的快捷键设置为本插件命令绑定按键：

1. 打开 **设置 → 快捷键**。
2. 在搜索框输入 `Enhanced search and replace`（或直接搜 `Find`）。
3. 找到并绑定以下命令：
   - `Enhanced search and replace: Find`
   - `Enhanced search and replace: Find and replace`

建议绑定：
- Windows / Linux：`Ctrl+F` → Find，`Ctrl+H` → Find and replace
- macOS：`Cmd+F` → Find（另一条按个人习惯设置）

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
