#!/bin/bash
INPUT="$CLAUDE_TOOL_INPUT"

# 危险模式
DANGEROUS=(
  "rm -rf /"
  "rm -rf ~"
  "git push --force"
  "git push -f"
  "DROP DATABASE"
  "TRUNCATE TABLE"
  ":(){ :|:& };:"
)

for pattern in "${DANGEROUS[@]}"; do
  if echo "$INPUT" | grep -qF "$pattern"; then
    echo "BLOCKED: 检测到危险命令 '$pattern'" >&2
    exit 1  # 非 0 exit = 阻止
  fi
done

exit 0  # 0 = 允许