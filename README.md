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

## 软链目标说明

| 工具 | install 软链目标 | 备注 |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>` | 原生路径 |
| OpenCode(`.agents/` 别名) | `~/.agents/skills/<name>` | 跨工具兼容 |
| OpenCode(native) | `~/.config/opencode/skills/<name>` | 原生路径 |
| Codex | `~/.codex/skills/<name>` | 原生路径 |

> `~/.agents/skills/` 由 OpenCode 与 Gemini CLI 共享,install 脚本只创建一条软链,实际指向同一目标。

## 兼容性矩阵

| 工具 | 路径 | frontmatter 最小集 | 高级字段 |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `name` + `description` | ✅ 支持大量 |
| OpenCode | `.claude/` `.agents/` `.opencode/` 三处皆可 | `name` + `description` | 仅 `license` `compatibility` `metadata` |
| Codex | `.codex/skills/` (推测) | `name` + `description` | 同上极简 |
| Gemini CLI | `.gemini/skills/` 或 `.agents/skills/` 别名 | `name` + `description` | 同上极简 |

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
