# ✈️ flying-notifier

> 一架小飞机拉着横幅从屏幕左侧飞到右侧，盖在所有应用之上，告诉你「哪个 AI 会话 / 哪条消息」需要你关注。

当你同时开着好几个 Claude Code 会话、又在等飞书消息时，很容易错过「某个会话卡住了 / 需要授权 / 跑完了」。flying-notifier 把这些**散落在各处的"该我出手了"信号**，统一收成一个**全局、显眼、盖在最上层**的通知层——用一架拉横幅的小飞机表达。

- **不同场景不同机型**：Claude Code ✈️ / 飞书 🚁 / codex 🛩️
- **同场景不同类型不同配色**：需授权(红) / 需确认(橙) / 卡住等待(黄) / 已完成(绿)
- **场景用 LOGO 标识**：横幅左侧是该软件的图标，不靠文字
- **盖在所有应用上层**（含别的 App 全屏），鼠标点击穿透
- **飞到右侧停住**，你把光标移上去再移开它才飞走；**点击横幅/飞机可跳转到对应场景**（如打开该会话的项目目录）
- 飞过约 8 秒，看得清
- **飞过带合成喷气音效**（无需音频文件，Web Audio 实时合成）

## 工作原理

```
触发源(adapters) ──POST──> 本地事件服务(:47800) ──IPC──> 透明置顶覆盖层(渲染飞机+横幅)
  · Claude Code hooks
  · 飞书 lark-cli 轮询
  · codex / 任意脚本
```

一个 Electron 进程同时是**事件服务器**和**渲染层**。任何来源只要往 `http://127.0.0.1:47800/notify` POST 一个 JSON 事件，就会有一架对应的飞机飞过。新增场景只要写一个"发事件"的适配器，不用动渲染层。

## 安装

需要 Node.js ≥ 18。

```bash
git clone https://github.com/ymzlsy/little-tools.git
cd little-tools/tools/flying-notifier
npm install
npm start
```

启动后没有窗口（纯后台覆盖层），它在 `127.0.0.1:47800` 监听事件。

## 试一下

另开一个终端，发测试事件：

```bash
node src/send-test.js claude  auth    "沈阳客运 · Claude 需要授权运行 Bash"
node src/send-test.js feishu  confirm "数字人沟通群 · 评审会即将开始"
node src/send-test.js codex   done    "codex · 重构任务已完成"
```

或直接用 curl：

```bash
curl -X POST http://127.0.0.1:47800/notify \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"claude","type":"auth","message":"需要授权"}'
```

## 事件格式

| 字段 | 值 | 说明 |
|------|-----|------|
| `scenario` | `claude` / `feishu` / `codex` | 决定机型与左侧 LOGO |
| `type` | `auth` / `confirm` / `stuck` / `done` | 决定横幅配色与标题 |
| `title` | 字符串（可选） | 不传则用 type 的默认标题 |
| `message` | 字符串 | 横幅正文 |
| `timing` | `{cross, exit}` 毫秒（可选） | 飞入时长(默认 8000) / 飞出时长 |
| `action` | `{type, target}`（可选） | 点击横幅/飞机时跳转。type：`open`(目录/文件) / `url`(网址或深链) / `app`(激活App) / `reveal`(访达定位) / `exec`(命令) |

## 开机自启（macOS）

```bash
bash adapters/install-launchagent.sh
```

登录自动启动 + 崩溃自动拉起，从此不用手动开关。直接跑 Electron 二进制（跳过 node 启动器），空闲约 140MB。卸载/重启命令脚本运行后会打印。

## 接入 Claude Code（推荐）

仓库自带适配器 `adapters/claude-hook.js`：从 stdin 读 hook JSON，映射成事件 POST 给通知器；通知器没开/超时一律静默退出 0，**绝不阻塞 Claude**。

在 `~/.claude/settings.json` 加三个 hook（把路径换成你的绝对路径）：

```jsonc
{
  "hooks": {
    "Notification":     [{ "hooks": [{ "type": "command",
      "command": "node \"/绝对路径/adapters/claude-hook.js\"" }] }],
    "Stop":             [{ "hooks": [{ "type": "command",
      "command": "node \"/绝对路径/adapters/claude-hook.js\"" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command",
      "command": "node \"/绝对路径/adapters/claude-hook.js\"" }] }]
  }
}
```

- `Notification`（message 含 permission/授权）→ 需授权(红)，否则 → 卡住等待(黄)，**立即弹**
- `Stop` → 已完成(绿)，**立即弹**
- `UserPromptSubmit` → 仅用于更新"活跃度"（喂给摸鱼督察），不弹飞机

横幅显示项目名（取 `cwd`），多会话并发可区分。

### 行为细节

- **多架同时**：已有飞机停在右侧时，新通知在**下方错开一条**同时停，不互相等待
- **停靠交互**：飞机停右侧后一直等你；光标移上去可点击（点击=跳转/激活 Claude 并取消该会话后续提醒），**点击不飞走**，只有光标离开后才飞走
- 所有类型即时弹出

## 资源占用

按需创建窗口、空闲销毁，平时完全休眠：

| 状态 | 内存 | CPU / GPU |
|------|------|-----------|
| 空闲（无通知） | ~140MB | 0% / 无 GPU 进程 |
| 通知飞行/停留中 | ~190MB | ≈0% |
| 挥手赶走后 | 回到 ~140MB | 0% |

已关闭硬件加速、仅在飞机停留期间监听鼠标，对 CPU/电池/风扇几乎零打扰。~140MB 是 Electron 运行时地板。

## 路线图

- [x] 透明置顶覆盖层 + 飞机拉横幅动画 + 排队
- [x] 本地事件服务（HTTP）
- [x] 飞过合成音效
- [x] 停在右侧、悬停移开才飞走
- [x] 按需创建 / 空闲销毁，平时休眠（空闲 ~140MB，0% CPU）
- [x] Claude Code hook 适配器（`adapters/claude-hook.js`，Notification/Stop/UserPromptSubmit）
- [x] 登录自启（macOS LaunchAgent，`adapters/install-launchagent.sh`）
- [x] 多航道（多条通知上下错开同时停）
- [x] 任务完成即时通知（所有场景）
- [x] 副屏飞行层（大飞机沿样条路径转圈 + 软绳拖 LOGO + 橙色云尾，无横幅）
- [x] 摸鱼督察（>1h 无活动，每 20min 副屏飞带横幅讽刺文案 + Claude 5h/周额度剩余小字）
- [x] 状态栏 tee（adapters/statusline-wrap.sh）抓取 rate_limits 供额度小字
- [x] codex 适配器（`adapters/codex-notify.js`，转发 Computer Use + 完成即弹）
- [x] 飞书会议提醒（`adapters/feishu-poller.js`，会前 20/5 分钟各一次，点击开会议）
- [ ] 配置文件（自定义机型 / 配色 / 音效 / 位置 / 提醒间隔）

## 接入 codex

codex 的 `notify` 槽常被「Codex Computer Use」占用。`adapters/codex-notify.js` 是个**转发包装**：先原样转发给 Computer Use（不影响它），再在任务完成时通知小飞机。在 `~/.codex/config.toml`：

```toml
notify = ["node", "/绝对路径/adapters/codex-notify.js", "turn-ended"]
```

codex 完成 → 立即弹绿色「已完成」🛩️，点击激活 Codex App。

## 飞书会议提醒

`adapters/feishu-poller.js` 每分钟用 `lark-cli calendar +agenda` 拉日程，会议**开始前 20 分钟、5 分钟各提醒一次**（去重），🚁 橙色横幅显示会议名与剩余分钟，点击用 `app_link` 打开该会议。由独立 LaunchAgent 经登录 shell 启动以继承 lark-cli 鉴权（安装脚本会一并装好）。

## License

[MIT](./LICENSE) © 2026 杨明哲 (Mike / ymzlsy)
