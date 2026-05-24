#!/usr/bin/env node
// verify-ui.mjs — UI verification harness.
// Usage:
//   node tools/verify-ui.mjs              # all pages, default tag "baseline"
//   node tools/verify-ui.mjs my-task      # tag is the first arg
//
// Spins up python3 -m http.server, drives Chromium through Playwright at
// 320 / 375 / 768 / 1280, captures light + dark + reduced-motion screenshots
// per page, and writes them to artifacts/screenshots/<tag>/.
//
// Prereqs (one-off):
//   npm install
//   npx playwright install chromium
//
// Outputs:
//   artifacts/screenshots/<tag>/<page>-<width>-<theme>[-rm].png
//   artifacts/verify-<tag>.json  (page x viewport x theme grid + any errors)

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8788;
const TAG = process.argv[2] || "baseline";
const OUT_DIR = join(__root, "artifacts", "screenshots", TAG);

const PAGES = [
  ["index",        "/"],
  ["about-search", "/pages/about-search.html"],
  ["areas",        "/pages/areas.html"],
  ["area-detail",  "/pages/area-detail.html?id=stockbridge-so20"],
  ["house-types",  "/pages/house-types.html"],
  ["journey",      "/pages/journey.html"],
  ["finances",     "/pages/finances.html"],
  ["map",          "/pages/map.html"],
];
const VIEWPORTS = [
  { name: "320",  width: 320,  height: 760  },
  { name: "375",  width: 375,  height: 812  },
  { name: "768",  width: 768,  height: 1024 },
  { name: "1280", width: 1280, height: 900  },
];
const THEMES = ["light", "dark"];

function startServer() {
  const proc = spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: __root, stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(proc), 1000);
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function shoot(page, name, vp, theme, rm) {
  const slug = `${name}-${vp.name}-${theme}${rm ? "-rm" : ""}.png`;
  await page.screenshot({ path: join(OUT_DIR, slug), fullPage: true });
  return slug;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const grid = [];
  const errors = [];

  try {
    for (const [name, path] of PAGES) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            colorScheme: theme,
            reducedMotion: "no-preference",
          });
          const page = await ctx.newPage();
          page.on("pageerror", (e) => errors.push({ name, vp: vp.name, theme, error: String(e) }));
          page.on("console", (m) => { if (m.type() === "error") errors.push({ name, vp: vp.name, theme, console: m.text() }); });
          try {
            await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle", timeout: 8000 });
            // Apply the explicit theme to override saved localStorage if any.
            await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
            await page.waitForTimeout(150);
            const file = await shoot(page, name, vp, theme, false);
            grid.push({ page: name, vp: vp.name, theme, rm: false, file });
            console.log("  ✓", file);
          } catch (e) {
            errors.push({ name, vp: vp.name, theme, navigation: String(e) });
            console.log("  ✗", name, vp.name, theme, e.message);
          } finally {
            await ctx.close();
          }
        }
      }
      // One reduced-motion shot per page at 375px light
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 }, colorScheme: "light", reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle", timeout: 8000 });
        await page.waitForTimeout(150);
        const file = await shoot(page, name, { name: "375" }, "light", true);
        grid.push({ page: name, vp: "375", theme: "light", rm: true, file });
        console.log("  ✓", file);
      } catch (e) {
        errors.push({ name, vp: "375", theme: "light-rm", navigation: String(e) });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  await mkdir(join(__root, "artifacts"), { recursive: true });
  await writeFile(
    join(__root, "artifacts", `verify-${TAG}.json`),
    JSON.stringify({ tag: TAG, when: new Date().toISOString(), grid, errors }, null, 2),
  );
  console.log(`\n${grid.length} shots, ${errors.length} errors → artifacts/verify-${TAG}.json`);
  if (errors.length) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
