# my-skills

个人 Agent Skills 仓库,统一托管在 `skills/` 目录,通过软链同步到 Claude Code / OpenCode / Codex / Gemini CLI 四个工具,实现「一处更新、四处生效」。

## 设计目标

- **单一真理源**:所有 skill 的源文件只放在本仓库的 `skills/` 下
- **四工具通用**:遵循 [Agent Skills](https://agentskills.io) 开源标准,兼容 Claude Code、OpenCode、Codex、Gemini CLI
- **零冲突**:install/uninstall 脚本自动检测已安装工具,交互式选择目标
- **安全可逆**:所有操作通过软链实现,可一键卸载,不会污染目标目录

## 快速开始

```bash
# 1. 克隆仓库(首次使用)
git clone <repo-url> ~/AI\ Code/my-skills
cd ~/AI\ Code/my-skills

# 2. 安装(自动检测已安装的工具,交互式选择目标)
./scripts/install.sh

# 3. 验证
./scripts/verify.sh

# 4. 卸载(从所有工具中移除本仓库的软链)
./scripts/uninstall.sh
```

## 目录结构

```
my-skills/
├── README.md                       本文件
├── .gitignore                      排除运行时产物
├── scripts/
│   ├── lib/
│   │   └── common.sh               公共函数(工具检测/软链校验/输入解析)
│   ├── install.sh                  创建软链
│   ├── uninstall.sh                删除软链
│   └── verify.sh                   验证可达性
└── skills/                         ⭐ 单一真理源
    └── <category>/                 按类型组织,如 dev/、productivity/、research/
        └── <skill-name>/           skill 名称必须全局唯一
            ├── SKILL.md            必填,frontmatter 用 name + description 最小集
            ├── scripts/            可选:可执行脚本
            ├── references/         可选:静态文档
            └── assets/             可选:模板/资源
```

## 添加新 skill 的流程

1. 在 `skills/<category>/<skill-name>/` 下创建目录
2. 编写 `SKILL.md`,frontmatter 至少包含:
   ```yaml
   ---
   name: <skill-name>            # 必须等于目录名
   description: <≤1024 字符>     # 必须具体,决定自动触发时机
   ---
   ```
3. 重新执行 `./scripts/install.sh` 创建软链
4. 执行 `./scripts/verify.sh` 确认所有工具可识别

> **frontmatter 兼容说明**:Claude Code 支持大量可选字段(`allowed-tools`、`disable-model-invocation`、`context: fork` 等),OpenCode / Gemini CLI / Codex 只会读取 `name` 与 `description`,多余字段被静默忽略、不报错。

## command 派生(让 OpenCode 也能 `/<name>` 直接调用)

OpenCode / Claude Code 都把 `skills/` 目录里的 SKILL.md 视为可加载技能,但只有 Claude Code 会自动把它们暴露成 `/<name>` 命令;OpenCode 的 `commands/<name>.md` 是独立目录。

解决办法:在 SKILL.md frontmatter 加 `command: true`,install.sh 会**额外**在工具的 `commands/` 目录建一条软链,指向同一份 `SKILL.md`:

```yaml
---
name: teach-me
description: ...
command: true        # ← 加这一行,表示「我要被派生为 command」
---
```

| 工具 | 是否派生 command | 派生路径 |
|---|---|---|
| Claude Code | ✅ | `~/.claude/commands/<name>.md` → `SKILL.md` |
| OpenCode | ✅ | `~/.config/opencode/commands/<name>.md` → `SKILL.md` |
| Gemini CLI | ❌ 跳过 | Gemini 的 commands 是 TOML,无法软链 markdown;需要 TOML 命令请用其原生机制 |
| Codex | ❌ 不支持 | Codex 无 commands 机制 |

- 不加 `command: true` 的 skill,只装到 `skills/`,不会污染 `commands/` 目录
- `command: false` 显式不派生(缺省即为 false)
- 软链复用同一份 SKILL.md,多工具 frontmatter 字段冲突时(YAML 不识别字段会被静默忽略)

## 软链目标说明

| 工具 | skills 软链目标 | commands 软链目标(若 `command: true`) |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>` | `~/.claude/commands/<name>.md` |
| OpenCode(native) | `~/.config/opencode/skills/<name>` | `~/.config/opencode/commands/<name>.md` |
| OpenCode(`.agents/` 别名) | `~/.agents/skills/<name>` | — |
| Codex | `~/.codex/skills/<name>` | — |

> `~/.agents/skills/` 由 OpenCode 与 Gemini CLI 共享,install 脚本只创建一条软链,实际指向同一目标。

## 兼容性矩阵

| 工具 | skills 路径 | commands 路径 | frontmatter 最小集 | 高级字段 |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` | `.claude/commands/<name>.md`(与 skills 互通) | `name` + `description` | ✅ 支持大量 |
| OpenCode | `.config/opencode/skills/<name>/SKILL.md`(也读 `.claude/`、`.agents/`) | `.config/opencode/commands/<name>.md` | `name` + `description` | 仅 `license` `compatibility` `metadata` |
| Codex | `.codex/skills/<name>/SKILL.md` | ❌ | `name` + `description` | 同上极简 |
| Gemini CLI | `.gemini/skills/<name>/SKILL.md`(或 `.agents/skills/` 别名) | `.gemini/commands/<name>.toml`(**TOML,无法复用 md**) | `name` + `description` | 同上极简 |

## 命名规范

- skill 目录名:小写字母、数字、连字符(`a-z`、`0-9`、`-`)
- 不以下划线或连字符开头/结尾
- 不含连续连字符
- 跨分类全局唯一(避免软链冲突)
- 长度建议 ≤ 64 字符

## 工具检测逻辑

每个工具的「已安装」判定:

1. CLI 命令存在(`command -v <cmd>`)
2. 目标目录存在(降级探测,避免 PATH 未设置误判)

二者命中其一即视为已安装。
