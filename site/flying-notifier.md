# ✈️ flying-notifier

> 一架小飞机拉着横幅从屏幕左侧飞到右侧，盖在所有应用之上，告诉你「哪个 AI 会话 / 哪条消息」需要你关注。

## 它解决什么

同时开着好几个 Claude Code 会话，又在等飞书消息时，很容易错过「某个会话卡住了 / 需要授权 / 跑完了」。flying-notifier 把这些散落在各处的「该我出手了」信号，统一收成一个**全局、显眼、盖在最上层**的通知层——用一架拉横幅的小飞机表达。

- **不同场景不同机型**：Claude Code ✈️ / 飞书 🚁 / codex 🛩️
- **同场景不同类型不同配色**：需授权(红) / 需确认(橙) / 卡住等待(黄) / 已完成(绿)
- **场景用 LOGO 标识**，横幅左侧放该软件图标，不靠文字
- **盖在所有应用上层**（含别的 App 全屏），鼠标点击穿透
- **飞到右侧停住**，光标移上去再移开才飞走
- **飞过带合成喷气音效**（Web Audio 实时合成，无需音频文件）

## 动态体验

点按钮发射一架通知飞机。飞机停在右侧后，把光标移上去再移开，它才会飞走。<br>
（建议打开声音 🔊，能听到合成喷气声）

<iframe
  src="/demo/"
  title="flying-notifier 动态体验"
  style="width:100%;height:340px;border:0;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.18);margin:14px 0;"
  loading="lazy"
></iframe>

> 桌面版会真正盖在所有应用之上、鼠标点击穿透；网页 Demo 只演示飞机与横幅的视觉、配色、机型与音效。

## 工作原理

```
触发源(adapters) ──POST──> 本地事件服务(:47800) ──IPC──> 透明置顶覆盖层(渲染飞机+横幅)
  · Claude Code hooks
  · 飞书 lark-cli 轮询
  · codex / 任意脚本
```

一个 Electron 进程同时是**事件服务器**和**渲染层**。任何来源只要往 `http://127.0.0.1:47800/notify` POST 一个 JSON 事件，就会有一架对应的飞机飞过。新增场景只要写一个「发事件」的适配器，不用动渲染层。

## 安装

需要 Node.js ≥ 18。

```bash
git clone https://github.com/ymzlsy/little-tools.git
cd little-tools/tools/flying-notifier
npm install
npm start
```

启动后没有窗口（纯后台覆盖层），在 `127.0.0.1:47800` 监听事件。

## 使用

另开一个终端发测试事件：

```bash
node src/send-test.js claude  auth    "沈阳客运 · Claude 需要授权运行 Bash"
node src/send-test.js feishu  confirm "数字人沟通群 · 评审会即将开始"
node src/send-test.js codex   done    "codex · 重构任务已完成"
```

或用 curl：

```bash
curl -X POST http://127.0.0.1:47800/notify \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"claude","type":"auth","message":"需要授权"}'
```

### 事件格式

| 字段 | 值 | 说明 |
|------|-----|------|
| `scenario` | `claude` / `feishu` / `codex` | 决定机型与左侧 LOGO |
| `type` | `auth` / `confirm` / `stuck` / `done` | 决定横幅配色与标题 |
| `title` | 字符串（可选） | 不传则用 type 的默认标题 |
| `message` | 字符串 | 横幅正文 |
| `timing` | `{cross, exit}` 毫秒（可选） | 飞入 / 飞出时长 |

## 接入 Claude Code

在 `~/.claude/settings.json` 加两个 hook，让真实会话状态触发飞机：

- `Notification` → 需授权 / 卡住等待
- `Stop` → 已完成

> 适配器与开机自启（macOS LaunchAgent）正在完善，见仓库 README 的路线图。

## 源码与许可

- 源码：[github.com/ymzlsy/little-tools/tree/main/tools/flying-notifier](https://github.com/ymzlsy/little-tools/tree/main/tools/flying-notifier)
- License：MIT
