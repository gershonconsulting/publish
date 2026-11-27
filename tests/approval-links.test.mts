// Run: node node_modules/tsx/dist/cli.mjs --test tests/approval-links.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import * as model from "../src/lib/approval-links-model.ts";
const { approvalInput, approvalRecord, approvalScope, approvalActionIds } = ((model as any).default ?? model) as typeof model;

test("three mixed-status posts stay selected through approval, publication and a new submission batch", () => {
  const posts = [
    { id: "todo", status: "DRAFT" },
    { id: "waiting", status: "IN_REVIEW" },
    { id: "approved", status: "APPROVED" },
    { id: "other", status: "IN_REVIEW" },
  ];
  const original = structuredClone(posts);
  const request = approvalRecord.parse({ name: "Amphasys – Publications de décembre", clientId: "amphasys", ids: ["todo", "waiting", "approved"], scopeName: "Amphasys", createdAt: "2026-11-27T12:00:00.000Z", createdBy: "Team" });
  const persisted = JSON.stringify(request);
  assert.deepEqual(approvalScope(posts, request.ids).map((p) => p.id), request.ids);
  assert.deepEqual(posts, original, "creating and reading the link never changes statuses");
  posts[1].status = "APPROVED";
  assert.deepEqual(approvalScope(posts, request.ids).map((p) => p.id), request.ids);
  posts[1].status = "PUBLISHED";
  const reloaded = approvalRecord.parse(JSON.parse(persisted));
  assert.deepEqual(approvalScope(posts, reloaded.ids).map((p) => p.id), request.ids);
});

test("missing or deleted selected posts never fall back to other content", () => {
  assert.deepEqual(approvalScope([{ id: "unselected" }], ["deleted"]), []);
  assert.deepEqual(approvalScope([{ id: "a" }, { id: "b" }], ["b", "a"]), [{ id: "b" }, { id: "a" }]);
});

test("bulk action cannot widen access using arbitrary or omitted IDs", () => {
  assert.deepEqual(approvalActionIds(["a", "b"], ["b", "other"]), ["b"]);
  assert.deepEqual(approvalActionIds(["a", "b"], null), ["a", "b"]);
  assert.deepEqual(approvalActionIds(["a", "b"], []), []);
});

test("request validation rejects empty and malformed selections and deduplicates IDs", () => {
  assert.equal(approvalInput.safeParse({ name: "  ", clientId: "c", ids: ["a"] }).success, false);
  assert.equal(approvalInput.safeParse({ name: "December", clientId: "c", ids: [] }).success, false);
  assert.equal(approvalInput.safeParse({ name: "December", clientId: "c", ids: [42] }).success, false);
  assert.deepEqual(approvalInput.parse({ name: " December ", clientId: null, ids: ["a", "a", "b"] }), { name: "December", clientId: null, ids: ["a", "b"] });
});

test("API creation, history and token access keep an exact tenant-scoped selection", async () => {
  const require = createRequire(import.meta.url);
  const { NextRequest, NextResponse } = require("next/server");
  const rows: any[] = [];
  const posts = [
    { id: "todo", organizationId: "org", clientId: "c", status: "DRAFT", comments: [] },
    { id: "waiting", organizationId: "org", clientId: "c", status: "IN_REVIEW", comments: [] },
    { id: "approved", organizationId: "org", clientId: "c", status: "APPROVED", comments: [] },
    { id: "other", organizationId: "org", clientId: "c", status: "IN_REVIEW", comments: [] },
    { id: "foreign", organizationId: "otherOrg", clientId: "otherClient", status: "IN_REVIEW", comments: [] },
    { id: "workspace", organizationId: "org", clientId: null, status: "IN_REVIEW", comments: [] },
  ];
  const calls: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: any) =>
    value && typeof value === "object" ? (value.in ? value.in.includes(row[key]) : row[key].startsWith(value.startsWith)) : row[key] === value);
  const db = {
    contentItem: { findMany: async ({ where }: any) => posts.filter((p) => matches(p, where)) },
    client: { findMany: async () => [{ id: "c", name: "Amphasys" }], findFirst: async ({ where }: any) => where.id === "c" && where.organizationId === "org" ? { name: "Amphasys" } : null },
    organization: { findUnique: async () => ({ name: "Workspace" }) },
    orgSetting: {
      create: async ({ data }: any) => { rows.push(structuredClone(data)); return data; },
      findFirst: async ({ where }: any) => rows.find((r) => matches(r, where)) || null,
      findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)),
    },
  };
  let readOnly = false;
  let resolve: any;
  const loader = (Module as any)._load;
  (Module as any)._load = function (id: string, ...args: any[]) {
    if (id === "@/lib/db-raw") return { __esModule: true, default: db };
    if (id === "@/lib/publishing-auth") return { publishingCaller: async (write: boolean) => write && readOnly ? NextResponse.json({ success: false }, { status: 403 }) : { orgId: "org", name: "Team", canWrite: !readOnly } };
    if (id === "@/lib/publishing") return { reviewUrl: (t: string) => `https://publish.gershon.ai/review/${t}`, resolveReviewToken: (t: string) => resolve(t) };
    if (id === "@/lib/publishing-review") return { clientAction: async (...args: any[]) => { calls.push(args); return null; } };
    if (id === "@/lib/picture-choices") return { choicesFor: async () => ({}), getChoices: async () => [] };
    return loader.call(this, id, ...args);
  };
  try {
    resolve = require("../src/lib/approval-links.ts").resolveApprovalLink;
    const management = require("../src/app/api/publishing/approvals/route.ts");
    const review = require("../src/app/api/review/[token]/route.ts");
    const picture = require("../src/app/api/review/[token]/picture/[itemId]/[choiceId]/route.ts");
    const request = (path: string, body?: any) => new NextRequest(`https://publish.gershon.ai${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const input = { name: "December", clientId: "c", ids: ["todo", "waiting", "approved"] };
    const before = structuredClone(posts);
    const response = await management.POST(request("/api/publishing/approvals", input));
    assert.equal(response.status, 201);
    const { data: created } = await response.json();
    assert.deepEqual(posts, before);
    assert.equal(rows.length, 1);
    const ctx = { params: Promise.resolve({ token: created.token }) };
    const getItems = async () => (await (await review.GET(request(`/api/review/${created.token}?post=other&batch=other`), ctx)).json()).data.items.map((p: any) => p.id);
    assert.deepEqual(await getItems(), input.ids, "query parameters cannot widen or alter a saved selection");
    posts[1].status = "APPROVED";
    posts[2].status = "PUBLISHED";
    assert.deepEqual(await getItems(), input.ids, "no status or age-based disappearance");
    const history = await (await management.GET(request("/api/publishing/approvals"))).json();
    assert.equal(history.data.links[0].url, created.url);
    assert.equal(history.data.links[0].count, 3);
    assert.equal(history.data.links[0].scopeName, "Amphasys");
    const selector = await (await management.GET(request("/api/publishing/approvals?select=1&clientId=c"))).json();
    assert.equal(selector.data.items.length, 4, "selector includes every status");
    assert.equal((await management.POST(request("/api/publishing/approvals", { ...input, ids: ["foreign"] }))).status, 400);
    assert.equal((await review.POST(request("/api/review/x", { action: "approve", contentId: "other" }), ctx)).status, 404);
    posts[1].status = "IN_REVIEW";
    await review.POST(request("/api/review/x", { action: "approve_all", ids: ["waiting", "other", "foreign"] }), ctx);
    assert.deepEqual(calls.at(-1)[7], ["waiting"], "bulk action is bounded by stored membership");
    await review.POST(request("/api/review/x", { action: "approve_all" }), ctx);
    assert.deepEqual(calls.at(-1)[7], ["waiting"], "omitting IDs also remains bounded");
    assert.equal((await picture.GET(request("/x"), { params: Promise.resolve({ token: created.token, itemId: "other", choiceId: "x" }) })).status, 404);
    assert.equal(await resolve("ga_" + "0".repeat(48)), null);
    readOnly = true;
    assert.equal((await management.POST(request("/api/publishing/approvals", input))).status, 403);
    readOnly = false;
    const workspaceResponse = await management.POST(request("/api/publishing/approvals", { ...input, clientId: null, ids: ["waiting", "workspace"] }));
    const workspace = (await workspaceResponse.json()).data;
    await review.POST(request("/api/review/x", { action: "approve_all" }), { params: Promise.resolve({ token: workspace.token }) });
    assert.deepEqual(calls.slice(-2).map((c) => [c[1], c[7]]), [["c", ["waiting"]], [null, ["workspace"]]]);
    posts.splice(0, 3);
    assert.deepEqual(await getItems(), [], "deleted selection never exposes other posts");
  } finally { (Module as any)._load = loader; }
});
