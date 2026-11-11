/**
 * The copywriter ↔ client review loop (v4.37.0, CloudCampaign-style).
 *
 * Team side: submitForReview() sends an item to the client and emails the
 * client's reviewer their private link. Client side (no account, just the
 * link): clientAction() comments, requests changes or approves — each one is
 * written to the item's thread and emailed to the team.
 */
import prisma from "@/lib/db-raw";
import type { ReviseResult } from "@/lib/publishing-revise";
import {
  addEvent, alertTeam, alertTeamBurst, burstSend, mediaCount, esc, getSettings, getTarget, notifyReadyForPublishing, quote, reviewToken, reviewUrl, sendMail, textProblems, validatorOf,
} from "@/lib/publishing";
import { PUBLISH_MAILS, clientSubject, publishLink } from "@/lib/publishing-mail";
import { markSent } from "@/lib/mail-burst";
import { mailIdempotencyKey, sortedIds } from "@/lib/mail-dedupe";

/** Default batch name, CloudCampaign-style: "<Company> — <Month YYYY>". */
export function batchName(client: string, when = new Date()): string {
  return `${client.replace(/\s+/g, " ").trim()} — ${when.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" })}`;
}

export async function submitForReview(
  orgId: string,
  itemId: string,
  by: string,
  opts: { notify?: boolean; batch?: string | null } = {},
): Promise<string | null> {
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: orgId } });
  if (!item) return "Content not found.";
  if (!item.clientId) return "Pick the client first — the review goes to their reviewer.";
  if (!["DRAFT", "CHANGES_REQUESTED", "IN_REVIEW"].includes(item.status)) return "This content is already approved.";
  const problems = textProblems(item, await getSettings(orgId), await mediaCount(item.id));
  if (problems.length) return problems.join(" ");

  await prisma.contentItem.update({ where: { id: item.id }, data: { status: "IN_REVIEW", submittedAt: new Date() } });
  // The "submitted" event carries the batch name; the review page groups by it.
  await addEvent(orgId, item.id, item.version, "submitted", "team", by, opts.batch ? `batch:${opts.batch}` : null);
  if (opts.notify === false) return null;

  const v = await validatorOf(orgId, item.clientId);
  const target = { reviewerEmail: v.email, reviewerName: v.name };
  const token = await reviewToken(orgId, item.clientId);
  if (target.reviewerEmail) {
    const client = await prisma.client.findFirst({ where: { id: item.clientId }, select: { name: true } });
    const hi = target.reviewerName ? `Hi ${esc(target.reviewerName.split(/\s+/)[0])},` : "Hello,";
    const subject = clientSubject(client?.name, v.isTeam ? null : target.reviewerName, item.scheduledAt);
    // v0.18.2: one key per post version; posts sent one by one within 10 minutes are grouped.
    await burstSend(orgId, item.clientId, "REVIEW_ONE", target.reviewerEmail, {
      subject,
      subjectMany: subject,
      intro: `<p>${hi}</p>`,
      html: `<p>A new post is ready for your review${item.version > 1 ? ` (version ${item.version})` : ""}:</p>${quote(item.text)}
       <p>You can comment, ask for changes, or approve it — nothing is published before you approve.</p>`,
      cta: { href: reviewUrl(token), label: "Review the post" },
      audience: v.isTeam ? "internal" : "client",
    }, [item.id, item.version]);
  }
  return null;
}

/**
 * Send several posts of one company for review together (v4.41.0) — ONE email
 * to the reviewer listing them, like a CloudCampaign approval batch. Posts that
 * are not ready (no picture, too long for X…) are skipped and reported.
 */
export async function submitBatch(
  orgId: string,
  clientId: string,
  ids: string[] | null,
  by: string,
  name?: string | null,
): Promise<{ sent: string[]; skipped: { id: string; title: string; reason: string }[]; batch: string; emailed: boolean }> {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { name: true } });
  const items = await prisma.contentItem.findMany({
    where: {
      organizationId: orgId,
      clientId,
      status: { in: ["DRAFT", "CHANGES_REQUESTED"] },
      ...(ids && ids.length ? { id: { in: ids } } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  // v4.61.1: name the batch after the month the posts are FOR (earliest planned
  // date), not the month it is sent — Autopilot sends November content in October.
  const firstPlanned = items.find((i) => i.scheduledAt)?.scheduledAt ?? undefined;
  const batch = (name || "").trim().slice(0, 120) || batchName(client?.name || "Content", firstPlanned ?? new Date());
  const sent: string[] = [];
  const skipped: { id: string; title: string; reason: string }[] = [];
  for (const it of items) {
    const err = await submitForReview(orgId, it.id, by, { notify: false, batch });
    if (err) skipped.push({ id: it.id, title: it.title || it.text.slice(0, 60), reason: err });
    else sent.push(it.id);
  }
  let emailed = false;
  if (sent.length) {
    const v = await validatorOf(orgId, clientId);
    const target = { reviewerEmail: v.email, reviewerName: v.name };
    if (target.reviewerEmail) {
      const token = await reviewToken(orgId, clientId);
      const hi = target.reviewerName ? `Hi ${esc(target.reviewerName.split(/\s+/)[0])},` : "Hello,";
      const list = items
        .filter((i) => sent.includes(i.id))
        .map((i) => `<li style="margin:4px 0">${esc((i.title || i.text).split("\n")[0].slice(0, 120))}</li>`)
        .join("");
      emailed = await sendMail(
        target.reviewerEmail,
        clientSubject(client?.name, v.isTeam ? null : target.reviewerName, firstPlanned ?? new Date()),
        `<p>${hi}</p><p><b>${esc(batch)}</b> is ready for your review — ${sent.length} post${sent.length === 1 ? "" : "s"}:</p><ul>${list}</ul>
         <p>Approve them one by one or all at once, comment, or ask for changes. Nothing is published before you approve.</p>`,
        { href: reviewUrl(token), label: "Review the content" },
        "REVIEW_BATCH",
        v.isTeam ? "internal" : "client",
        // v0.18.2: the same batch (same posts, same versions) is delivered once a day.
        { idempotencyKey: mailIdempotencyKey(PUBLISH_MAILS.REVIEW_BATCH.no, Date.now(), [orgId, clientId, target.reviewerEmail, sortedIds(items.filter((i) => sent.includes(i.id)).map((i) => `${i.id}@${i.version}`))]) },
      );
      // PUB-101s that follow within 10 minutes are grouped (same client inbox).
      if (emailed) await markSent(orgId, "REVIEW_BATCH", clientId);
    }
  }
  return { sent, skipped, batch, emailed };
}

export type ClientAction = "comment" | "request_changes" | "approve" | "approve_all";

export async function clientAction(
  orgId: string,
  clientId: string,
  itemId: string,
  action: ClientAction,
  name: string | null,
  body: string | null,
  out?: { revised?: ReviseResult },
): Promise<string | null> {
  if (action === "approve_all") {
    const who0 = (name || "").trim().slice(0, 80) || "Client";
    const waiting = await prisma.contentItem.findMany({ where: { organizationId: orgId, clientId, status: "IN_REVIEW" } });
    if (!waiting.length) return "Nothing is waiting for your approval.";
    const now = new Date();
    for (const w of waiting) {
      await prisma.contentItem.update({ where: { id: w.id }, data: { status: "APPROVED", approvedAt: now, approvedBy: who0, approvedRole: "client" } });
      await addEvent(orgId, w.id, w.version, "approved", "client", who0, "Approved with “Approve all”");
    }
    await notifyReadyForPublishing(orgId, waiting.map((w) => w.id), who0, "“Approve all”");
    return null;
  }
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: orgId, clientId } });
  if (!item) return "Post not found.";
  const who = (name || "").trim().slice(0, 80) || "Client";
  const text = (body || "").trim();
  const client = await prisma.client.findFirst({ where: { id: clientId }, select: { name: true } });
  const label = client?.name || "The client";

  if (action === "comment") {
    if (!text) return "Write a comment first.";
    await addEvent(orgId, item.id, item.version, "comment", "client", who, text);
    // v4.55.0 — the comment becomes a new version of the post.
    const r = await reviseNow(orgId, item.id, text, who);
    if (out) out.revised = r;
    await alertTeam(orgId, `${label} commented on a post`, `<p><b>${esc(who)}</b> (${esc(label)}) wrote:</p>${quote(text)}${revisedHtml(r, item.text)}`, "CLIENT_COMMENTED", { href: publishLink("/publishing", { client: clientId, item: item.id }), label: "Open the post in Publish" },
      { idempotencyKey: (to) => mailIdempotencyKey(PUBLISH_MAILS.CLIENT_COMMENTED.no, Date.now(), [orgId, clientId, to, item.id, item.version, text]) });
    return null;
  }
  if (action === "request_changes") {
    if (item.status !== "IN_REVIEW") return "This post isn't waiting for your review.";
    if (!text) return "Tell the copywriter what to change.";
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: "CHANGES_REQUESTED" } });
    await addEvent(orgId, item.id, item.version, "changes_requested", "client", who, text);
    // v4.55.0 — the requested changes are written straight away as a new version.
    const r = await reviseNow(orgId, item.id, text, who);
    if (out) out.revised = r;
    // v0.18.2: one key per (post version, request); requests within 10 minutes are grouped.
    await alertTeamBurst(orgId, clientId, "CLIENT_CHANGES", `${label} asked for changes`, `${label} asked for changes ({n} requests)`,
      `<p><b>${esc(who)}</b> (${esc(label)}) asked for changes:</p>${quote(text)}${revisedHtml(r, item.text)}
       <p><a href="${publishLink("/publishing", { client: clientId, item: item.id })}" style="color:#111">Open this post in Publish</a></p>`,
      { href: publishLink("/publishing", { client: clientId, item: item.id }), label: "Open the post in Publish" },
      [item.id, item.version, text]);
    return null;
  }
  if (action === "approve") {
    if (item.status !== "IN_REVIEW") return "This post isn't waiting for your review.";
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy: who, approvedRole: "client" },
    });
    await addEvent(orgId, item.id, item.version, "approved", "client", who, text || null);
    await notifyReadyForPublishing(orgId, [item.id], who, text ? `approved with the note “${text.slice(0, 200)}”` : "approved");
    return null;
  }
  return "Unknown action.";
}

// ── New version from a comment (v4.55.0) ─────────────────────────────────────

async function reviseNow(orgId: string, itemId: string, text: string, who: string): Promise<ReviseResult> {
  // Imported on demand: publishing-revise → autopilot → publishing-review would otherwise be a cycle.
  const { reviseFromComment } = await import("@/lib/publishing-revise");
  return reviseFromComment(orgId, itemId, text, { role: "client", name: who });
}

/** The part of the team email that shows what happened to the post. */
export function revisedHtml(r: ReviseResult, before: string): string {
  if (r.revised) {
    return `<p>Intelligence wrote <b>version ${r.version}</b> from it${r.picture ? " (with a new picture)" : ""}${r.status === "IN_REVIEW" ? " and sent it back for review" : ""}:</p>${quote(r.text)}<p style="color:#6b7280;font-size:12px">Previous version:</p>${quote(before)}`;
  }
  const why = r.reason === "the comment asks for no change" ? "The comment asks for no change, so the post stays as it is." : `No new version was written (${esc(r.reason)}) — please revise it by hand.`;
  return `<p>${why}</p><p>On:</p>${quote(before)}`;
}
