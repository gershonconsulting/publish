// Run: npx tsx --test tests/kb-folders.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/kb-folders.ts";
const { normalizeFolderUrl, folderProvider, cleanFolders, invalidFolders } = ((m as any).default ?? m) as typeof m;

test("links are normalised; junk is refused", () => {
  assert.equal(normalizeFolderUrl("drive.google.com/drive/folders/abc"), "https://drive.google.com/drive/folders/abc");
  assert.equal(normalizeFolderUrl(" https://www.dropbox.com/sh/x "), "https://www.dropbox.com/sh/x");
  assert.equal(normalizeFolderUrl("javascript:alert(1)"), null);
  assert.equal(normalizeFolderUrl("ftp://x.com/a"), null);
  assert.equal(normalizeFolderUrl("hello"), null);
  assert.equal(normalizeFolderUrl(""), null);
});

test("provider names", () => {
  assert.equal(folderProvider("https://drive.google.com/drive/folders/abc"), "Google Drive");
  assert.equal(folderProvider("https://altavia.sharepoint.com/sites/x"), "SharePoint");
  assert.equal(folderProvider("https://www.dropbox.com/sh/x"), "Dropbox");
  assert.equal(folderProvider("https://app.box.com/folder/1"), "Box");
  assert.equal(folderProvider("https://files.example.com/a"), "files.example.com");
});

test("clean: drops invalid + duplicates, keeps ids, default label, max 10", () => {
  const out = cleanFolders([
    { id: "a1", label: " Brand book ", url: "https://drive.google.com/drive/folders/abc" },
    { url: "drive.google.com/drive/folders/abc" }, // duplicate once normalised
    { url: "not a link" },
    { url: "https://www.dropbox.com/sh/x" },
  ], "2026-11-26T00:00:00Z");
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: "a1", label: "Brand book", url: "https://drive.google.com/drive/folders/abc", addedAt: "2026-11-26T00:00:00Z" });
  assert.equal(out[1].label, "Dropbox folder");
  assert.ok(out[1].id.length > 0);
  assert.equal(cleanFolders(Array.from({ length: 15 }, (_, i) => ({ url: `https://x.com/${i}` }))).length, 10);
  assert.deepEqual(cleanFolders(null), []);
  assert.equal(invalidFolders([{ url: "x" }, { url: "" }, { url: "https://a.com" }]), 1);
});
