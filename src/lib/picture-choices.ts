/**
 * v0.27.0 — DB side of the client picture choice (see picture-choices-model.ts).
 * Stored in org_settings `pic_choices:<postId>` (no schema change).
 */
import prisma from "@/lib/db-raw";
import { addEvent, MEDIA_SELECT } from "@/lib/publishing";
import { trackUse } from "@/lib/picture-options-db";
import { addChoice, removeChoice, withoutData, type Choice, type ChoiceInfo } from "@/lib/picture-choices-model";

const key = (itemId: string) => `pic_choices:${itemId}`;

export async function getChoices(orgId: string, itemId: string): Promise<Choice[]> {
  const r = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: key(itemId) } } });
  try {
    return r ? (JSON.parse(r.value) as Choice[]) : [];
  } catch {
    return [];
  }
}

async function save(orgId: string, itemId: string, list: Choice[]): Promise<void> {
  if (!list.length) {
    await prisma.orgSetting.deleteMany({ where: { organizationId: orgId, key: key(itemId) } });
    return;
  }
  const value = JSON.stringify(list);
  await prisma.orgSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key: key(itemId) } }, create: { organizationId: orgId, key: key(itemId), value }, update: { value } });
}

function newId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function addPictureChoice(orgId: string, itemId: string, p: { dataB64: string; mime: string; width?: number | null; height?: number | null; label?: string; track?: string }): Promise<string | null> {
  const r = addChoice(await getChoices(orgId, itemId), {
    id: newId(), mime: p.mime, dataB64: p.dataB64, width: p.width ?? null, height: p.height ?? null, label: (p.label || "").slice(0, 120), at: new Date().toISOString(), ...(p.track ? { track: p.track } : {}),
  });
  if (r.error) return r.error;
  await save(orgId, itemId, r.list);
  return null;
}

export async function removePictureChoice(orgId: string, itemId: string, id: string): Promise<void> {
  await save(orgId, itemId, removeChoice(await getChoices(orgId, itemId), id));
}

export async function clearPictureChoices(orgId: string, itemId: string): Promise<void> {
  await save(orgId, itemId, []);
}

export async function choiceCount(orgId: string, itemId: string): Promise<number> {
  return (await getChoices(orgId, itemId)).length;
}

/** Pictures waiting for the client's choice, for many posts (no bytes). */
export async function choicesFor(orgId: string, itemIds: string[]): Promise<Record<string, ChoiceInfo[]>> {
  if (!itemIds.length) return {};
  const rows = await prisma.orgSetting.findMany({ where: { organizationId: orgId, key: { in: itemIds.map(key) } }, select: { key: true, value: true } });
  const out: Record<string, ChoiceInfo[]> = {};
  for (const r of rows) {
    try {
      out[r.key.slice("pic_choices:".length)] = (JSON.parse(r.value) as Choice[]).map(withoutData);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** The client picked one: it becomes the post's picture, the others go. */
export async function clientChoosePicture(orgId: string, itemId: string, choiceId: string, who: string): Promise<string | null> {
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: orgId } });
  if (!item) return "Post not found.";
  const list = await getChoices(orgId, itemId);
  const i = list.findIndex((c) => c.id === choiceId);
  if (i < 0) return "This picture is not available any more — reload the page.";
  const c = list[i];
  const k = new Uint8Array(16);
  crypto.getRandomValues(k);
  await prisma.contentMedia.deleteMany({ where: { contentId: itemId } });
  await prisma.contentMedia.create({
    data: {
      organizationId: orgId, contentId: itemId, key: Array.from(k, (x) => x.toString(16).padStart(2, "0")).join(""), position: 0, mime: c.mime,
      name: `client-choice${c.mime === "image/png" ? ".png" : ".jpg"}`, width: c.width, height: c.height, sizeBytes: Math.floor((c.dataB64.length * 3) / 4), dataB64: c.dataB64,
    },
    select: MEDIA_SELECT,
  });
  await clearPictureChoices(orgId, itemId);
  if (c.track) await trackUse({ source: "unsplash", track: c.track });
  await addEvent(orgId, itemId, item.version, "comment", "client", who, `Chose picture ${i + 1} of ${list.length}.`);
  return null;
}
