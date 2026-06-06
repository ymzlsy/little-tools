# little-tools

一组自用的桌面 / 效率小工具合集。每个工具是 `tools/` 下的一个独立子项目，自带 README，可单独 fork 复用。

在线工具站（含动态体验 Demo、安装与使用说明）：**https://little-tools.karaithy.com**

## 工具列表

| 工具 | 说明 | 目录 |
|------|------|------|
| ✈️ flying-notifier | 小飞机拉横幅的全局桌面通知层。Claude Code / 飞书 / codex 等场景需要你关注时，一架飞机拉着横幅从屏幕飞过并停在右侧。 | [`tools/flying-notifier`](tools/flying-notifier) |

## 仓库结构

```
little-tools/
├── site/                  # VitePress 工具站 → little-tools.karaithy.com
└── tools/
    └── flying-notifier/   # 工具源码（自带 README / LICENSE）
```

## 新增一个工具

1. 在 `tools/` 下建一个子目录，放源码 + `README.md`
2. 在 `site/` 下加一个 `<tool>.md` 详情页，并在 `site/index.md` 和侧边栏登记
3. `git push` → Cloudflare Pages 自动部署

## License

[MIT](LICENSE)
