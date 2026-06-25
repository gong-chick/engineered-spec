#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.resolve(__dirname, "..", "install.ps1");

if (!fs.existsSync(target)) {
  console.error("[verify-install-ps1-bom] 未找到 install.ps1");
  process.exit(1);
}

const buf = fs.readFileSync(target);
const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

if (!hasBom) {
  console.error("[verify-install-ps1-bom] install.ps1 必须为 UTF-8 with BOM（EF BB BF）。");
  console.error("[verify-install-ps1-bom] 请修复编码后再执行打包/发布。");
  process.exit(1);
}

console.log("[verify-install-ps1-bom] OK: install.ps1 带 UTF-8 BOM");
