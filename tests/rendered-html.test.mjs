import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports a static tool page for GitHub Pages", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /亚马逊 AI 图片合规标记工具/);
  assert.match(html, /contains-synthetic-performer/);
  assert.match(html, /检测 XMP 标签/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
