# skills 目录

本目录是 skill 的**单一真理源**。每个 skill 放在 `<category>/<skill-name>/` 下。

## 目录结构

```
skills/
├── <category>/                按类型自由组织
│   └── <skill-name>/          名称全局唯一
│       ├── SKILL.md           必填
│       ├── scripts/           可选:可执行脚本
│       ├── references/        可选:静态参考文档
│       └── assets/            可选:模板/资源
```

**示例**:

```
skills/
├── dev/
│   ├── quick-test/
│   │   └── SKILL.md
│   └── api-mock/
│       ├── SKILL.md
│       └── scripts/
│           └── mock.py
├── productivity/
│   ├── daily-standup/
│   │   └── SKILL.md
│   └── meeting-notes/
│       └── SKILL.md
└── research/
    └── arxiv-digest/
        ├── SKILL.md
        └── references/
            └── categories.md
```

## 添加新 skill

```bash
# 1. 创建目录
mkdir -p skills/<category>/<skill-name>

# 2. 编写 SKILL.md
cat > skills/<category>/<skill-name>/SKILL.md <<'EOF'
---
name: <skill-name>            # 必须等于目录名
description: <≤1024 字符>     # 具体描述触发场景
---

# <skill-name>

## When to use
- ...

## Instructions
- ...
EOF

# 3. 安装(创建软链到各工具)
cd ../..  # 回到仓库根
./scripts/install.sh
```

## 命名规范

| 规则 | 说明 |
|---|---|
| 字符集 | 小写字母 `a-z`、数字 `0-9`、连字符 `-` |
| 长度 | ≤ 64 字符 |
| 起始/结尾 | 不能以 `-` 开头或结尾 |
| 连字符 | 不允许连续 `--` |
| 唯一性 | **跨分类全局唯一** — 避免软链冲突 |
| 一致性 | 目录名 = frontmatter 的 `name` 字段(OpenCode 强约束) |

正则: `^[a-z0-9]+(-[a-z0-9]+)*$`

## SKILL.md frontmatter 规范

**最小集(必填)**:

```yaml
---
name: my-skill
description: 一句话描述触发场景,≤1024 字符
---
```

**可选(仅 Claude Code 识别,其他工具静默忽略)**:

```yaml
---
name: my-skill
description: ...
license: MIT
argument-hint: "[issue-number]"
disable-model-invocation: true   # 只能用户手动触发
user-invocable: true             # 是否出现在 / 菜单
allowed-tools: Read Grep         # 预授权工具
context: fork                    # 在子 agent 中执行
---
```

**trigger 写法**(description 中的最佳实践):

```yaml
# ✗ 差
description: A useful skill.

# ✓ 好
description: Analyze a pull request for code quality, security, and test coverage gaps. Use when the user asks to "review this PR" or "check the diff".
```

## 分类约定(建议)

| 分类 | 用途 | 示例 |
|---|---|---|
| `dev/` | 编码辅助:review、refactor、test、debug | `code-review`、`unit-test-gen` |
| `productivity/` | 日常效率:日程、笔记、汇报 | `daily-standup`、`meeting-notes` |
| `research/` | 信息检索、调研、阅读 | `arxiv-digest`、`paper-summary` |
| `ops/` | 部署、监控、CI/CD | `deploy-staging`、`log-triage` |
| `writing/` | 写作辅助:翻译、润色、改写 | `tech-doc-polish`、`en-translator` |

> 分类是**组织文件夹**,不参与命名空间。同一 skill 名称在所有分类中必须唯一。

## 不做的事

- ❌ 不要把 `.env`、`*.log` 等运行时产物提交进来(已在 `.gitignore` 排除)
- ❌ 不要在 frontmatter 中写大段 prompt,正文 ≤ 500 行
- ❌ 不要硬编码 API key、token、密码
- ❌ 不要创建与现有 skill 同名的目录(会软链冲突)
