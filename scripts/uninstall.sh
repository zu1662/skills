#!/usr/bin/env bash
# uninstall.sh - 从已安装工具中移除 my-skills 软链
# 智能检测哪些目标目录存在本项目的软链,交互式选择

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

DRY_RUN=0
CLI_DIRS=""
NON_INTERACTIVE=0

# ============ 参数解析 ============
print_usage() {
  cat <<'USAGE'
用法: uninstall.sh [选项]

选项:
  --all                 非交互,删除所有本项目软链
  --dirs <path,path>    非交互,指定要清理的父目录
  --dry-run             只打印将要执行的操作,不实际删除
  -h, --help            显示帮助

安全保证:
  - 仅删除软链接(不递归删除任何实际内容)
  - 仅删除指向本仓库的软链(避免误删其他工具的软链或真实目录)
  - 删除前会逐条确认目标确实指向本项目
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)      NON_INTERACTIVE=1; CLI_DIRS="__ALL__"; shift ;;
    --dirs)     NON_INTERACTIVE=1; CLI_DIRS="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  print_usage; exit 0 ;;
    *)          err "未知参数: $1"; print_usage; exit 1 ;;
  esac
done

# ============ 预检 ============
hdr "my-skills uninstall"
info "仓库根目录: $(get_repo_root)"

REPO_REAL=$(get_repo_root)

# ============ Step 1:扫描所有目标目录的本项目软链 ============
hdr "Step 1/3 — 扫描已安装的软链"

# 用临时文件记录 (避免 bash 3.2 不支持 declare -A)
LINK_DATA_FILE=$(mktemp)
trap "rm -f '$LINK_DATA_FILE'" EXIT

TOOLS_WITH_LINKS=()

for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r tool_id display _ target_dir <<< "$entry"

  # 仅考虑父目录存在的
  if [[ ! -d "$target_dir" ]]; then
    continue
  fi

  # 收集指向本项目的软链
  installed_names=()
  while IFS= read -r name; do
    [[ -n "$name" ]] && installed_names+=("$name")
  done < <(list_installed_links "$target_dir" || true)

  count=${#installed_names[@]}

  if (( count > 0 )); then
    TOOLS_WITH_LINKS+=("$tool_id")
    # 写入临时文件: tool_id|count|names-space-separated
    printf '%s|%d|%s\n' "$tool_id" "$count" "${installed_names[*]}" >> "$LINK_DATA_FILE"
    ok "  [$display] $count 个本项目软链"
    for n in "${installed_names[@]}"; do
      printf '      - %s\n' "$n"
    done
  else
    printf '  [ ] %s (无本项目软链)\n' "$display"
  fi
done

tool_count() {
  grep -F "$1|" "$LINK_DATA_FILE" 2>/dev/null | head -1 | cut -d'|' -f2
}
tool_names() {
  grep -F "$1|" "$LINK_DATA_FILE" 2>/dev/null | head -1 | cut -d'|' -f3
}

if [[ ${#TOOLS_WITH_LINKS[@]} -eq 0 ]]; then
  info "未发现任何本项目软链,无需卸载"
  exit 0
fi

# ============ Step 2:选择要清理的目标 ============
hdr "Step 2/3 — 选择要清理的目标"

SELECTED_DIRS=()
SELECTED_LABELS=()

if (( NON_INTERACTIVE )); then
  if [[ "$CLI_DIRS" == "__ALL__" ]]; then
    for tid in "${TOOLS_WITH_LINKS[@]}"; do
      SELECTED_DIRS+=("$(get_target_dir "$tid")")
      SELECTED_LABELS+=("$(get_display_name "$tid")")
    done
    info "非交互 --all:将清理 ${#SELECTED_DIRS[@]} 个目录"
  else
    IFS=',' read -ra requested <<< "$CLI_DIRS"
    for d in "${requested[@]}"; do
      d=$(echo "$d" | tr -d ' \t')
      [[ -z "$d" ]] && continue
      # 解析为绝对路径
      if [[ "$d" != /* ]]; then
        d="$PWD/$d"
      fi
      # 校验:必须在注册表中且有本项目软链
      matched=0
      for tid in "${TOOLS_WITH_LINKS[@]}"; do
        target=$(get_target_dir "$tid")
        if [[ "$target" == "$d" ]]; then
          SELECTED_DIRS+=("$target")
          SELECTED_LABELS+=("$(get_display_name "$tid")")
          matched=1
          break
        fi
      done
      if (( !matched )); then
        warn "目录 $d 没有本项目软链或不存在,跳过"
      fi
    done
  fi
else
  # 交互模式
  MENU_INPUT=""
  for tid in "${TOOLS_WITH_LINKS[@]}"; do
    display=$(get_display_name "$tid")
    target=$(get_target_dir "$tid")
    count=$(tool_count "$tid")
    MENU_INPUT+="${target}|${display} (${count} 个软链)\n"
  done
  MENU_INPUT+="all|全部 (${#TOOLS_WITH_LINKS[@]} 个目录)"

  if printf '%b' "$MENU_INPUT" | interactive_select "选择要清理的目录" "默认:全部"; then
    if [[ "$SELECTED_TOOLS" == "__DEFAULT__" || "$SELECTED_TOOLS" == "__ALL__" ]]; then
      for tid in "${TOOLS_WITH_LINKS[@]}"; do
        SELECTED_DIRS+=("$(get_target_dir "$tid")")
        SELECTED_LABELS+=("$(get_display_name "$tid")")
      done
    else
      for target in $SELECTED_TOOLS; do
        # 反查 display
        for tid in "${TOOLS_WITH_LINKS[@]}"; do
          t=$(get_target_dir "$tid")
          if [[ "$t" == "$target" ]]; then
            SELECTED_LABELS+=("$(get_display_name "$tid")")
            break
          fi
        done
        SELECTED_DIRS+=("$target")
      done
    fi
  else
    info "已取消"
    exit 0
  fi
fi

if [[ ${#SELECTED_DIRS[@]} -eq 0 ]]; then
  warn "没有选中任何目录"
  exit 0
fi

info "将清理: ${SELECTED_LABELS[*]}"

# ============ Step 3:删除软链 ============
hdr "Step 3/3 — 删除软链"

REMOVED=0
SKIPPED=0
FAILED=0

for idx in "${!SELECTED_DIRS[@]}"; do
  target_dir="${SELECTED_DIRS[$idx]}"
  label="${SELECTED_LABELS[$idx]}"
  echo ""
  info "[$label] 目标: $target_dir/"

  if [[ ! -d "$target_dir" ]]; then
    warn "  目录不存在,跳过"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # 再次扫描本项目软链(避免与并发修改冲突)
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    link_path="$target_dir/$name"

    # 再次校验:必须是软链 + 指向本项目
    status=$(check_link_status "$link_path")
    if [[ "$status" != "1" ]]; then
      warn "  - $name (状态变更,跳过;当前状态码=$status)"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    if (( DRY_RUN )); then
      echo "  [DRY] rm '$link_path'"
      REMOVED=$((REMOVED + 1))
    else
      if rm "$link_path" 2>/dev/null; then
        ok "  - $name (已删除)"
        REMOVED=$((REMOVED + 1))
      else
        err "  ✗ $name (删除失败)"
        FAILED=$((FAILED + 1))
      fi
    fi
  done < <(list_installed_links "$target_dir" || true)
done

# ============ 汇总 ============
hdr "完成"
if (( DRY_RUN )); then
  echo -e "${C_YELLOW}DRY-RUN 模式,未做实际修改${C_RESET}"
fi
echo "  删除: $REMOVED"
echo "  跳过: $SKIPPED"
echo "  失败: $FAILED"
echo ""

if (( FAILED > 0 )); then
  warn "存在失败条目,请检查日志"
  exit 1
fi

ok "完成"
