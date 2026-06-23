# my-skills

个人 Agent Skills 仓库,参考 [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) 的多工具支持方式,把通用业务 skill 放在 `skills/`,把各 AI 工具的特殊配置放在各自目录(`.claude/`、`.opencode/` 等),再通过软链同步到 Claude Code / OpenCode / GitHub Copilot / Codex 这四种工具。

## 设计目标

- **业务单一真理源**:只涉及业务流程的 skill 源文件放在 `skills/` 下
- **工具配置隔离**:slash command、工具专属 frontmatter、TOML prompt 等维护在各工具自己的目录里
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
├── .claude/
│   └── commands/                   Claude Code markdown slash commands
├── .opencode/
│   └── commands/                   OpenCode TOML slash commands
└── skills/                         ⭐ 业务 skill 单一真理源
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

> **frontmatter 兼容说明**:`SKILL.md` 尽量只保留通用字段(`name`、`description`)。Claude Code 的 `allowed-tools`、`disable-model-invocation`、`argument-hint` 等专属字段应写入 `.claude/commands/<name>.md`;OpenCode 的 slash command prompt 应写入对应 TOML。

## 工具专属 command 配置

`skills/` 下只维护业务 skill。任何只服务某个工具的入口配置,都放在对应工具目录里,install.js 会按目录原样软链到目标 commands 目录。

以 `teach-me` 为例:

| 源文件 | 安装目标 | 格式 |
|---|---|---|
| `.claude/commands/teach-me.md` | `~/.claude/commands/teach-me.md` | Claude Code markdown command |
| `.opencode/commands/teach-me.toml` | `~/.config/opencode/commands/teach-me.toml` | OpenCode TOML command |

新增 command 时:

1. 保持 `skills/<category>/<skill-name>/SKILL.md` 为通用业务说明
2. 在需要支持 slash command 的工具目录新增原生格式文件
3. 运行 `node scripts/install.js` 安装软链
4. 运行 `node scripts/verify.js` 检查 command 源文件是否已安装

## 软链目标说明

| 工具 | skills/rules 软链目标 | commands 软链目标 |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>` | `~/.claude/commands/<name>.md` |
| OpenCode(native) | `~/.config/opencode/skills/<name>` | `~/.config/opencode/commands/<name>.toml` |
| GitHub Copilot(project) | 不自动派生 | — |
| Codex | `~/.codex/skills/<name>` | — |

## 兼容性矩阵

| 工具 | skills/rules 路径 | commands 路径 | 支持方式 | 备注 |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `~/.claude/commands/<name>.md` | 原生 skills + markdown commands | command 文件维护在 `.claude/commands/` |
| OpenCode | `~/.config/opencode/skills/<name>/SKILL.md` | `~/.config/opencode/commands/<name>.toml` | 原生/兼容 skills + TOML commands | command 文件维护在 `.opencode/commands/` |
| GitHub Copilot | 不通过 install.js 自动安装 | — | 项目级显式配置 | 如需支持,手工维护 `.github/copilot-instructions.md`、`.github/agents/*.agent.md` 等 |
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
