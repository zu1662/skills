# my-skills

个人 Agent Skills 仓库,统一托管在 `skills/` 目录,参考 [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) 的多工具支持方式,通过软链同步到 Claude Code / OpenCode / Gemini CLI / GitHub Copilot / Cursor / Codex 等工具,实现「一处更新、多处生效」。

## 设计目标

- **单一真理源**:所有 skill 的源文件只放在本仓库的 `skills/` 下
- **多工具通用**:遵循 [Agent Skills](https://agentskills.io) 开源标准,按各工具原生发现目录安装
- **零冲突**:install/uninstall 脚本自动检测已安装工具,交互式选择目标
- **安全可逆**:所有操作通过软链实现,可一键卸载,不会污染目标目录

## 快速开始

脚本主入口已改为 Node.js,避免依赖 Bash / GNU 工具,便于后续兼容 Windows。需要本机已安装 Node.js。

```bash
# 1. 克隆仓库(首次使用)
git clone <repo-url> ~/AI\ Code/my-skills
cd ~/AI\ Code/my-skills

# 2. 安装(自动检测已安装的工具,交互式选择目标)
node scripts/install.js

# 3. 验证
node scripts/verify.js

# 4. 卸载(从所有工具中移除本仓库的软链)
node scripts/uninstall.js
```

## 目录结构

```
my-skills/
├── README.md                       本文件
├── .gitignore                      排除运行时产物
├── scripts/
│   ├── lib/
│   │   └── common.js               跨平台公共函数(工具检测/软链校验/输入解析)
│   ├── install.js                  创建软链
│   ├── uninstall.js                删除软链
│   └── verify.js                   验证可达性
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
3. 重新执行 `node scripts/install.js` 创建软链
4. 执行 `node scripts/verify.js` 确认所有工具可识别

> **frontmatter 兼容说明**:Claude Code 支持大量可选字段(`allowed-tools`、`disable-model-invocation`、`context: fork` 等),OpenCode / Gemini CLI / GitHub Copilot / Codex 主要依赖 `name` 与 `description`,多余字段通常被忽略。Cursor rules 会直接读取 `SKILL.md` 的 markdown 内容。

## command 派生(Claude Code markdown commands)

Claude Code 把 `skills/` 目录里的 SKILL.md 视为可加载技能,也支持 `commands/<name>.md` 形式的 slash command。参考项目里 Gemini CLI 的 slash commands 使用 `.gemini/commands/<name>.toml`,这不是 markdown,无法安全地从单个 `SKILL.md` 直接软链派生。

解决办法:在 SKILL.md frontmatter 加 `command: true`,install.js 会**额外**在支持 markdown commands 的工具目录建一条软链,指向同一份 `SKILL.md`:

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
| OpenCode | ❌ 跳过 | 参考项目推荐通过 `AGENTS.md` + skill 工具做意图路由,不强制 slash commands |
| Gemini CLI | ❌ 跳过 | Gemini 的 commands 是 TOML,需要 `.gemini/commands/<name>.toml` 原生命令 |
| GitHub Copilot | ❌ 跳过 | 使用 `.github/skills/` 或 `.github/copilot-instructions.md` |
| Cursor | ❌ 跳过 | 使用 `.cursor/rules/<name>.md` |
| Codex | ❌ 不支持 | Codex 无 commands 机制 |

- 不加 `command: true` 的 skill,只装到 skills/rules 目录,不会污染 `commands/` 目录
- `command: false` 显式不派生(缺省即为 false)
- 软链复用同一份 `SKILL.md`;需要 Gemini TOML command 或 Windsurf 合并规则时,请按对应工具原生格式单独维护

## 软链目标说明

| 工具 | skills/rules 软链目标 | commands 软链目标(若 `command: true`) |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>` | `~/.claude/commands/<name>.md` |
| OpenCode(native) | `~/.config/opencode/skills/<name>` | — |
| Gemini CLI(native) | `~/.gemini/skills/<name>` | — |
| GitHub Copilot(project) | `.github/skills/<name>` | — |
| Cursor(project) | `.cursor/rules/<name>.md` → `SKILL.md` | — |
| Codex | `~/.codex/skills/<name>` | — |
| `.agents/` 通用别名 | `~/.agents/skills/<name>` | — |

> `~/.agents/skills/` 可作为 OpenCode 与 Gemini CLI 共享的通用别名;Gemini CLI 也支持原生 `~/.gemini/skills/`。

## 兼容性矩阵

| 工具 | skills/rules 路径 | commands 路径 | 支持方式 | 备注 |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `~/.claude/commands/<name>.md` | 原生 skills + markdown commands | `command: true` 时派生 command |
| OpenCode | `~/.config/opencode/skills/<name>/SKILL.md` | — | 原生/兼容 skills | 参考项目建议配合 `AGENTS.md` 自动选 skill |
| Gemini CLI | `~/.gemini/skills/<name>/SKILL.md` 或 `~/.agents/skills/<name>/SKILL.md` | `.gemini/commands/<name>.toml` | 原生 skills | TOML commands 需单独维护 |
| GitHub Copilot | `.github/skills/<name>/SKILL.md` | — | 项目级 skills | 也可配合 `.github/copilot-instructions.md` 与 `.github/agents/*.agent.md` |
| Cursor | `.cursor/rules/<name>.md` | — | 项目 rules | 每个 rule 软链到对应 `SKILL.md` |
| Windsurf | `.windsurfrules` | — | 合并规则文件 | 不适合逐 skill 软链,建议手工合并 2-3 个常用 skill |
| Codex | `~/.codex/skills/<name>/SKILL.md` | — | skills 目录 | 保持极简 frontmatter |

## 命名规范

- skill 目录名:小写字母、数字、连字符(`a-z`、`0-9`、`-`)
- 不以下划线或连字符开头/结尾
- 不含连续连字符
- 跨分类全局唯一(避免软链冲突)
- 长度建议 ≤ 64 字符

## 工具检测逻辑

每个工具的「已安装」判定:

1. CLI 命令存在(macOS/Linux 使用 `command -v`,Windows 使用 `where`)
2. 目标目录存在(降级探测,避免 PATH 未设置误判)

二者命中其一即视为已安装。
