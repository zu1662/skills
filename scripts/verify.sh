#!/usr/bin/env bash
# verify.sh - 验证各 AI 工具是否正确识别本项目安装的 skill
# 检查软链完整性 + 调用各工具的 list 命令(若可用)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

hdr "my-skills verify"
info "仓库根目录: $(get_repo_root)"

REPO_REAL=$(get_repo_root)
SKILLS_LIST=()
while IFS='|' read -r name category dir command_flag; do
  [[ -z "$name" ]] && continue
  SKILLS_LIST+=("$name|$category|$dir|$command_flag")
done < <(scan_skills) || true

if [[ ${#SKILLS_LIST[@]} -eq 0 ]]; then
  warn "skills/ 目录下没有发现任何 skill"
  echo ""
  info "提示:在 skills/<category>/<skill-name>/SKILL.md 添加 skill 后重试"
  exit 0
fi

echo ""
ok "仓库内发现 ${#SKILLS_LIST[@]} 个 skill:"
for entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r name category _ command_flag <<< "$entry"
  if [[ "$command_flag" == "true" ]]; then
    printf '    - %s%s%s (%s/, command: enabled)\n' "$C_BOLD" "$name" "$C_RESET" "$category"
  else
    printf '    - %s%s%s (%s/)\n' "$C_BOLD" "$name" "$C_RESET" "$category"
  fi
done

# ============ 检查每个工具的目标目录 ============
hdr "工具级软链状态"

# CLI 调用模板 (避免 bash 3.2 不支持 declare -A)
CLI_CMDS_CLAUDE="claude skills list"
CLI_CMDS_OPENCODE="opencode skills list"
CLI_CMDS_CODEX="codex skills list"
CLI_CMDS_AGENTS=""

get_cli_cmd() {
  case "$1" in
    claude)   echo "$CLI_CMDS_CLAUDE" ;;
    opencode) echo "$CLI_CMDS_OPENCODE" ;;
    codex)    echo "$CLI_CMDS_CODEX" ;;
    agents)   echo "$CLI_CMDS_AGENTS" ;;
    *)        echo "" ;;
  esac
}

# 打印单个目录下的本项目软链
print_dir_links() {
  local label="$1" dir="$2"
  if [[ -z "$dir" || ! -d "$dir" ]]; then
    return
  fi

  installed_names=()
  while IFS= read -r name; do
    [[ -n "$name" ]] && installed_names+=("$name")
  done < <(list_installed_links "$dir" || true)

  echo ""
  info "  [$label] $dir"
  if [[ ${#installed_names[@]} -eq 0 ]]; then
    warn "    未发现本项目软链"
    return
  fi

  ok "    本项目软链: ${#installed_names[@]} 个"
  for n in "${installed_names[@]}"; do
    link_path="$dir/$n"
    if [[ -L "$link_path" ]] && [[ -e "$link_path" ]]; then
      target=$(readlink "$link_path")
      printf '        %s ✓%s %s -> %s\n' "$C_GREEN" "$C_RESET" "$n" "$target"
    else
      printf '        %s ✗%s %s (软链已损坏)\n' "$C_RED" "$C_RESET" "$n"
    fi
  done
}

for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r tool_id display _ skills_dir commands_dir <<< "$entry"

  echo ""
  info "[$display]"
  print_dir_links "skills" "$skills_dir"
  print_dir_links "commands" "$commands_dir"

  # 调用工具 CLI 列出 skills(若可用)
  cmd=$(get_cli_cmd "$tool_id")
  if [[ -n "$cmd" ]] && command -v "${cmd%% *}" >/dev/null 2>&1; then
    echo ""
    info "  执行: $cmd"
    if ! $cmd 2>&1 | head -20; then
      warn "  CLI 调用失败(不影响软链状态)"
    fi
  fi
done

# ============ 完整性汇总 ============
hdr "完整性检查"

# 检查仓库内每个 skill:
#  - 至少在一个工具的 skills_dir 目录下可达
#  - 标记了 command: true 的 skill,还要求至少在一个工具的 commands_dir 下可达
# 用临时文件避免 bash 3.2 不支持 declare -A
REACH_FILE=$(mktemp)
trap "rm -f '$REACH_FILE'" EXIT

for s_entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r s_name _ _ command_flag <<< "$s_entry"
  printf '%s|%s|0|0\n' "$s_name" "$command_flag" >> "$REACH_FILE"
done

# 更新 skills 维度可达性
for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r _ _ _ skills_dir _ <<< "$entry"
  [[ -d "$skills_dir" ]] || continue
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if grep -q "^${name}|.*|0|" "$REACH_FILE" 2>/dev/null; then
      sed -i.bak "s/^${name}|\([^|]*\)|0|\([^|]*\)$/${name}|\1|1|\2/" "$REACH_FILE" 2>/dev/null || \
        sed -i '' "s/^${name}|\([^|]*\)|0|\([^|]*\)$/${name}|\1|1|\2/" "$REACH_FILE"
      rm -f "$REACH_FILE.bak"
    fi
  done < <(list_installed_links "$skills_dir" || true)
done

# 更新 commands 维度可达性(以 "<name>.md" 文件名形式存在于 commands_dir)
for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r _ _ _ _ commands_dir <<< "$entry"
  [[ -n "$commands_dir" ]] || continue
  [[ -d "$commands_dir" ]] || continue
  # 用 find 列出本项目软链(commands 下是文件 <name>.md,需要去掉 .md)
  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    base=$(basename "$link" .md)
    if grep -q "^${base}|true|.*|0$" "$REACH_FILE" 2>/dev/null; then
      sed -i.bak "s/^${base}|true|\([^|]*\)|0$/${base}|true|\1|1/" "$REACH_FILE" 2>/dev/null || \
        sed -i '' "s/^${base}|true|\([^|]*\)|0$/${base}|true|\1|1/" "$REACH_FILE"
      rm -f "$REACH_FILE.bak"
    fi
  done < <(list_installed_links "$commands_dir" || true)
done

unreachable=0
cmd_unreachable=0
for s_entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r s_name _ _ command_flag <<< "$s_entry"
  line=$(grep -F "${s_name}|" "$REACH_FILE" 2>/dev/null | head -1)
  if [[ -z "$line" ]]; then
    continue
  fi
  IFS='|' read -r _ _ skill_status cmd_status <<< "$line"
  if [[ "$skill_status" != "1" ]]; then
    warn "  ✗ $s_name (无任何工具可访问 — 请运行 ./scripts/install.sh)"
    unreachable=$((unreachable + 1))
  elif [[ "$command_flag" == "true" && "$cmd_status" != "1" ]]; then
    warn "  △ $s_name (command: true,但未在任何工具的 commands/ 派生)"
    cmd_unreachable=$((cmd_unreachable + 1))
  else
    ok "  ✓ $s_name"
  fi
done

echo ""
if (( unreachable == 0 )); then
  ok "所有 skill 至少在一个工具中可达"
else
  warn "$unreachable 个 skill 尚未安装到任何工具,建议运行 ./scripts/install.sh"
fi
if (( cmd_unreachable > 0 )); then
  warn "$cmd_unreachable 个标记 command: true 的 skill 尚未派生到 commands/,建议重跑 ./scripts/install.sh"
fi
