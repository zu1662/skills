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
while IFS='|' read -r name category dir; do
  [[ -z "$name" ]] && continue
  SKILLS_LIST+=("$name|$category|$dir")
done < <(scan_skills) || true

if [[ ${#SKILLS_LIST[@]} -eq 0 ]]; then
  warn "skills/ 目录下没有发现任何 skill"
fi

echo ""
ok "仓库内发现 ${#SKILLS_LIST[@]} 个 skill:"
for entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r name category _ <<< "$entry"
  printf '    - %s%s%s (%s/)\n' "$C_BOLD" "$name" "$C_RESET" "$category"
done

# ============ 检查每个工具的目标目录 ============
hdr "工具级软链状态"

declare -A CLI_CMDS=(
  [claude]="claude skills list"
  [opencode]="opencode skills list"
  [codex]="codex skills list"
  [agents]=""  # 共享别名,无独立 CLI
)

for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r tool_id display _ target_dir <<< "$entry"

  echo ""
  info "[$display] 目标: $target_dir"

  if [[ ! -d "$target_dir" ]]; then
    warn "  目录不存在(若需要请先运行一次对应工具)"
    continue
  fi

  # 列出本项目软链
  installed_names=()
  while IFS= read -r name; do
    [[ -n "$name" ]] && installed_names+=("$name")
  done < <(list_installed_links "$target_dir" || true)

  if [[ ${#installed_names[@]} -eq 0 ]]; then
    warn "  未发现本项目软链"
    continue
  fi

  ok "  本项目软链: ${#installed_names[@]} 个"
  for n in "${installed_names[@]}"; do
    link_path="$target_dir/$n"
    if [[ -L "$link_path" ]] && [[ -e "$link_path" ]]; then
      target=$(readlink "$link_path")
      printf '      %s ✓%s %s -> %s\n' "$C_GREEN" "$C_RESET" "$n" "$target"
    else
      printf '      %s ✗%s %s (软链已损坏)\n' "$C_RED" "$C_RESET" "$n"
    fi
  done

  # 调用工具 CLI 列出 skills(若可用)
  if [[ -n "${CLI_CMDS[$tool_id]:-}" ]]; then
    cmd="${CLI_CMDS[$tool_id]}"
    if command -v "${cmd%% *}" >/dev/null 2>&1; then
      echo ""
      info "  执行: $cmd"
      if ! $cmd 2>&1 | head -20; then
        warn "  CLI 调用失败(不影响软链状态)"
      fi
    fi
  fi
done

# ============ 完整性汇总 ============
hdr "完整性检查"

# 检查仓库内每个 skill 至少在一个工具目录下可达
declare -A SKILL_REACHABLE
for s_entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r s_name _ _ <<< "$s_entry"
  SKILL_REACHABLE[$s_name]=0
done

for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r _ _ _ target_dir <<< "$entry"
  [[ -d "$target_dir" ]] || continue
  while IFS= read -r name; do
    [[ -n "$name" ]] && SKILL_REACHABLE[$name]=1
  done < <(list_installed_links "$target_dir" || true)
done

unreachable=0
for s_entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r s_name _ _ <<< "$s_entry"
  if [[ "${SKILL_REACHABLE[$s_name]}" == "0" ]]; then
    warn "  ✗ $s_name (无任何工具可访问 — 请运行 ./scripts/install.sh)"
    unreachable=$((unreachable + 1))
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
