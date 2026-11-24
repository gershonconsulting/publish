/**
 * v0.25.0 — weekly feature-status email (PUB-217). Pure logic (tests/feature-status.test.mts).
 * 🔴 started · 🟠 pending validation · 🟢 done. Features that changed status in the
 * last 7 days are marked NEW; green items older than 30 days are folded into a count.
 */
import type { Feature, FeatureState } from "./feature-status-data";

const DAY = 86400000;
export const STATES: FeatureState[] = ["started", "validation", "done"];
export const LABEL: Record<FeatureState, string> = { started: "Started", validation: "Pending validation", done: "Done" };
export const DOT: Record<FeatureState, string> = { started: "🔴", validation: "🟠", done: "🟢" };
export const COLOR: Record<FeatureState, string> = { started: "#b91c1c", validation: "#b45309", done: "#047857" };

/** NY calendar date → ms at noon UTC that day (good enough for day maths). */
const dayMs = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);

export type FeatureGroup = { state: FeatureState; items: (Feature & { isNew: boolean })[]; olderDone: number };

export function groupFeatures(list: Feature[], now = Date.now()): FeatureGroup[] {
  const weekAgo = now - 7 * DAY, monthAgo = now - 30 * DAY;
  return STATES.map((state) => {
    const all = list.filter((f) => f.state === state).sort((a, b) => b.since.localeCompare(a.since) || a.title.localeCompare(b.title));
    const shown = state === "done" ? all.filter((f) => dayMs(f.since) >= monthAgo) : all;
    return {
      state,
      items: shown.map((f) => ({ ...f, isNew: dayMs(f.since) >= weekAgo })),
      olderDone: state === "done" ? all.length - shown.length : 0,
    };
  });
}

export function featureCounts(list: Feature[], now = Date.now()) {
  const weekAgo = now - 7 * DAY;
  return {
    started: list.filter((f) => f.state === "started").length,
    validation: list.filter((f) => f.state === "validation").length,
    done: list.filter((f) => f.state === "done").length,
    doneThisWeek: list.filter((f) => f.state === "done" && dayMs(f.since) >= weekAgo).length,
  };
}

const escH = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function featureStatusSubject(list: Feature[], label: string, now = Date.now()): string {
  const c = featureCounts(list, now);
  return `Publish Feature Status — ${label} · 🔴 ${c.started} started · 🟠 ${c.validation} pending validation · 🟢 ${c.doneThisWeek} done this week`;
}

export function featureStatusHtml(list: Feature[], label: string, now = Date.now()): string {
  const c = featureCounts(list, now);
  const groups = groupFeatures(list, now);
  const block = (g: FeatureGroup) => {
    const rows = g.items.map((f) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap">${DOT[g.state]}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${escH(f.title)}</b>${f.version ? ` <span style="color:#777">v${escH(f.version)}</span>` : ""}${f.isNew ? ` <span style="background:${COLOR[g.state]};color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">NEW</span>` : ""}
        ${f.note ? `<div style="font-size:13px;color:#555">${escH(f.note)}</div>` : ""}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#777;font-size:12px;white-space:nowrap;vertical-align:top">since ${escH(f.since)}</td></tr>`).join("");
    const empty = g.items.length ? "" : `<tr><td colspan="3" style="padding:6px 10px;color:#777">Nothing here.</td></tr>`;
    const older = g.olderDone ? `<tr><td colspan="3" style="padding:6px 10px;color:#777;font-size:13px">+ ${g.olderDone} earlier feature${g.olderDone === 1 ? "" : "s"} done (more than 30 days ago)</td></tr>` : "";
    return `<h3 style="color:${COLOR[g.state]};margin:18px 0 6px">${DOT[g.state]} ${LABEL[g.state]} (${g.state === "done" ? c.done : g.items.length})</h3>
      <table style="border-collapse:collapse;font-size:14px;width:100%">${rows}${empty}${older}</table>`;
  };
  return `<p><b>Week of ${escH(label)}</b> — <b style="color:${COLOR.started}">${c.started} started</b> ·
      <b style="color:${COLOR.validation}">${c.validation} pending validation</b> ·
      <b style="color:${COLOR.done}">${c.doneThisWeek} done this week</b> (${c.done} done in total).</p>
    <p style="font-size:13px;color:#555">🔴 Started = in development · 🟠 Pending validation = built, waiting for an OK, a deploy or a live check · 🟢 Done = live on publish.gershon.ai. NEW = changed status in the last 7 days.</p>
    ${groups.map(block).join("")}`;
}
