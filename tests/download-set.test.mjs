import assert from "node:assert/strict";
import test from "node:test";
import { createDownloadSet, downloadZipFilename } from "../app/download-set.ts";

test("builds the download set from processed and existing files only", () => {
  const entries = createDownloadSet([
    { name: "same.jpg", bytes: new Uint8Array([1]), status: "processed" },
    { name: "same.jpg", bytes: new Uint8Array([2]), status: "existing" },
    { name: "unavailable.png", bytes: new Uint8Array([3]), status: "unavailable" },
  ]);

  assert.deepEqual(entries.map(entry => entry.name), ["same.jpg", "same.jpg"]);
  assert.deepEqual(entries.map(entry => [...entry.bytes]), [[1], [2]]);
});

test("uses the required timestamped ZIP filename", () => {
  assert.equal(downloadZipFilename(new Date(2026, 6, 30, 9, 5, 7)), "amazon-ai-image-tagger-20260730-090507.zip");
});
