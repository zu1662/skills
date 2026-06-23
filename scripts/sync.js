#!/usr/bin/env node

// sync.js — install.js 的语义别名
//
// 当用户修改了 SKILL.md 或新增/删除 skill 后,运行此脚本将变更
// 同步到所有已安装工具。功能与 install.js 完全一致,只是入口名
// 更直观地表达 "同步" 语义。

require("./install.js");
