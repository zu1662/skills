#!/usr/bin/env bash
# common.sh - 公共函数库
# 提供:工具检测、软链校验、用户输入解析、颜色输出

set -euo pipefail

# ============ 颜色定义 ============
if [[ -t 1 ]]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_BOLD='\033[1m'
  C_RESET='\033[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_BOLD='' C_RESET=''
fi

# ============ 路径解析 ============
# 解析本仓库的根目录(common.sh 位于 scripts/lib/)
COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$COMMON_DIR/../.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"

# ============ 工具注册表 ============
# 格式: tool_id|display_name|cli_cmd|skills_dir|commands_dir
# skills_dir   — skill 软链父目录(~ 开头表示用户主目录)
# commands_dir — command 软链父目录(空字符串表示该工具不支持 commands 派生)
TOOLS_REGISTRY=(
  "claude|Claude Code|claude|$HOME/.claude/skills|$HOME/.claude/commands"
  "opencode|OpenCode|opencode|$HOME/.config/opencode/skills|$HOME/.config/opencode/commands"
  "codex|Codex|codex|$HOME/.codex/skills|"
  "agents|.agents (OpenCode+Gemini CLI 共享)|-|$HOME/.agents/skills|"
)

# ============ 工具检测 ============
# 检测工具是否「已安装/可被管理」
# 参数:tool_id
# 退出码:0=已安装, 1=未安装
detect_tool() {
  local tool_id="$1"
  local entry cli_cmd skills_dir commands_dir
  entry=$(printf '%s\n' "${TOOLS_REGISTRY[@]}" | grep "^${tool_id}|" || true)
  if [[ -z "$entry" ]]; then
    return 1
  fi
  IFS='|' read -r _ _ cli_cmd skills_dir commands_dir <<< "$entry"

  # 探测 1: CLI 命令存在
  if [[ "$cli_cmd" != "-" ]] && command -v "$cli_cmd" >/dev/null 2>&1; then
    return 0
  fi

  # 探测 2: skills 目录存在
  if [[ -d "$skills_dir" ]]; then
    return 0
  fi

  # 探测 3: commands 目录存在(部分工具无 commands 能力,此时 commands_dir 为空)
  if [[ -n "$commands_dir" && -d "$commands_dir" ]]; then
    return 0
  fi

  # 探测 4(agents 别名): 用户主目录存在即可
  if [[ "$tool_id" == "agents" ]]; then
    [[ -d "$HOME" ]] && return 0 || return 1
  fi

  return 1
}

# 获取工具的 commands_dir(空字符串表示该工具不支持 commands 派生)
get_commands_dir() {
  local tool_id="$1"
  local entry commands_dir
  entry=$(printf '%s\n' "${TOOLS_REGISTRY[@]}" | grep "^${tool_id}|" || true)
  [[ -z "$entry" ]] && return 1
  IFS='|' read -r _ _ _ _ commands_dir <<< "$entry"
  printf '%s' "$commands_dir"
}

# 获取工具的 target_dir(skills 软链父目录)
get_target_dir() {
  local tool_id="$1"
  local entry skills_dir
  entry=$(printf '%s\n' "${TOOLS_REGISTRY[@]}" | grep "^${tool_id}|" || true)
  [[ -z "$entry" ]] && return 1
  IFS='|' read -r _ _ _ skills_dir _ <<< "$entry"
  printf '%s' "$skills_dir"
}

# 获取工具的 display_name
get_display_name() {
  local tool_id="$1"
  local entry name
  entry=$(printf '%s\n' "${TOOLS_REGISTRY[@]}" | grep "^${tool_id}|" || true)
  [[ -z "$entry" ]] && return 1
  IFS='|' read -r _ name _ _ <<< "$entry"
  printf '%s' "$name"
}

# ============ Skills 扫描 ============
# 扫描 skills/ 下所有 SKILL.md,输出 name|category|abs_path|command 列表
# 同时校验:name 唯一性 + name == 目录名
# command 字段:frontmatter 中 command: true 时为 "true",否则为 "false"
scan_skills() {
  [[ -d "$SKILLS_DIR" ]] || return 0

  # 唯一性检查:用临时文件记录 (避免 bash 3.2 不支持 local -A)
  local seen_file
  seen_file=$(mktemp)
  trap "rm -f '$seen_file'" RETURN
  local errors=0

  while IFS= read -r -d '' skill_md; do
    local dir name category rel
    dir=$(dirname "$skill_md")
    name=$(basename "$dir")
    rel=${dir#"$SKILLS_DIR"/}
    category=${rel%/*}

    # 提取 frontmatter 中的 name 字段(若存在)
    local fm_name
    fm_name=$(awk '/^---$/{c++; next} c==1 && /^name:[[:space:]]*/{sub(/^name:[[:space:]]*/,""); print; exit}' "$skill_md" 2>/dev/null || true)

    # 提取 frontmatter 中的 command 字段(若存在)
    local fm_command cmd_flag
    fm_command=$(awk '/^---$/{c++; next} c==1 && /^command:[[:space:]]*/{sub(/^command:[[:space:]]*/,""); print; exit}' "$skill_md" 2>/dev/null || true)
    # bash 3.2 兼容:用 tr 替代 ${var,,}
    fm_command=$(printf '%s' "$fm_command" | tr '[:upper:]' '[:lower:]')
    if [[ "$fm_command" == "true" ]]; then
      cmd_flag="true"
    else
      cmd_flag="false"
    fi

    # 校验 1:frontmatter 的 name(若存在)必须等于目录名
    if [[ -n "$fm_name" && "$fm_name" != "$name" ]]; then
      warn "skill ${C_BOLD}${name}${C_RESET} (${rel}/SKILL.md) frontmatter 的 name='${fm_name}' 与目录名不一致,可能影响 OpenCode"
      errors=$((errors + 1))
    fi

    # 校验 2:全局唯一
    local existing
    existing=$(grep -F "${name}|" "$seen_file" 2>/dev/null | head -1 || true)
    if [[ -n "$existing" ]]; then
      err "skill 名称冲突: '${name}' 在 ${existing##*|} 与 ${rel} 均出现"
      errors=$((errors + 1))
    fi
    printf '%s|%s\n' "$name" "$rel" >> "$seen_file"

    printf '%s|%s|%s|%s\n' "$name" "$category" "$dir" "$cmd_flag"
  done < <(find "$SKILLS_DIR" -mindepth 3 -maxdepth 3 -type f -name 'SKILL.md' -print0 2>/dev/null | sort -z)

  return $errors
}

# ============ 软链校验 ============
# 检查 path 的当前状态,输出标记
# 0=不存在, 1=本项目软链(已安装), 2=其他软链, 3=真实目录/文件(冲突)
# 通过 stdout 输出状态码
check_link_status() {
  local path="$1"
  local repo_real
  repo_real=$(cd "$REPO_ROOT" && pwd)

  if [[ ! -e "$path" && ! -L "$path" ]]; then
    echo "0"; return
  fi

  if [[ -L "$path" ]]; then
    local target
    target=$(readlink "$path")
    # 解析为绝对路径并比较
    local abs_target
    if [[ "$target" = /* ]]; then
      abs_target="$target"
    else
      abs_target=$(cd "$(dirname "$path")" && cd "$(dirname "$target")" && pwd)/$(basename "$target")
    fi
    if [[ "$abs_target" == "$repo_real"/* ]]; then
      echo "1"; return
    else
      echo "2"; return
    fi
  fi

  echo "3"
}

# ============ 用户输入解析 ============
# 显示多选菜单,返回选中的 tool_id 列表(空格分隔)
# 参数: $1=菜单标题, $2=默认选项描述(回车使用), stdin=选项定义(每行 "key|label")
# 选中结果通过全局变量 SELECTED_TOOLS 返回
SELECTED_TOOLS=""
interactive_select() {
  local title="$1"
  local default_desc="$2"
  SELECTED_TOOLS=""

  echo ""
  echo -e "${C_BOLD}${title}${C_RESET}"
  echo ""

  local -a keys
  local -a labels
  local -a default_keys
  local i=0

  while IFS='|' read -r key label; do
    [[ -z "$key" ]] && continue
    keys+=("$key")
    labels+=("$label")
    i=$((i + 1))
    echo "  $i) $label"
  done

  echo "  0) 取消"
  echo ""
  echo -e "输入选项 ${C_YELLOW}[多选用逗号分隔,如 1,3 或输入 all/全部]${C_RESET} (${default_desc}):"

  local input attempts=0 max_attempts=3
  while (( attempts < max_attempts )); do
    read -r input
    input=$(echo "$input" | tr -d ' \t' | tr '[:upper:]' '[:lower:]')

    # 默认(空)
    if [[ -z "$input" ]]; then
      # 默认 = 全部已检测(由调用方决定,我们这里回 "all")
      SELECTED_TOOLS="__DEFAULT__"
      return 0
    fi

    # 取消
    if [[ "$input" == "0" || "$input" == "q" || "$input" == "cancel" || "$input" == "quit" ]]; then
      SELECTED_TOOLS=""
      return 1
    fi

    # 全部
    if [[ "$input" == "all" || "$input" == "全部" ]]; then
      SELECTED_TOOLS="__ALL__"
      return 0
    fi

    # 多选数字
    local result=""
    IFS=',' read -ra parts <<< "$input"
    local valid=1
    for p in "${parts[@]}"; do
      if ! [[ "$p" =~ ^[0-9]+$ ]] || (( p < 1 )) || (( p > ${#keys[@]} )); then
        err "无效选项: $p (有效范围 1-${#keys[@]})"
        valid=0
        break
      fi
      result+="${keys[$((p-1))]} "
    done

    if (( valid )); then
      SELECTED_TOOLS=$(echo "$result" | xargs)
      return 0
    fi

    attempts=$((attempts + 1))
    if (( attempts < max_attempts )); then
      echo "请重新输入:"
    fi
  done

  err "超过最大尝试次数,取消"
  return 1
}

# ============ 输出函数 ============
info()  { echo -e "${C_BLUE}ℹ${C_RESET}  $*"; }
ok()    { echo -e "${C_GREEN}✓${C_RESET}  $*"; }
warn()  { echo -e "${C_YELLOW}⚠${C_RESET}  $*"; }
err()   { echo -e "${C_RED}✗${C_RESET}  $*" >&2; }
hdr()   { echo -e "\n${C_BOLD}${C_BLUE}$*${C_RESET}"; echo "────────────────────────────────────────"; }

# ============ 工具函数 ============
# 获取本仓库的绝对路径(去除末尾 /)
get_repo_root() {
  (cd "$REPO_ROOT" && pwd)
}

# 列出某目录下指向本项目的软链
list_installed_links() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  local repo_real
  repo_real=$(get_repo_root)
  local found=0
  while IFS= read -r -d '' link; do
    local target
    target=$(readlink "$link" 2>/dev/null || true)
    if [[ -n "$target" ]]; then
      local abs_target
      if [[ "$target" = /* ]]; then
        abs_target="$target"
      else
        abs_target=$(cd "$(dirname "$link")" && cd "$(dirname "$target")" 2>/dev/null && pwd)/$(basename "$target")
      fi
      if [[ "$abs_target" == "$repo_real"/* ]]; then
        printf '%s\n' "$(basename "$link")"
        found=1
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -mindepth 1 -type l -print0 2>/dev/null)
  return $((1 - found))
}
