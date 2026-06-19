#!/usr/bin/env bash
# install.sh - 为 my-skills 仓库中的所有 skill 创建软链
# 自动检测已安装的 AI 工具,交互式选择目标(支持 CLI 参数)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

DRY_RUN=0
FORCE=0
CLI_TOOLS=""
NON_INTERACTIVE=0

# ============ 参数解析 ============
print_usage() {
  cat <<'USAGE'
用法: install.sh [选项]

选项:
  --all                  非交互,安装到全部已检测工具
  --tools <id,id,...>    非交互,指定工具 id(claude,opencode,codex,agents)
  --dry-run              只打印将要执行的操作,不实际创建
  --force                强制覆盖已存在的同名非软链条目
  -h, --help             显示帮助

工具 id:
  claude     Claude Code(~/.claude/skills/)
  opencode   OpenCode(~/.config/opencode/skills/)
  codex      Codex(~/.codex/skills/)
  agents     .agents 别名(~/.agents/skills/ — 由 OpenCode 与 Gemini CLI 共享)

示例:
  ./install.sh                           交互式
  ./install.sh --all                     安装到全部已检测
  ./install.sh --tools claude,opencode   仅安装到 Claude Code + OpenCode
  ./install.sh --dry-run --all           预览将执行的操作
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)       NON_INTERACTIVE=1; CLI_TOOLS="__ALL__"; shift ;;
    --tools)     NON_INTERACTIVE=1; CLI_TOOLS="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --force)     FORCE=1; shift ;;
    -h|--help)   print_usage; exit 0 ;;
    *)           err "未知参数: $1"; print_usage; exit 1 ;;
  esac
done

# ============ 预检:仓库根目录 ============
hdr "my-skills install"
info "仓库根目录: $(get_repo_root)"
info "Skills 源目录: $SKILLS_DIR"

# ============ Step 1:扫描 skills ============
hdr "Step 1/4 — 扫描 skills/ 目录"
SKILLS_LIST=()
while IFS='|' read -r name category dir command_flag; do
  [[ -z "$name" ]] && continue
  SKILLS_LIST+=("$name|$category|$dir|$command_flag")
done < <(scan_skills) || {
  err "skills 扫描失败(命名冲突或 frontmatter 错误),请修复后重试"
  exit 1
}

if [[ ${#SKILLS_LIST[@]} -eq 0 ]]; then
  warn "未发现任何 skill(应在 skills/<category>/<skill-name>/SKILL.md 添加)"
  info "本次 install 不会做任何事"
  exit 0
fi

ok "发现 ${#SKILLS_LIST[@]} 个 skill:"
for entry in "${SKILLS_LIST[@]}"; do
  IFS='|' read -r name category _ command_flag <<< "$entry"
  if [[ "$command_flag" == "true" ]]; then
    printf '    - %s%s%s (%s/, command: enabled)\n' "$C_BOLD" "$name" "$C_RESET" "$category"
  else
    printf '    - %s%s%s (%s/)\n' "$C_BOLD" "$name" "$C_RESET" "$category"
  fi
done

# ============ Step 2:检测已安装工具 ============
hdr "Step 2/4 — 检测已安装工具"
TOOL_STATUS_FILE=$(mktemp)
trap "rm -f '$TOOL_STATUS_FILE'" EXIT

for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r tool_id display _ _ _ <<< "$entry"
  if detect_tool "$tool_id"; then
    printf '%s|1\n' "$tool_id" >> "$TOOL_STATUS_FILE"
    ok "  [✓] $display"
  else
    printf '%s|0\n' "$tool_id" >> "$TOOL_STATUS_FILE"
    printf '  [ ] %s%s%s\n' "$C_YELLOW" "$display" "$C_RESET"
  fi
done

tool_status() {
  grep -F "$1|" "$TOOL_STATUS_FILE" 2>/dev/null | head -1 | cut -d'|' -f2
}

# 过滤:仅保留已检测到或被显式指定的工具
AVAILABLE_TOOLS=()
for entry in "${TOOLS_REGISTRY[@]}"; do
  IFS='|' read -r tool_id display _ _ _ <<< "$entry"
  if [[ "$(tool_status "$tool_id")" == "1" ]]; then
    AVAILABLE_TOOLS+=("$tool_id")
  fi
done

if [[ ${#AVAILABLE_TOOLS[@]} -eq 0 ]]; then
  warn "未检测到任何已安装的 AI 工具"
  info "请先安装至少一个工具(Claude Code / OpenCode / Codex / Gemini CLI)"
  exit 0
fi

# ============ Step 3:选择目标工具 ============
hdr "Step 3/4 — 选择安装目标"

SELECTED=()
if (( NON_INTERACTIVE )); then
  if [[ "$CLI_TOOLS" == "__ALL__" ]]; then
    SELECTED=("${AVAILABLE_TOOLS[@]}")
    info "非交互模式 --all:已检测到的 ${#SELECTED[@]} 个工具全部安装"
  else
    IFS=',' read -ra requested <<< "$CLI_TOOLS"
    for tid in "${requested[@]}"; do
      tid=$(echo "$tid" | tr -d ' \t')
      if [[ -z "$tid" ]]; then continue; fi
      # 校验:必须是已注册工具
      local_entry=$(printf '%s\n' "${TOOLS_REGISTRY[@]}" | grep "^${tid}|" || true)
      if [[ -z "$local_entry" ]]; then
        err "未知工具 id: $tid"
        print_usage
        exit 1
      fi
      # 校验:已检测到
      if [[ "$(tool_status "$tid")" != "1" ]]; then
        warn "工具 $(get_display_name "$tid") 未检测到,跳过"
        continue
      fi
      SELECTED+=("$tid")
    done
    if [[ ${#SELECTED[@]} -eq 0 ]]; then
      err "没有任何有效的目标工具"
      exit 1
    fi
  fi
else
  # 交互模式:构建菜单
  MENU_INPUT=""
  for tid in "${AVAILABLE_TOOLS[@]}"; do
    display=$(get_display_name "$tid")
    target=$(get_target_dir "$tid")
    MENU_INPUT+="${tid}|${display} (${target}/)\n"
  done
  MENU_INPUT+="all|全部已检测(${AVAILABLE_TOOLS[*]})"

  if interactive_select "选择要安装到的工具" "默认:全部已检测" < <(printf '%b' "$MENU_INPUT"); then
    if [[ "$SELECTED_TOOLS" == "__DEFAULT__" || "$SELECTED_TOOLS" == "__ALL__" ]]; then
      SELECTED=("${AVAILABLE_TOOLS[@]}")
    else
      SELECTED=($SELECTED_TOOLS)
    fi
  else
    info "已取消"
    exit 0
  fi
fi

info "将安装到: ${SELECTED[*]}"

# ============ Step 4:创建软链 ============
hdr "Step 4/4 — 创建软链"

CREATED=0
UPDATED=0
SKIPPED=0
FAILED=0

# 通用:尝试创建一条软链,通过全局计数与 FORCE/DRY_RUN 副作用更新统计
# 参数: $1=源路径, $2=链接路径, $3=条目名(显示用), $4=分类(显示用)
create_link() {
  local src="$1" link="$2" name="$3" category="$4"
  local status
  status=$(check_link_status "$link")
  case "$status" in
    0)
      if (( DRY_RUN )); then
        echo "  [DRY] ln -s '$src' '$link'"
      else
        ln -s "$src" "$link"
        ok "  + $name (category: $category)"
      fi
      CREATED=$((CREATED + 1))
      ;;
    1)
      if (( DRY_RUN )); then
        echo "  [DRY] $link (已是本项目软链,跳过)"
      else
        ok "  = $name (已是本项目软链)"
      fi
      SKIPPED=$((SKIPPED + 1))
      ;;
    2)
      if (( FORCE )); then
        if (( DRY_RUN )); then
          echo "  [DRY] rm + ln -s '$src' '$link' (--force)"
        else
          rm "$link"
          ln -s "$src" "$link"
          warn "  ! $name (强制覆盖其他软链)"
        fi
        UPDATED=$((UPDATED + 1))
      else
        warn "  - $name (目标存在其他软链,跳过;使用 --force 强制覆盖)"
        SKIPPED=$((SKIPPED + 1))
      fi
      ;;
    3)
      if (( FORCE )); then
        if (( DRY_RUN )); then
          echo "  [DRY] rm -rf '$link' && ln -s '$src' '$link' (--force)"
        else
          rm -rf "$link"
          ln -s "$src" "$link"
          warn "  ! $name (强制覆盖真实目录)"
        fi
        UPDATED=$((UPDATED + 1))
      else
        err "  ✗ $name (目标存在同名真实条目,跳过;使用 --force 强制覆盖)"
        FAILED=$((FAILED + 1))
      fi
      ;;
  esac
}

for tool_id in "${SELECTED[@]}"; do
  target_dir=$(get_target_dir "$tool_id")
  display=$(get_display_name "$tool_id")
  commands_dir=$(get_commands_dir "$tool_id")
  echo ""
  info "[$display] 目标: $target_dir/"
  if [[ -n "$commands_dir" ]]; then
    info "  commands 派生: $commands_dir/"
  fi

  # 父目录不存在则提示并跳过(不自动创建,避免污染)
  if [[ ! -d "$target_dir" ]]; then
    warn "  父目录不存在,跳过(若需要请先运行一次对应工具让自动创建)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  for skill_entry in "${SKILLS_LIST[@]}"; do
    IFS='|' read -r name category src_dir command_flag <<< "$skill_entry"

    # 1) skill 软链
    create_link "$src_dir" "$target_dir/$name" "$name" "$category"

    # 2) command 软链(仅当 skill 声明 command: true 且工具支持)
    if [[ "$command_flag" == "true" && -n "$commands_dir" ]]; then
      if [[ -d "$commands_dir" ]]; then
        create_link "$src_dir/SKILL.md" "$commands_dir/$name.md" "$name.md (cmd)" "$category"
      else
        warn "  - $name.md (commands 父目录 $commands_dir 不存在,跳过)"
        SKIPPED=$((SKIPPED + 1))
      fi
    fi
  done
done

# ============ 汇总 ============
hdr "完成"
if (( DRY_RUN )); then
  echo -e "${C_YELLOW}DRY-RUN 模式,未做实际修改${C_RESET}"
fi
echo "  创建: $CREATED"
echo "  更新: $UPDATED"
echo "  跳过: $SKIPPED"
echo "  失败: $FAILED"
echo ""

if (( FAILED > 0 )); then
  warn "存在失败条目,请检查日志"
  exit 1
fi

ok "完成。可执行 ./scripts/verify.sh 验证各工具是否识别"
