#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const {
  colors,
  skillsDir,
  scanSkills,
  info,
  ok,
  warn,
  err,
  hdr,
} = require("./lib/common");

const NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function printUsage() {
  console.log(`用法: node scripts/new-skill.js [选项]

选项:
  --name <skill-name>      非交互,指定 skill 名称
  --category <category>    非交互,指定分类目录
  --description <text>     非交互,指定 description
  -h, --help               显示帮助

示例:
  node scripts/new-skill.js                                    交互式
  node scripts/new-skill.js --name code-review --category dev   非交互
`);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--name":
        opts.name = argv[++i];
        break;
      case "--category":
        opts.category = argv[++i];
        break;
      case "--description":
        opts.description = argv[++i];
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
  return opts;
}

function validateName(name, existingNames) {
  if (!name) {
    return "名称不能为空";
  }
  if (name.length > 64) {
    return "名称长度不能超过 64 字符";
  }
  if (!NAME_REGEX.test(name)) {
    return "名称只能包含小写字母、数字、连字符,不能以连字符开头/结尾或连续连字符";
  }
  if (existingNames.has(name)) {
    return `skill '${name}' 已存在(跨分类全局唯一)`;
  }
  return null;
}

async function ask(rl, question, defaultVal) {
  const hint = defaultVal ? ` [${defaultVal}]` : "";
  const answer = await rl.question(`${colors.yellow}?${colors.reset} ${question}${hint}: `);
  const trimmed = answer.trim();
  return trimmed || (defaultVal || "");
}

function generateSkillMd(name, description) {
  return `---
name: ${name}
description: ${description}
---

# ${name}

## When to use

- (描述触发场景)

## Instructions

- (编写具体指令)
`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const nonInteractive = Boolean(opts.name && opts.category && opts.description);

  hdr("my-skills new-skill");
  info(`Skills 源目录: ${skillsDir}`);

  const { skills, errors } = scanSkills();
  for (const message of errors) {
    warn(message);
  }
  const existingNames = new Set(skills.map((s) => s.name));

  // 获取已有分类
  const existingCategories = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  try {
    let name = opts.name;
    let category = opts.category;
    let description = opts.description || "";

    // 交互式获取缺失值
    if (!name) {
      name = await ask(rl, "skill 名称 (小写字母/数字/连字符)");
    }

    const nameError = validateName(name, existingNames);
    if (nameError) {
      err(nameError);
      process.exit(1);
    }

    if (!category) {
      console.log("");
      info("已有分类:");
      existingCategories.forEach((c, i) => {
        console.log(`  ${i + 1}) ${c}`);
      });
      console.log(`  ${existingCategories.length + 1}) 新建分类`);
      console.log("");
      const catInput = await ask(rl, "选择分类(输入序号或名称)");
      const num = Number(catInput);
      if (num >= 1 && num <= existingCategories.length) {
        category = existingCategories[num - 1];
      } else if (num === existingCategories.length + 1) {
        category = await ask(rl, "新分类名称");
      } else {
        category = catInput;
      }
    }

    if (!NAME_REGEX.test(category)) {
      err(`分类名称 '${category}' 不符合命名规范(同 skill 名称规则)`);
      process.exit(1);
    }

    if (!description) {
      console.log("");
      info("description 决定 skill 的自动触发时机,要具体:");
      info("  ✗ 差: A useful skill");
      info("  ✓ 好: Review a PR for quality and security. Use when user asks to 'review this PR'.");
      console.log("");
      description = await ask(rl, "description (≤1024 字符)");
    }

    if (!description) {
      err("description 不能为空");
      process.exit(1);
    }
    if (description.length > 1024) {
      err("description 超过 1024 字符");
      process.exit(1);
    }

    rl.close();

    // 确认信息
    console.log("");
    info(`即将创建:`);
    console.log(`    目录: skills/${category}/${name}/`);
    console.log(`    文件: SKILL.md`);
    console.log(`    name: ${name}`);
    console.log(`    description: ${description}`);
    console.log("");

    if (!nonInteractive) {
      const confirmRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY,
      });
      const confirmAnswer = await confirmRl.question(
        `${colors.yellow}?${colors.reset} 确认创建? [${colors.bold}Y/n${colors.reset}]: `,
      );
      confirmRl.close();

      const normalized = confirmAnswer.trim().toLowerCase();
      if (normalized && !["y", "yes", "是"].includes(normalized)) {
        info("已取消");
        return;
      }
    }

    // 创建目录和文件
    const skillDir = path.join(skillsDir, category, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillMdPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(skillMdPath, generateSkillMd(name, description));

    console.log("");
    ok(`已创建: ${skillMdPath}`);
    console.log("");
    info("下一步:");
    console.log(`    1. 编辑 ${skillMdPath} 补充指令内容`);
    console.log(`    2. 运行 node scripts/install.js 安装到各工具`);
    console.log(`    3. 运行 node scripts/verify.js 验证`);
  } finally {
    try {
      rl.close();
    } catch {}
  }
}

main().catch((error) => {
  err(error.stack || error.message);
  process.exit(1);
});
