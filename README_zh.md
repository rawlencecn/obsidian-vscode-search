# VSCode Search

[English README](README.md)

给 Obsidian 编辑器用的 VS Code 风格查找替换浮窗。

![打开替换行、开启全词匹配时的 VSCode Search 浮窗](images/screenshot.png)

基于 Liu Hao 的 [Enhanced search and replace](https://github.com/liuhaoxd/obsidian-enhanced-search-replace)（Apache-2.0）修改。

## 功能

- **浮窗**：和 VS Code 一样悬浮在编辑器右上角，盖在正文上，不会把正文往下推。
- 搜索框内置区分大小写、全词匹配、正则表达式三个开关。
- 可折叠的替换行（左侧箭头），支持替换当前和全部替换。
- 高亮所有匹配，显示「第 n 个 / 共几个」。
- 编辑器或浮窗有焦点时支持 **VS Code 快捷键**（见下文）。
- **支持阅读视图**：浮窗打开期间笔记临时切到编辑视图，关闭后切回阅读视图；阅读视图里选中的文本会预填到搜索框。
- 兼容 Vim 模式：插入/可视模式下的 `Esc` 先交给 Vim，普通模式下的 `Esc` 关闭浮窗。

## 命令

在 **设置 → 快捷键** 里搜索 `VSCode Search` 绑定：

| 命令 | 建议快捷键（macOS） |
| --- | --- |
| `Find` | `Cmd+F`（替换原生的「在当前文件中查找」） |
| `Find and replace` | `Alt+Cmd+F`（替换原生的「在当前文件中查找并替换」） |
| `Find next` / `Find previous` | 可选 |
| `Toggle match case` / `Toggle match whole word` / `Toggle use regular expression` | 可选 |

Windows / Linux 建议用 `Ctrl+F` 和 `Ctrl+H`。

绑定同一个按键时记得删掉原生命令的绑定，否则 Obsidian 只会执行它先找到的那个命令。

## 内置 VS Code 快捷键

浮窗打开、且焦点在编辑器或浮窗内时直接可用，无需配置。仅在这种情况下，它们会优先于绑定在同一按键上的全局快捷键（例如 `Cmd+G` →「打开关系图谱」）；其他地方的全局快捷键不受影响。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 下一个匹配 | `Enter`、`Cmd+G`、`F3` | `Enter`、`F3` |
| 上一个匹配 | `Shift+Enter`、`Shift+Cmd+G`、`Shift+F3` | `Shift+Enter`、`Shift+F3` |
| 切换区分大小写 | `Alt+Cmd+C` | `Alt+C` |
| 切换全词匹配 | `Alt+Cmd+W` | `Alt+W` |
| 切换正则表达式 | `Alt+Cmd+R` | `Alt+R` |
| 替换当前（替换行展开时） | `Shift+Cmd+1` | `Shift+Ctrl+1` |
| 全部替换（替换行展开时） | `Alt+Cmd+Enter` | `Alt+Ctrl+Enter` |
| 关闭 | `Esc` | `Esc` |

与 VS Code 一致的细节：

- 浮窗已打开时再次执行 **Find**，焦点回到搜索框。
- 已有搜索词时执行 **Find and replace**，焦点进入替换框。
- 浮窗关闭时执行 **Find next** / **Find previous**，会先用选区预填并打开浮窗。
- 选中的文本本身就是匹配时，它就是当前匹配。

## 安装（手动）

把 `main.js`、`manifest.json`、`styles.css` 复制到 `<Vault>/.obsidian/plugins/vscode-search/`，然后在 **设置 → 第三方插件** 里启用 **VSCode Search**。

## 开发

```bash
npm install
npm run dev     # 监听构建
npm run build   # 类型检查 + 生产构建
npm run lint
```

Release 由 GitHub Actions 构建并附带构建来源证明（attestation）：用 `npm version x.y.z` 升版本号，再 `git push --follow-tags`。

## 许可

Apache-2.0。本项目是 Enhanced search and replace 的修改版，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
