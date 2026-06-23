#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  colors,
  toolsRegistry,
  getRepoRoot,
  scanSkills,
  getSkillLinkPath,
  checkLinkStatus,
  listInstalledLinks,
  removeLink,
  dirExists,
  confirm,
  info,
  ok,
  warn,
  err,
  hdr,
} = require("./lib/common");

const brokenLinks = [];

function printUsage() {
  console.log(`用法: node scripts/verify.js [选项]

选项:
  -h, --help            显示帮助`);
}

function parseArgs(argv) {
  for (const arg of argv) {
    switch (arg) {
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

function commandExists(command) {
  if (!command) {
    return false;
  }

  if (process.platform === "win32") {
    return spawnSync("where", [command], { stdio: "ignore" }).status === 0;
  }

  return spawnSync("sh", ["-c", `command -v '${command.replace(/'/g, "'\\''")}'`], {
    stdio: "ignore",
  }).status === 0;
}

function printDirLinks(label, dir) {
  if (!dir || !dirExists(dir)) {
    return;
  }

  const installedNames = listInstalledLinks(dir);
  console.log("");
  info(`  [${label}] ${dir}`);

  if (installedNames.length === 0) {
    warn("    未发现本项目软链");
    return;
  }

  ok(`    本项目软链: ${installedNames.length} 个`);
  for (const name of installedNames) {
    const linkPath = path.join(dir, name);
    let target = "";
    try {
      target = fs.readlinkSync(linkPath);
    } catch {
      target = "";
    }

    if (fs.existsSync(linkPath)) {
      console.log(`        ${colors.green}✓${colors.reset} ${name} -> ${target}`);
    } else {
      console.log(`        ${colors.red}x${colors.reset} ${name} (软链已损坏)`);
      brokenLinks.push(linkPath);
    }
  }
}

function runCliList(toolId) {
  if (toolId !== "claude") {
    return;
  }

  const command = "claude";
  if (!commandExists(command)) {
    return;
  }

  console.log("");
  info("  执行: claude skills list");
  const result = spawnSync(command, ["skills", "list"], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`.split(/\r?\n/).slice(0, 20).join("\n");
  if (output.trim()) {
    console.log(output);
  }

  if (result.error && result.error.code === "ETIMEDOUT") {
    warn("  CLI 调用超时(不影响软链状态)");
    return;
  }

  if (result.status !== 0) {
    warn("  CLI 调用失败(不影响软链状态)");
  }
}

async function main() {
  parseArgs(process.argv.slice(2));

  hdr("my-skills verify");
  info(`仓库根目录: ${getRepoRoot()}`);

  const { skills, errors } = scanSkills();
  for (const message of errors) {
    warn(message);
  }

  if (skills.length === 0) {
    warn("skills/ 目录下没有发现任何 skill");
    console.log("");
    info("提示:在 skills/<category>/<skill-name>/SKILL.md 添加 skill 后重试");
    return;
  }

  console.log("");
  ok(`仓库内发现 ${skills.length} 个 skill:`);
  for (const skill of skills) {
    if (skill.command) {
      console.log(`    - ${colors.bold}${skill.name}${colors.reset} (${skill.category}/, command: enabled)`);
    } else {
      console.log(`    - ${colors.bold}${skill.name}${colors.reset} (${skill.category}/)`);
    }
  }

  hdr("工具级软链状态");
  for (const tool of toolsRegistry) {
    console.log("");
    info(`[${tool.display}]`);
    printDirLinks("skills", tool.skillsDir);
    printDirLinks("commands", tool.commandsDir);
    runCliList(tool.id);
  }

  hdr("完整性检查");
  const reach = new Map();
  for (const skill of skills) {
    reach.set(skill.name, {
      command: skill.command,
      skillReachable: false,
      commandReachable: false,
    });
  }

  for (const tool of toolsRegistry) {
    if (!dirExists(tool.skillsDir)) {
      continue;
    }

    for (const skill of skills) {
      const linkPath = getSkillLinkPath(tool.id, tool.skillsDir, skill.name);
      if (checkLinkStatus(linkPath) === 1) {
        reach.get(skill.name).skillReachable = true;
      }
    }
  }

  for (const tool of toolsRegistry) {
    if (!tool.commandsDir || !dirExists(tool.commandsDir)) {
      continue;
    }

    for (const linkName of listInstalledLinks(tool.commandsDir)) {
      const base = linkName.endsWith(".md") ? linkName.slice(0, -3) : linkName;
      const item = reach.get(base);
      if (item && item.command) {
        item.commandReachable = true;
      }
    }
  }

  let unreachable = 0;
  let commandUnreachable = 0;
  for (const skill of skills) {
    const item = reach.get(skill.name);
    if (!item.skillReachable) {
      warn(`  x ${skill.name} (无任何工具可访问 — 请运行 node scripts/install.js)`);
      unreachable += 1;
    } else if (item.command && !item.commandReachable) {
      warn(`  △ ${skill.name} (command: true,但未在任何工具的 commands/ 派生)`);
      commandUnreachable += 1;
    } else {
      ok(`  ✓ ${skill.name}`);
    }
  }

  console.log("");
  if (unreachable === 0) {
    ok("所有 skill 至少在一个工具中可达");
  } else {
    warn(`${unreachable} 个 skill 尚未安装到任何工具,建议运行 node scripts/install.js`);
  }

  if (commandUnreachable > 0) {
    warn(`${commandUnreachable} 个标记 command: true 的 skill 尚未派生到 commands/,建议重跑 node scripts/install.js`);
  }

  if (brokenLinks.length === 0) {
    return;
  }

  console.log("");
  hdr(`发现 ${brokenLinks.length} 个损坏软链`);
  for (const link of brokenLinks) {
    console.log(`    ${link}`);
  }
  console.log("");

  const shouldDelete = await confirm("是否删除以上损坏软链?", true);
  if (!shouldDelete) {
    info("已跳过删除");
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const link of brokenLinks) {
    try {
      removeLink(link);
      ok(`  ✓ 已删除: ${link}`);
      deleted += 1;
    } catch (error) {
      err(`  x 删除失败: ${link} (${error.message})`);
      failed += 1;
    }
  }

  console.log("");
  if (failed > 0) {
    warn(`删除完成: ${deleted} 个成功, ${failed} 个失败`);
    process.exit(1);
  }
  ok(`已清理 ${deleted} 个损坏软链`);
}

main().catch((error) => {
  err(error.stack || error.message);
  process.exit(1);
});
