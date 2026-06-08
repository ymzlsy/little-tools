#!/usr/bin/env bash
# 安装 flying-notifier 为 macOS 登录自启服务（LaunchAgent）。
# 直接跑 Electron 二进制（跳过 node 启动器，省内存），登录自启 + 崩溃自动拉起。
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_BIN="$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
LABEL="com.karaithy.flying-notifier"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -x "$ELECTRON_BIN" ]; then
  echo "找不到 Electron 二进制，请先在 $APP_DIR 执行 npm install" >&2
  exit 1
fi

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
    <string>$APP_DIR</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/tmp/flying-notifier.log</string>
  <key>StandardErrorPath</key><string>/tmp/flying-notifier.log</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "✅ 已安装并启动：$LABEL"
echo "   plist: $PLIST"
echo "   日志:  /tmp/flying-notifier.log"
echo ""
echo "卸载： launchctl unload \"$PLIST\" && rm \"$PLIST\""
echo "重启： launchctl unload \"$PLIST\" && launchctl load \"$PLIST\""
