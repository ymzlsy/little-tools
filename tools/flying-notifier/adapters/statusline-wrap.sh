#!/usr/bin/env bash
# 状态栏包装：先把 rate_limits 旁路存盘（后台、不阻塞），再原样把负载喂给 claude-hud 渲染。
# settings.json 的 statusLine.command 指向本脚本即可；claude-hud 行为不变。
input=$(cat)

# 旁路：存额度快照（后台，失败也不影响状态栏）
printf '%s' "$input" | node "$HOME/Library/Application Support/flying-notifier-app/adapters/statusline-tee.js" >/dev/null 2>&1 &

# 原 claude-hud 渲染逻辑
cols=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')
export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 ))
plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-)
printf '%s' "$input" | /usr/local/bin/node "${plugin_dir}dist/index.js"
