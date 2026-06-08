#!/usr/bin/env bash
# 安装 flying-notifier 为 macOS 登录自启服务（LaunchAgent）。
#
# 关键：把运行副本装到 ~/Library/Application Support（非隐私保护目录），
# 避免 launchd 拉起的进程读 ~/Desktop 下文件被 macOS TCC 拦截（EPERM）。
# 源码仍在原仓库开发；改完代码后重跑本脚本即可同步运行副本。
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"            # 源码目录（仓库内）
RUN_DIR="$HOME/Library/Application Support/flying-notifier-app"  # 运行副本目录
LABEL="com.karaithy.flying-notifier"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ELECTRON_BIN="$RUN_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -x "$SRC_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
  echo "源码里没装 Electron，请先在 $SRC_DIR 执行 npm install" >&2
  exit 1
fi

echo "→ 停掉旧实例与旧自启..."
launchctl unload "$PLIST" 2>/dev/null || true
pkill -9 -f "flying-notifier-app/node_modules/electron" 2>/dev/null || true
# 兜底：杀掉任何仍占着事件端口的进程（含早期相对路径起的测试残留）
PORTPIDS=$(lsof -nP -iTCP:47800 2>/dev/null | grep LISTEN | awk '{print $2}' | sort -u)
[ -n "$PORTPIDS" ] && kill -9 $PORTPIDS 2>/dev/null || true
sleep 1

echo "→ 同步运行副本到 $RUN_DIR ..."
mkdir -p "$RUN_DIR"
rsync -a --delete \
  --exclude='.git' --exclude='.DS_Store' \
  "$SRC_DIR"/ "$RUN_DIR"/

echo "→ 写入 LaunchAgent ..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON_BIN</string>
    <string>$RUN_DIR</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <!-- 不设 ProcessType=Background：那会被系统降频调度导致动画卡顿 -->
  <key>StandardOutPath</key><string>/tmp/flying-notifier.log</string>
  <key>StandardErrorPath</key><string>/tmp/flying-notifier.log</string>
</dict>
</plist>
PLISTEOF

launchctl load "$PLIST"

# 飞书会议提醒轮询器（经登录 shell 启动，继承 lark-cli 的 PATH 与鉴权）
POLLER_LABEL="com.karaithy.feishu-poller"
POLLER_PLIST="$HOME/Library/LaunchAgents/$POLLER_LABEL.plist"
launchctl unload "$POLLER_PLIST" 2>/dev/null || true
cat > "$POLLER_PLIST" <<P2
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$POLLER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec node "$RUN_DIR/adapters/feishu-poller.js"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/feishu-poller.log</string>
  <key>StandardErrorPath</key><string>/tmp/feishu-poller.log</string>
</dict>
</plist>
P2
launchctl load "$POLLER_PLIST"

echo ""
echo "✅ 已安装并启动：$LABEL + $POLLER_LABEL（飞书会议提醒）"
echo "   运行副本: $RUN_DIR"
echo "   日志:     /tmp/flying-notifier.log"
echo ""
echo "改完源码后同步：再跑一次本脚本"
echo "卸载：launchctl unload \"$PLIST\" && rm \"$PLIST\""
