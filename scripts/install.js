#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  colors,
  skillsDir,
  toolsRegistry,
  getRepoRoot,
  scanSkills,
  detectTool,
  getTool,
  getTargetDir,
  getCommandsDir,
  getDisplayName,
  getSkillLinkPath,
  getSkillLinkSource,
  isRepoLocalDir,
  checkLinkStatus,
  createSymlink,
  dirExists,
  interactiveSelect,
  formatWindowsSymlinkHint,
  info,
  ok,
  warn,
  err,
  hdr,
} = require("./lib/common");

let dryRun = false;
let force = false;
let cliTools = "";
let nonInteractive = false;

function printUsage() {
  console.log(`用法: node scripts/install.js [选项]

选项:
  --all                  非交互,安装到全部已检测工具
  --tools <id,id,...>    非交互,指定工具 id(claude,opencode,gemini,copilot,cursor,codex,agents)
  --dry-run              只打印将要执行的操作,不实际创建
  --force                强制覆盖已存在的同名非软链条目
  -h, --help             显示帮助

工具 id:
  claude     Claude Code(~/.claude/skills/)
  opencode   OpenCode(~/.config/opencode/skills/)
  gemini     Gemini CLI(~/.gemini/skills/)
  copilot    GitHub Copilot(./.github/skills/)
  cursor     Cursor(./.cursor/rules/<name>.md)
  codex      Codex(~/.codex/skills/)
  agents     .agents 别名(~/.agents/skills/ — 由 OpenCode 与 Gemini CLI 共享)

示例:
  node scripts/install.js                           交互式
  node scripts/install.js --all                     安装到全部已检测
  node scripts/install.js --tools claude,gemini     仅安装到 Claude Code + Gemini CLI
  node scripts/install.js --dry-run --all           预览将执行的操作`);
}

function parseArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--all":
        nonInteractive = true;
        cliTools = "__ALL__";
        break;
      case "--tools":
        if (!argv[index + 1]) {
          err("--tools 需要参数");
          printUsage();
          process.exit(1);
        }
        nonInteractive = true;
        cliTools = argv[index + 1];
        index += 1;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        err(`未知参数: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }
}

function removeConflictingEntry(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function createLink(source, linkPath, name, category, counters) {
  const status = checkLinkStatus(linkPath);

  if (status === 0) {
    if (dryRun) {
      console.log(`  [DRY] ln -s '${source}' '${linkPath}'`);
    } else {
      try {
        createSymlink(source, linkPath);
        ok(`  + ${name} (category: ${category})`);
      } catch (error) {
        err(`  x ${name} (创建失败: ${error.message}${formatWindowsSymlinkHint(error)})`);
        counters.failed += 1;
        return;
      }
    }
    counters.created += 1;
    return;
  }

  if (status === 1) {
    if (dryRun) {
      console.log(`  [DRY] ${linkPath} (已是本项目软链,跳过)`);
    } else {
      ok(`  = ${name} (已是本项目软链)`);
    }
    counters.skipped += 1;
    return;
  }

  if (status === 2) {
    if (!force) {
      warn(`  - ${name} (目标存在其他软链,跳过;使用 --force 强制覆盖)`);
      counters.skipped += 1;
      return;
    }

    if (dryRun) {
      console.log(`  [DRY] rm + ln -s '${source}' '${linkPath}' (--force)`);
    } else {
      try {
        fs.unlinkSync(linkPath);
        createSymlink(source, linkPath);
        warn(`  ! ${name} (强制覆盖其他软链)`);
      } catch (error) {
        err(`  x ${name} (覆盖失败: ${error.message}${formatWindowsSymlinkHint(error)})`);
        counters.failed += 1;
        return;
      }
    }
    counters.updated += 1;
    return;
  }

  if (status === 3) {
    if (!force) {
      err(`  x ${name} (目标存在同名真实条目,跳过;使用 --force 强制覆盖)`);
      counters.failed += 1;
      return;
    }

    if (dryRun) {
      console.log(`  [DRY] rm -rf '${linkPath}' && ln -s '${source}' '${linkPath}' (--force)`);
    } else {
      try {
        removeConflictingEntry(linkPath);
        createSymlink(source, linkPath);
        warn(`  ! ${name} (强制覆盖真实目录)`);
      } catch (error) {
        err(`  x ${name} (覆盖失败: ${error.message}${formatWindowsSymlinkHint(error)})`);
        counters.failed += 1;
        return;
      }
    }
    counters.updated += 1;
  }
}

async function main() {
  parseArgs(process.argv.slice(2));

  hdr("my-skills install");
  info(`仓库根目录: ${getRepoRoot()}`);
  info(`Skills 源目录: ${skillsDir}`);

  hdr("Step 1/4 — 扫描 skills/ 目录");
  const { skills, errors } = scanSkills();
  for (const message of errors) {
    err(message);
  }
  if (errors.length > 0) {
    err("skills 扫描失败(命名冲突或 frontmatter 错误),请修复后重试");
    process.exit(1);
  }

  if (skills.length === 0) {
    warn("未发现任何 skill(应在 skills/<category>/<skill-name>/SKILL.md 添加)");
    info("本次 install 不会做任何事");
    return;
  }

  ok(`发现 ${skills.length} 个 skill:`);
  for (const skill of skills) {
    if (skill.command) {
      console.log(`    - ${colors.bold}${skill.name}${colors.reset} (${skill.category}/, command: enabled)`);
    } else {
      console.log(`    - ${colors.bold}${skill.name}${colors.reset} (${skill.category}/)`);
    }
  }

  hdr("Step 2/4 — 检测已安装工具");
  const statusByTool = new Map();
  for (const tool of toolsRegistry) {
    const detected = detectTool(tool.id);
    statusByTool.set(tool.id, detected);
    if (detected) {
      ok(`  [✓] ${tool.display}`);
    } else {
      console.log(`  [ ] ${colors.yellow}${tool.display}${colors.reset}`);
    }
  }

  const availableTools = toolsRegistry.filter((tool) => statusByTool.get(tool.id)).map((tool) => tool.id);
  if (availableTools.length === 0) {
    warn("未检测到任何已安装的 AI 工具");
    info("请先安装至少一个工具(Claude Code / OpenCode / Codex / Gemini CLI)");
    return;
  }

  hdr("Step 3/4 — 选择安装目标");
  let selected = [];
  if (nonInteractive) {
    if (cliTools === "__ALL__") {
      selected = availableTools;
      info(`非交互模式 --all:已检测到的 ${selected.length} 个工具全部安装`);
    } else {
      for (const requestedTool of cliTools.split(",")) {
        const toolId = requestedTool.trim();
        if (!toolId) {
          continue;
        }

        if (!getTool(toolId)) {
          err(`未知工具 id: ${toolId}`);
          printUsage();
          process.exit(1);
        }

        if (!statusByTool.get(toolId)) {
          warn(`工具 ${getDisplayName(toolId)} 未检测到,跳过`);
          continue;
        }

        selected.push(toolId);
      }

      if (selected.length === 0) {
        err("没有任何有效的目标工具");
        process.exit(1);
      }
    }
  } else {
    const menuItems = availableTools.map((toolId) => ({
      key: toolId,
      label: `${getDisplayName(toolId)} (${getTargetDir(toolId)}/)`,
    }));
    menuItems.push({ key: "all", label: `全部已检测(${availableTools.join(" ")})` });

    const result = await interactiveSelect("选择要安装到的工具", "默认:全部已检测", menuItems);
    if (!result) {
      info("已取消");
      return;
    }

    if (result === "__DEFAULT__" || result === "__ALL__" || result.includes("all")) {
      selected = availableTools;
    } else {
      selected = result;
    }
  }

  info(`将安装到: ${selected.join(" ")}`);

  hdr("Step 4/4 — 创建软链");
  const counters = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const toolId of selected) {
    const targetDir = getTargetDir(toolId);
    const display = getDisplayName(toolId);
    const commandsDir = getCommandsDir(toolId);
    console.log("");
    info(`[${display}] 目标: ${targetDir}/`);
    if (commandsDir) {
      info(`  commands 派生: ${commandsDir}/`);
    }

    if (!dirExists(targetDir)) {
      if (isRepoLocalDir(targetDir)) {
        if (dryRun) {
          console.log(`  [DRY] mkdir -p '${targetDir}'`);
        } else {
          fs.mkdirSync(targetDir, { recursive: true });
          ok(`  已创建父目录: ${targetDir}`);
        }
      } else {
        warn("  父目录不存在,跳过(若需要请先运行一次对应工具让自动创建)");
        counters.skipped += 1;
        continue;
      }
    }

    for (const skill of skills) {
      const linkSource = getSkillLinkSource(toolId, skill.sourceDir);
      const linkPath = getSkillLinkPath(toolId, targetDir, skill.name);
      createLink(linkSource, linkPath, skill.name, skill.category, counters);

      if (skill.command && commandsDir) {
        if (dirExists(commandsDir)) {
          createLink(path.join(skill.sourceDir, "SKILL.md"), path.join(commandsDir, `${skill.name}.md`), `${skill.name}.md (cmd)`, skill.category, counters);
        } else {
          warn(`  - ${skill.name}.md (commands 父目录 ${commandsDir} 不存在,跳过)`);
          counters.skipped += 1;
        }
      }
    }
  }

  hdr("完成");
  if (dryRun) {
    console.log(`${colors.yellow}DRY-RUN 模式,未做实际修改${colors.reset}`);
  }
  console.log(`  创建: ${counters.created}`);
  console.log(`  更新: ${counters.updated}`);
  console.log(`  跳过: ${counters.skipped}`);
  console.log(`  失败: ${counters.failed}`);
  console.log("");

  if (counters.failed > 0) {
    warn("存在失败条目,请检查日志");
    process.exit(1);
  }

  ok("完成。可执行 node scripts/verify.js 验证各工具是否识别");
}

main().catch((error) => {
  err(error.stack || error.message);
  process.exit(1);
});
