import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports a static tool page for GitHub Pages", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /Amazon AI Image Tagger/);
  assert.match(html, /为 Amazon AI 人物图片写入合规标签/);
  assert.match(html, /contains-synthetic-performer/);
  assert.match(html, /上传图片，检测并写入合规标签。/);
  assert.match(html, /JPG 和 PNG 像素不会被解码或重新编码/);
  assert.doesNotMatch(html, /检测 XMP 标签/);
  assert.doesNotMatch(html, /保留原有的标记/);
  assert.doesNotMatch(html, /批量处理/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
