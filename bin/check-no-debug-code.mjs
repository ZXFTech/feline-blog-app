#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_ALLOWED_CONSOLE_METHODS = new Set(["warn", "error"]); // 默认允许
const BLOCKED_CONSOLE_METHODS = new Set([
  "log",
  "debug",
  "info",
  "trace",
  "table",
  "dir",
  "dirxml",
  "group",
  "groupCollapsed",
  "groupEnd",
  "time",
  "timeLog",
  "timeEnd",
  "count",
  "countReset",
  "assert",
  "profile",
  "profileEnd",
]);

/**
 * 可通过环境变量覆盖允许的 console 方法：
 *   ALLOW_CONSOLE_METHODS=warn,error
 */
function getAllowedConsoleMethods() {
  const env = process.env.ALLOW_CONSOLE_METHODS;
  if (!env) return DEFAULT_ALLOWED_CONSOLE_METHODS;

  return new Set(
    env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * 默认忽略：测试代码、fixtures、scripts、生成文件（你可按团队习惯调整）
 */
function shouldIgnoreFile(filePath) {
  const p = filePath.replaceAll("\\", "/");

  // 删除文件/不存在文件直接跳过（lint-staged 有时会传）
  if (!fs.existsSync(filePath)) return true;

  // 忽略常见测试目录和文件
  if (
    /(^|\/)(__tests__|tests|test|fixtures)\//.test(p) ||
    /\.test\.(t|j)sx?$/.test(p) ||
    /\.spec\.(t|j)sx?$/.test(p)
  ) {
    return true;
  }

  // 忽略脚本/配置（按需）
  if (/(^|\/)scripts\//.test(p)) return true;

  // 忽略构建产物
  if (/(^|\/)(dist|build|coverage|\.next|out)\//.test(p)) return true;

  return false;
}

function runGitDiffCached(filePath) {
  // -U0：不带上下文，输出最干净
  // --cached：只看暂存区
  // --：避免路径被当作 rev
  return execFileSync("git", ["diff", "--cached", "-U0", "--", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseHunkHeader(line) {
  // @@ -a,b +c,d @@
  const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!m) return null;
  return { newStart: Number(m[1]) };
}

function isDisableNextLineDirective(addedLine) {
  // 支持常见 eslint disable-next-line 写法
  const s = addedLine.trim();
  return {
    noConsole: /eslint-disable-next-line.*\bno-console\b/.test(s),
    noDebugger: /eslint-disable-next-line.*\bno-debugger\b/.test(s),
  };
}

function hasInlineAllowComment(codeLine) {
  // 允许你在必要时对单行放行（明确可审计）
  // 例：console.log(...) // @allow-console
  const s = codeLine;
  return {
    allowConsole: /@allow-console\b/.test(s),
    allowDebugger: /@allow-debugger\b/.test(s),
  };
}

function checkAddedLine({ filePath, lineNo, code, allowedConsole }) {
  const violations = [];

  // 放行注释（单行）
  const allow = hasInlineAllowComment(code);

  // debugger
  if (!allow.allowDebugger && /\bdebugger\b/.test(code)) {
    violations.push({
      kind: "debugger",
      filePath,
      lineNo,
      code,
      hint: "移除 debugger，或在该行末尾添加 // @allow-debugger（谨慎使用）",
    });
  }

  // console.xxx
  // 仅拦截明确的方法调用（console.log(...) / console.info(...) 等）
  const consoleCall = code.match(/\bconsole\.(\w+)\s*\(/);
  if (consoleCall && !allow.allowConsole) {
    const method = consoleCall[1];
    if (!allowedConsole.has(method) && BLOCKED_CONSOLE_METHODS.has(method)) {
      violations.push({
        kind: `console.${method}`,
        filePath,
        lineNo,
        code,
        hint: "移除/替换 console 调试输出；如确需保留，请用 console.warn/error 或添加 // @allow-console（谨慎使用）",
      });
    }
  }

  return violations;
}

function main() {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) process.exit(0);

  const allowedConsole = getAllowedConsoleMethods();
  const allViolations = [];

  for (const filePath of files) {
    if (shouldIgnoreFile(filePath)) continue;

    let diff = "";
    try {
      diff = runGitDiffCached(filePath);
    } catch (e) {
      // git diff 失败不直接阻断（可改成阻断）
      continue;
    }
    if (!diff.trim()) continue;

    let newLineNo = 0;
    let skipConsoleNext = false;
    let skipDebuggerNext = false;

    const lines = diff.split("\n");
    for (const line of lines) {
      // hunk header
      if (line.startsWith("@@")) {
        const info = parseHunkHeader(line);
        if (info) newLineNo = info.newStart;
        // reset flags per hunk
        skipConsoleNext = false;
        skipDebuggerNext = false;
        continue;
      }

      // added line (but exclude +++ file header)
      if (line.startsWith("+") && !line.startsWith("+++")) {
        const code = line.slice(1);

        const directive = isDisableNextLineDirective(code);
        if (directive.noConsole) {
          skipConsoleNext = true;
          newLineNo += 1;
          continue;
        }
        if (directive.noDebugger) {
          skipDebuggerNext = true;
          newLineNo += 1;
          continue;
        }

        // 执行检查（根据 skip flag 放行一次）
        const violations = checkAddedLine({
          filePath,
          lineNo: newLineNo,
          code,
          allowedConsole,
        }).filter((v) => {
          if (v.kind.startsWith("console.") && skipConsoleNext) return false;
          if (v.kind === "debugger" && skipDebuggerNext) return false;
          return true;
        });

        if (violations.length) allViolations.push(...violations);

        // flags 只生效一次
        skipConsoleNext = false;
        skipDebuggerNext = false;

        newLineNo += 1;
        continue;
      }

      // context line increments new line number (usually none with -U0)
      if (line.startsWith(" ")) {
        newLineNo += 1;
        continue;
      }

      // removed line doesn't increment new line number
      // if (line.startsWith("-") && !line.startsWith("---")) ...
    }
  }

  if (allViolations.length) {
    console.error("\n❌ 检测到调试代码（staged 新增行）未清理：\n");
    for (const v of allViolations) {
      console.error(
        `- ${v.kind}  ${v.filePath}:${v.lineNo}\n  ${v.code.trim()}\n  提示：${v.hint}\n`,
      );
    }
    console.error(
      "修复后重新 git add 再提交。需要临时放行请使用：// @allow-console 或 // @allow-debugger（建议只用于极少数场景）。\n",
    );
    process.exit(1);
  }
}

main();
