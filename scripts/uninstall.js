#!/usr/bin/env node

const path = require("node:path");
const {
  colors,
  toolsRegistry,
  getRepoRoot,
  getTargetDir,
  getCommandsDir,
  getCommandSourceDir,
  getDisplayName,
  scanCommandFiles,
  uninstallOpencodeCommands,
  checkLinkStatus,
  listInstalledLinks,
  removeLink,
  dirExists,
  interactiveSelect,
  info,
  ok,
  warn,
  err,
  hdr,
} = require("./lib/common");

let dryRun = false;
let cliDirs = "";
let nonInteractive = false;

function printUsage() {
  console.log(`用法: node scripts/uninstall.js [选项]

选项:
  --all                 非交互,删除所有本项目软链
  --dirs <path,path>    非交互,指定要清理的父目录
  --dry-run             只打印将要执行的操作,不实际删除
  -h, --help            显示帮助

安全保证:
  - 仅删除软链接(不递归删除任何实际内容)
  - 仅删除指向本仓库的软链(避免误删其他工具的软链或真实目录)
  - 删除前会逐条确认目标确实指向本项目`);
}

function parseArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--all":
        nonInteractive = true;
        cliDirs = "__ALL__";
        break;
      case "--dirs":
        if (!argv[index + 1]) {
          err("--dirs 需要参数");
          printUsage();
          process.exit(1);
        }
        nonInteractive = true;
        cliDirs = argv[index + 1];
        index += 1;
        break;
      case "--dry-run":
        dryRun = true;
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

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

async function main() {
  parseArgs(process.argv.slice(2));

  hdr("my-skills uninstall");
  info(`仓库根目录: ${getRepoRoot()}`);

  hdr("Step 1/3 — 扫描已安装的软链");
  const linkData = new Map();
  const toolsWithLinks = [];

  for (const tool of toolsRegistry) {
    const names = [];
    for (const targetDir of [tool.skillsDir, tool.commandsDir]) {
      if (!targetDir || !dirExists(targetDir)) {
        continue;
      }
      names.push(...listInstalledLinks(targetDir));
    }

    const sortedNames = [...new Set(names)].sort();
    if (sortedNames.length > 0) {
      toolsWithLinks.push(tool.id);
      linkData.set(tool.id, sortedNames);
      ok(`  [${tool.display}] ${sortedNames.length} 个本项目软链`);
      for (const name of sortedNames) {
        console.log(`      - ${name}`);
      }
    } else {
      console.log(`  [ ] ${tool.display} (无本项目软链)`);
    }
  }

  if (toolsWithLinks.length === 0) {
    info("未发现任何本项目软链,无需卸载");
    return;
  }

  hdr("Step 2/3 — 选择要清理的目标");
  let selectedToolIds = [];

  if (nonInteractive) {
    if (cliDirs === "__ALL__") {
      selectedToolIds = toolsWithLinks;
      info(`非交互 --all:将清理 ${selectedToolIds.length} 个工具`);
    } else {
      for (const requestedDir of cliDirs.split(",")) {
        let targetDir = requestedDir.trim();
        if (!targetDir) {
          continue;
        }
        if (!path.isAbsolute(targetDir)) {
          targetDir = path.resolve(process.cwd(), targetDir);
        }

        let matched = false;
        for (const toolId of toolsWithLinks) {
          if (samePath(getTargetDir(toolId), targetDir) || samePath(getCommandsDir(toolId), targetDir)) {
            selectedToolIds.push(toolId);
            matched = true;
            break;
          }
        }

        if (!matched) {
          warn(`目录 ${targetDir} 没有本项目软链或不在注册表中,跳过`);
        }
      }
    }
  } else {
    const menuItems = toolsWithLinks.map((toolId) => ({
      key: toolId,
      label: `${getDisplayName(toolId)} (${linkData.get(toolId).length} 个软链)`,
    }));
    menuItems.push({ key: "all", label: `全部 (${toolsWithLinks.length} 个工具)` });

    const result = await interactiveSelect("选择要清理的工具", "默认:全部", menuItems);
    if (!result) {
      info("已取消");
      return;
    }

    if (result === "__DEFAULT__" || result === "__ALL__" || result.includes("all")) {
      selectedToolIds = toolsWithLinks;
    } else {
      selectedToolIds = result;
    }
  }

  selectedToolIds = [...new Set(selectedToolIds)];
  if (selectedToolIds.length === 0) {
    warn("没有选中任何工具");
    return;
  }

  info(`将清理: ${selectedToolIds.map((toolId) => getDisplayName(toolId)).join(" ")}`);

  hdr("Step 3/3 — 删除软链");
  const counters = {
    removed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const toolId of selectedToolIds) {
    const skillsDir = getTargetDir(toolId);
    const commandsDir = getCommandsDir(toolId);
    const display = getDisplayName(toolId);
    console.log("");
    info(`[${display}] 清理 skills=${skillsDir} commands=${commandsDir}`);

    for (const targetDir of [skillsDir, commandsDir]) {
      if (!targetDir || !dirExists(targetDir)) {
        continue;
      }

      for (const name of listInstalledLinks(targetDir)) {
        const linkPath = path.join(targetDir, name);
        const status = checkLinkStatus(linkPath);
        if (status !== 1) {
          warn(`  - ${linkPath} (状态变更,跳过;当前状态码=${status})`);
          counters.skipped += 1;
          continue;
        }

        if (dryRun) {
          console.log(`  [DRY] rm '${linkPath}'`);
          counters.removed += 1;
          continue;
        }

        try {
          removeLink(linkPath);
          ok(`  - ${linkPath} (已删除)`);
          counters.removed += 1;
        } catch (error) {
          err(`  x ${linkPath} (删除失败: ${error.message})`);
          counters.failed += 1;
        }
      }
    }

    if (toolId === "opencode") {
      const commandFiles = scanCommandFiles(getCommandSourceDir(toolId));
      if (commandFiles.length > 0) {
        try {
          const result = uninstallOpencodeCommands(commandFiles, { dryRun });
          info(`  OpenCode commands 配置: ${result.configPath}`);
          for (const item of result.results) {
            if (item.status === "removed") {
              ok(`  - /${item.name} (cmd, ${item.message})`);
              counters.removed += 1;
            } else {
              warn(`  - /${item.name} (cmd, ${item.message})`);
              counters.skipped += 1;
            }
          }
        } catch (error) {
          err(`  x OpenCode commands 清理失败: ${error.message}`);
          counters.failed += 1;
        }
      }
    }
  }

  hdr("完成");
  if (dryRun) {
    console.log(`${colors.yellow}DRY-RUN 模式,未做实际修改${colors.reset}`);
  }
  console.log(`  删除: ${counters.removed}`);
  console.log(`  跳过: ${counters.skipped}`);
  console.log(`  失败: ${counters.failed}`);
  console.log("");

  if (counters.failed > 0) {
    warn("存在失败条目,请检查日志");
    process.exit(1);
  }

  ok("完成");
}

main().catch((error) => {
  err(error.stack || error.message);
  process.exit(1);
});
