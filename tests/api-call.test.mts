// Run: npx tsx --test tests/api-call.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/api-call.ts";
const { readAnswer } = ((m as any).default ?? m) as typeof m;

const html = '<!DOCTYPE html><html><head><title>Worker exceeded resource limits</title></head></html>';

test("normal JSON answer is passed through", () => {
  const a = readAnswer(200, '{"success":true,"data":{"id":"x"}}');
  assert.equal(a.kind, "json");
});

test("route's own 4xx error is shown, not retried", () => {
  const a = readAnswer(400, '{"success":false,"error":"Write something first."}');
  assert.deepEqual(a, { kind: "json", data: { success: false, error: "Write something first." } });
});

test("route's own 500 with a message is shown, not retried", () => {
  const a = readAnswer(500, '{"success":false,"error":"boom"}');
  assert.equal(a.kind, "json");
});

test("Cloudflare HTML page (Aina, 2026-11-12) is retried with a readable message", () => {
  const a = readAnswer(500, html);
  assert.equal(a.kind, "retry");
  assert.ok(!("error" in a) || !/DOCTYPE|JSON/.test((a as { error: string }).error));
});

test("HTML on 200 is retried too", () => {
  assert.equal(readAnswer(200, html).kind, "retry");
});

test("429 and 52x are retried", () => {
  assert.equal(readAnswer(429, "Too many").kind, "retry");
  assert.equal(readAnswer(524, '{"success":false,"error":"x"}').kind, "retry");
});

test("403 HTML = Cloudflare security check: no blind retry, tell them to reload", () => {
  const a = readAnswer(403, html);
  assert.equal(a.kind, "fail");
  assert.match((a as { error: string }).error, /Reload/);
});
