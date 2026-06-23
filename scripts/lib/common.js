#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawnSync } = require("node:child_process");

const commonDir = __dirname;
const repoRoot = path.resolve(commonDir, "..", "..");
const skillsDir = path.join(repoRoot, "skills");
const homeDir = os.homedir();
const isWindows = process.platform === "win32";

const colors = process.stdout.isTTY
  ? {
      red: "\x1b[0;31m",
      green: "\x1b[0;32m",
      yellow: "\x1b[0;33m",
      blue: "\x1b[0;34m",
      bold: "\x1b[1m",
      reset: "\x1b[0m",
    }
  : {
      red: "",
      green: "",
      yellow: "",
      blue: "",
      bold: "",
      reset: "",
    };

const toolsRegistry = [
  {
    id: "claude",
    display: "Claude Code",
    cli: "claude",
    skillsDir: path.join(homeDir, ".claude", "skills"),
    commandsDir: path.join(homeDir, ".claude", "commands"),
    commandSourceDir: path.join(repoRoot, ".claude", "commands"),
  },
  {
    id: "opencode",
    display: "OpenCode",
    cli: "opencode",
    skillsDir: path.join(homeDir, ".config", "opencode", "skills"),
    commandsDir: path.join(homeDir, ".config", "opencode", "commands"),
    commandSourceDir: path.join(repoRoot, ".opencode", "commands"),
  },
  {
    id: "copilot",
    display: "GitHub Copilot",
    cli: "-",
    skillsDir: "",
    commandsDir: "",
    commandSourceDir: "",
  },
  {
    id: "codex",
    display: "Codex",
    cli: "codex",
    skillsDir: path.join(homeDir, ".codex", "skills"),
    commandsDir: "",
    commandSourceDir: "",
  },
];

function info(message = "") {
  console.log(`${colors.blue}i${colors.reset}  ${message}`);
}

function ok(message = "") {
  console.log(`${colors.green}✓${colors.reset}  ${message}`);
}

function warn(message = "") {
  console.log(`${colors.yellow}!${colors.reset}  ${message}`);
}

function err(message = "") {
  console.error(`${colors.red}x${colors.reset}  ${message}`);
}

function hdr(message) {
  console.log(`\n${colors.bold}${colors.blue}${message}${colors.reset}`);
  console.log("────────────────────────────────────────");
}

function getRepoRoot() {
  return fs.realpathSync(repoRoot);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandExists(command) {
  if (!command || command === "-") {
    return false;
  }

  if (isWindows) {
    const result = spawnSync("where", [command], { stdio: "ignore" });
    return result.status === 0;
  }

  const result = spawnSync("sh", ["-c", `command -v ${shellQuote(command)}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function getTool(toolId) {
  return toolsRegistry.find((tool) => tool.id === toolId) || null;
}

function detectTool(toolId) {
  const tool = getTool(toolId);
  if (!tool) {
    return false;
  }

  if (commandExists(tool.cli)) {
    return true;
  }

  if (dirExists(tool.skillsDir)) {
    return true;
  }

  if (tool.commandsDir && dirExists(tool.commandsDir)) {
    return true;
  }

  return false;
}

function getTargetDir(toolId) {
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`未知工具 id: ${toolId}`);
  }
  return tool.skillsDir;
}

function getCommandsDir(toolId) {
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`未知工具 id: ${toolId}`);
  }
  return tool.commandsDir;
}

function getCommandSourceDir(toolId) {
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`未知工具 id: ${toolId}`);
  }
  return tool.commandSourceDir;
}

function getDisplayName(toolId) {
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`未知工具 id: ${toolId}`);
  }
  return tool.display;
}

function getSkillLinkPath(toolId, targetDir, name) {
  return path.join(targetDir, name);
}

function getSkillLinkSource(toolId, sourceDir) {
  return sourceDir;
}

function dirExists(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function pathExistsOrLink(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeForCompare(target) {
  const resolved = path.resolve(target);
  return isWindows ? resolved.toLowerCase() : resolved;
}

function isPathInside(parent, child) {
  const parentPath = normalizeForCompare(parent);
  const childPath = normalizeForCompare(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function isRepoLocalDir(target) {
  return isPathInside(getRepoRoot(), target);
}

function parseFrontmatterField(content, field) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return "";
  }

  const pattern = new RegExp(`^${field}:\\s*(.*)$`, "im");
  const fieldMatch = match[1].match(pattern);
  return fieldMatch ? fieldMatch[1].trim() : "";
}

function scanSkills() {
  if (!dirExists(skillsDir)) {
    return { skills: [], errors: [] };
  }

  const skills = [];
  const errors = [];
  const seen = new Map();
  const categories = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const category of categories) {
    const categoryDir = path.join(skillsDir, category);
    const skillDirs = fs
      .readdirSync(categoryDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of skillDirs) {
      const sourceDir = path.join(categoryDir, name);
      const skillMd = path.join(sourceDir, "SKILL.md");
      if (!fs.existsSync(skillMd)) {
        continue;
      }

      const rel = path.relative(skillsDir, sourceDir).split(path.sep).join("/");
      const content = fs.readFileSync(skillMd, "utf8");
      const fmName = parseFrontmatterField(content, "name");

      if (fmName && fmName !== name) {
        errors.push(
          `skill ${name} (${rel}/SKILL.md) frontmatter 的 name='${fmName}' 与目录名不一致,可能影响 OpenCode`,
        );
      }

      if (seen.has(name)) {
        errors.push(`skill 名称冲突: '${name}' 在 ${seen.get(name)} 与 ${rel} 均出现`);
      }
      seen.set(name, rel);

      skills.push({
        name,
        category,
        sourceDir,
      });
    }
  }

  return { skills, errors };
}

function scanCommandFiles(sourceDir) {
  if (!sourceDir || !dirExists(sourceDir)) {
    return [];
  }

  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      source: path.join(sourceDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolveLinkTarget(linkPath, linkTarget) {
  if (path.isAbsolute(linkTarget)) {
    return path.resolve(linkTarget);
  }
  return path.resolve(path.dirname(linkPath), linkTarget);
}

function checkLinkStatus(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return 0;
  }

  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(target);
    const absoluteTarget = resolveLinkTarget(target, linkTarget);
    return isPathInside(getRepoRoot(), absoluteTarget) ? 1 : 2;
  }

  return 3;
}

function listInstalledLinks(dir) {
  if (!dirExists(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => checkLinkStatus(path.join(dir, name)) === 1)
    .sort();
}

function symlinkType(source) {
  const sourceStat = fs.statSync(source);
  if (sourceStat.isDirectory()) {
    return isWindows ? "junction" : "dir";
  }
  return "file";
}

function createSymlink(source, linkPath) {
  const type = symlinkType(source);
  const sourceForLink = type === "junction" ? path.resolve(source) : source;
  fs.symlinkSync(sourceForLink, linkPath, type);
}

function removeLink(linkPath) {
  try {
    fs.unlinkSync(linkPath);
  } catch (error) {
    if (isWindows && (error.code === "EPERM" || error.code === "EISDIR")) {
      fs.rmSync(linkPath, { recursive: false, force: true });
      return;
    }
    throw error;
  }
}

async function interactiveSelect(title, defaultDesc, menuItems) {
  console.log("");
  console.log(`${colors.bold}${title}${colors.reset}`);
  console.log("");

  menuItems.forEach((item, index) => {
    console.log(`  ${index + 1}) ${item.label}`);
  });
  console.log("  0) 取消");
  console.log("");
  console.log(`输入选项 ${colors.yellow}[多选用逗号分隔,如 1,3 或输入 all/全部]${colors.reset} (${defaultDesc}):`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rawInput = await rl.question("");
      const input = rawInput.replace(/[ \t]/g, "").toLowerCase();

      if (!input) {
        return "__DEFAULT__";
      }

      if (["0", "q", "cancel", "quit"].includes(input)) {
        return null;
      }

      if (input === "all" || input === "全部") {
        return "__ALL__";
      }

      const parts = input.split(",");
      const selected = [];
      let valid = true;
      for (const part of parts) {
        if (!/^\d+$/.test(part)) {
          err(`无效选项: ${part} (有效范围 1-${menuItems.length})`);
          valid = false;
          break;
        }

        const index = Number(part);
        if (index < 1 || index > menuItems.length) {
          err(`无效选项: ${part} (有效范围 1-${menuItems.length})`);
          valid = false;
          break;
        }
        selected.push(menuItems[index - 1].key);
      }

      if (valid) {
        return selected;
      }

      if (attempt < 2) {
        console.log("请重新输入:");
      }
    }
  } finally {
    rl.close();
  }

  err("超过最大尝试次数,取消");
  return null;
}

async function confirm(message, defaultYes = true) {
  if (!process.stdin.isTTY) {
    return false;
  }

  const hint = defaultYes ? "Y/n" : "y/N";
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    const answer = await rl.question(`${colors.yellow}?${colors.reset} ${message} [${colors.bold}${hint}${colors.reset}]: `);
    const normalized = answer.replace(/[ \t]/g, "").toLowerCase();
    if (!normalized) {
      return defaultYes;
    }
    return ["y", "yes", "是"].includes(normalized);
  } finally {
    rl.close();
  }
}

function formatWindowsSymlinkHint(error) {
  if (!isWindows || error.code !== "EPERM") {
    return "";
  }
  return " (Windows 可能需要启用开发者模式或管理员权限来创建文件软链)";
}

module.exports = {
  colors,
  repoRoot,
  skillsDir,
  toolsRegistry,
  getRepoRoot,
  scanSkills,
  scanCommandFiles,
  detectTool,
  getTool,
  getTargetDir,
  getCommandsDir,
  getCommandSourceDir,
  getDisplayName,
  getSkillLinkPath,
  getSkillLinkSource,
  isRepoLocalDir,
  checkLinkStatus,
  listInstalledLinks,
  createSymlink,
  removeLink,
  dirExists,
  pathExistsOrLink,
  interactiveSelect,
  confirm,
  formatWindowsSymlinkHint,
  info,
  ok,
  warn,
  err,
  hdr,
};
