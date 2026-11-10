// Run: npx tsx --test tests/brand.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/brand.ts";
import * as vl from "../src/lib/kb-validation-logic.ts";
const b = ((m as any).default ?? m) as typeof m;
const v = ((vl as any).default ?? vl) as typeof vl;

test("normalizeHex", () => {
  assert.equal(b.normalizeHex("#abc"), "#AABBCC");
  assert.equal(b.normalizeHex("0a2342"), "#0A2342");
  assert.equal(b.normalizeHex("#0A2342FF"), "#0A2342");
  assert.equal(b.normalizeHex("blue"), null);
});

test("extractFromSite finds brand colours, fonts, logo; keeps neutrals apart", () => {
  const html = `<html><head><title>Acme</title><meta name="theme-color" content="#E30613">
  <link rel="stylesheet" href="/css/theme.css"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&amp;family=Open+Sans&display=swap" rel="stylesheet">
  <style>:root{--brand-primary:#E30613;--accent-color: rgb(0, 51, 102)} body{color:#222;background:#fff;font-family:"Montserrat", Arial, sans-serif} a{color:#003366}</style></head>
  <body><img class="site-logo" src="/img/acme-logo.svg" alt="Acme"></body></html>`;
  const f = b.extractFromSite(html, [".btn{background:#E30613} .x{color:#003366}"], "https://acme.com/");
  assert.equal(f.themeColor, "#E30613");
  assert.equal(f.colors[0].hex, "#E30613");
  assert.ok(f.colors.some((c) => c.hex === "#003366"));
  assert.ok(!f.colors.some((c) => c.hex === "#FFFFFF" || c.hex === "#222222"));
  assert.ok(f.neutrals.some((c) => c.hex === "#222222"));
  assert.deepEqual(f.fonts.slice(0, 2), ["Montserrat", "Open Sans"]);
  assert.equal(f.logoUrl, "https://acme.com/img/acme-logo.svg");
  assert.deepEqual(f.stylesheets, ["https://acme.com/css/theme.css"]);
  assert.ok(f.namedVars.some((x) => x.name === "brand-primary" && x.hex === "#E30613"));
  const brand = b.brandFromFindings(f, "Website https://acme.com/");
  assert.equal(brand.colors[0].hex, "#E30613");
  assert.equal(brand.source, "ai");
});

test("brandText ↔ parseBrandText round trip", () => {
  const br = b.cleanBrand({ colors: [{ name: "Red", hex: "#e30613", role: "Primary" }, { name: "Navy", hex: "#036", role: "" }], fonts: "Montserrat", logoUrl: "https://acme.com/logo.svg", notes: "Logo on white only.\nNo gradients.", source: "ai", from: "Website https://acme.com", updatedAt: null });
  const t = b.brandText(br);
  assert.match(t, /- Red: #E30613 \(Primary\)/);
  const back = b.parseBrandText(t, br);
  assert.deepEqual(back.colors, br.colors);
  assert.equal(back.fonts, "Montserrat");
  assert.equal(back.logoUrl, br.logoUrl);
  assert.equal(back.notes, br.notes);
  assert.equal(back.from, br.from);
  assert.equal(back.source, "manual");
  // a reviewer fixes one code
  const fixed = b.parseBrandText(t.replace("#E30613", "#D10A11"), br);
  assert.equal(fixed.colors[0].hex, "#D10A11");
});

test("cleanBrand drops bad codes, duplicates and non-http logos", () => {
  const c = b.cleanBrand({ colors: [{ name: "a", hex: "zzz", role: "" }, { name: "b", hex: "#111", role: "" }, { name: "c", hex: "#111111", role: "" }], logoUrl: "javascript:alert(1)" });
  assert.equal(c.colors.length, 1);
  assert.equal(c.logoUrl, "");
  assert.equal(b.hasBrand(b.EMPTY_BRAND), false);
});

test("prompts: palette only lists brand colours", () => {
  const br = b.cleanBrand({ colors: [{ name: "White", hex: "#FFFFFF", role: "" }, { name: "Red", hex: "#E30613", role: "Primary" }] });
  assert.match(b.paletteForImage(br), /red \(#E30613\)/);
  assert.doesNotMatch(b.paletteForImage(br), /FFFFFF/);
  assert.equal(b.paletteForImage(b.EMPTY_BRAND), "");
  assert.match(b.brandForPrompt(br), /BRAND IDENTITY/);
});

test("validation gets a Brand section only when a brand is known", () => {
  const T = "2026-11-10T00:00:00.000Z";
  const kb = { valueProp: { text: "x", source: "ai" as const, updatedAt: T }, competitive: { notes: "y", source: "ai" as const, updatedAt: T }, icps: [], style: { text: "", source: "manual" as const, updatedAt: null } };
  assert.ok(!v.sectionsOf({ ...kb, brand: b.EMPTY_BRAND }).some((s) => s.id === "brand"));
  const s = v.sectionsOf({ ...kb, brand: b.cleanBrand({ colors: [{ name: "Red", hex: "#E30613", role: "" }] }) });
  assert.equal(s.at(-1)!.id, "brand");
  assert.equal(s.at(-1)!.kind, "brand");
});
