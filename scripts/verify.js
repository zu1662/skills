#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  colors,
  toolsRegistry,
  getRepoRoot,
  scanSkills,
  scanCommandFiles,
  listManagedOpencodeCommands,
  hasOpencodeCommand,
  readOpencodeCommandRegistry,
  getSkillLinkPath,
  getCommandSourceDir,
  getCommandsDir,
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

function printOpencodeCommands(commandFiles) {
  if (commandFiles.length === 0) {
    return;
  }

  console.log("");
  info("  [commands] ~/.config/opencode/opencode.json");
  const managedCommands = listManagedOpencodeCommands();
  if (managedCommands.length === 0) {
    warn("    未发现本项目管理的 OpenCode command");
    return;
  }

  ok(`    本项目 command: ${managedCommands.length} 个`);
  for (const command of managedCommands) {
    console.log(`        ${colors.green}✓${colors.reset} /${command.name} <- ${command.sourceName}`);
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
    console.log(`    - ${colors.bold}${skill.name}${colors.reset} (${skill.category}/)`);
  }

  const commandFilesByTool = new Map();
  const commandReach = new Map();
  for (const tool of toolsRegistry) {
    const commandFiles = scanCommandFiles(getCommandSourceDir(tool.id));
    commandFilesByTool.set(tool.id, commandFiles);
    for (const commandFile of commandFiles) {
      const key = `${tool.id}:${commandFile.name}`;
      commandReach.set(key, {
        toolId: tool.id,
        name: commandFile.name,
        reachable: false,
      });
    }
  }

  hdr("工具级软链状态");
  for (const tool of toolsRegistry) {
    if (!tool.skillsDir && !tool.commandsDir) {
      continue;
    }

    console.log("");
    info(`[${tool.display}]`);
    printDirLinks("skills", tool.skillsDir);
    if (tool.id === "opencode") {
      printOpencodeCommands(commandFilesByTool.get(tool.id) || []);
    } else {
      printDirLinks("commands", tool.commandsDir);
    }
    const commandFiles = commandFilesByTool.get(tool.id) || [];
    if (commandFiles.length > 0) {
      info(`  command 源文件: ${commandFiles.length} 个 (${getCommandSourceDir(tool.id)})`);
      for (const commandFile of commandFiles) {
        console.log(`        - ${commandFile.name}`);
      }
    }
    runCliList(tool.id);
  }

  hdr("完整性检查");
  const reach = new Map();
  for (const skill of skills) {
    reach.set(skill.name, {
      skillReachable: false,
    });
  }

  for (const tool of toolsRegistry) {
    if (!tool.skillsDir) {
      continue;
    }

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
    if (tool.id === "opencode") {
      for (const commandFile of commandFilesByTool.get(tool.id) || []) {
        const key = `${tool.id}:${commandFile.name}`;
        const item = commandReach.get(key);
        if (!item) {
          continue;
        }
        item.reachable = hasOpencodeCommand(commandFile);
      }
      continue;
    }

    if (!tool.commandsDir || !dirExists(tool.commandsDir)) {
      continue;
    }

    for (const commandFile of commandFilesByTool.get(tool.id) || []) {
      const key = `${tool.id}:${commandFile.name}`;
      const item = commandReach.get(key);
      if (!item) {
        continue;
      }

      if (checkLinkStatus(path.join(tool.commandsDir, commandFile.name)) === 1) {
        item.reachable = true;
      }
    }
  }

  let unreachable = 0;
  for (const skill of skills) {
    const item = reach.get(skill.name);
    if (!item.skillReachable) {
      warn(`  x ${skill.name} (无任何工具可访问 — 请运行 node scripts/install.js)`);
      unreachable += 1;
    } else {
      ok(`  ✓ ${skill.name}`);
    }
  }

  let commandUnreachable = 0;
  for (const command of commandReach.values()) {
    if (!command.reachable) {
      warn(`  △ ${command.name} (${command.toolId} command 未安装 — 请运行 node scripts/install.js)`);
      commandUnreachable += 1;
    } else {
      ok(`  ✓ ${command.name} (${command.toolId} command)`);
    }
  }

  console.log("");
  if (unreachable === 0) {
    ok("所有 skill 至少在一个工具中可达");
  } else {
    warn(`${unreachable} 个 skill 尚未安装到任何工具,建议运行 node scripts/install.js`);
  }

  if (commandUnreachable > 0) {
    warn(`${commandUnreachable} 个 command 源文件尚未在对应工具中生效,建议按需运行 node scripts/install.js --tools <tool>`);
  }

  // ── OpenCode registry 一致性自检 ──
  hdr("OpenCode registry 一致性");
  let registryIssues = 0;
  try {
    const registry = readOpencodeCommandRegistry();
    const managedCommands = listManagedOpencodeCommands();
    const registryNames = Object.keys(registry).sort();

    for (const name of registryNames) {
      if (!managedCommands.some((c) => c.name === name)) {
        warn(`  x ${name} (registry 记录但 opencode.json 中已缺失 — 建议重新 install)`);
        registryIssues += 1;
      }
    }

    for (const cmd of managedCommands) {
      if (!registry[cmd.name]) {
        warn(`  x ${cmd.name} (opencode.json 中存在但 registry 未记录 — 可能手动添加,uninstall 会漏删)`);
        registryIssues += 1;
      }
    }

    if (registryIssues === 0) {
      ok("registry 与 opencode.json 一致");
    }
  } catch {
    info("  无法读取 OpenCode registry(可能未安装 OpenCode),跳过");
  }

  // ── 跨工具 command 覆盖校验 ──
  hdr("跨工具 command 覆盖");
  const allCommandNames = new Set();
  const commandPresence = new Map();
  for (const tool of toolsRegistry) {
    const files = commandFilesByTool.get(tool.id) || [];
    const names = new Set(files.map((f) => f.name.replace(/\.(md|toml)$/i, "")));
    names.forEach((n) => allCommandNames.add(n));
    commandPresence.set(tool.id, names);
  }

  let coverageIssues = 0;
  for (const cmdName of [...allCommandNames].sort()) {
    const presentIn = toolsRegistry
      .filter((t) => commandPresence.get(t.id)?.has(cmdName))
      .map((t) => t.id);

    if (presentIn.length <= 1) {
      ok(`  ✓ ${cmdName} (仅 ${presentIn.join(",") || "无"} — 单工具 command)`);
      continue;
    }

    const missing = toolsRegistry
      .filter((t) => t.commandSourceDir && !commandPresence.get(t.id)?.has(cmdName))
      .map((t) => t.id);

    if (missing.length > 0) {
      warn(`  △ ${cmdName} (已有: ${presentIn.join(",")}, 缺失: ${missing.join(",")})`);
      coverageIssues += 1;
    } else {
      ok(`  ✓ ${cmdName} (所有支持 command 的工具均已覆盖)`);
    }
  }

  if (coverageIssues > 0) {
    warn(`${coverageIssues} 个 command 在部分工具中缺失,建议补充对应工具目录的 command 文件`);
  } else if (allCommandNames.size === 0) {
    info("  未发现任何 command 文件");
  } else {
    ok("所有 command 覆盖一致");
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
