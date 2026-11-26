/**
 * v0.27.0 — the client chooses the picture (Olivier 2026-11-25: "Give us the
 * option to load 3 pictures for the client to validate").
 *
 * The team loads up to 3 pictures on a post; the client sees them on the review
 * page and picks one — it becomes the post's picture. Pure rules here (tested).
 */
export const MAX_CHOICES = 3;
export type Choice = { id: string; mime: string; dataB64: string; width: number | null; height: number | null; label: string; at: string; track?: string };
export type ChoiceInfo = Omit<Choice, "dataB64" | "track">;

/** Adds a picture; refuses a 4th. */
export function addChoice(list: Choice[], c: Choice): { list: Choice[]; error?: string } {
  if (list.length >= MAX_CHOICES) return { list, error: `Up to ${MAX_CHOICES} pictures — remove one first.` };
  return { list: [...list, c] };
}

export function removeChoice(list: Choice[], id: string): Choice[] {
  return list.filter((c) => c.id !== id);
}

/** What the post counts as for "every post needs a picture": its picture, or pictures for the client to choose from. */
export function pictureCount(media: number, choices: number): number {
  return media + (choices > 0 ? 1 : 0);
}

/** Blocks approval while the client still has to choose. */
export function approveBlock(choices: number): string | null {
  return choices > 0 ? `Choose one of the ${choices} pictures first.` : null;
}

export function withoutData(c: Choice): ChoiceInfo {
  const { dataB64: _d, track: _t, ...rest } = c;
  void _d;
  void _t;
  return rest;
}

/** "Approve all" message when some posts still wait for a picture choice. */
export function approveAllNote(approved: number, waitingChoice: number): string | null {
  if (!waitingChoice) return null;
  return `${approved ? `${approved} approved. ` : ""}${waitingChoice} post${waitingChoice === 1 ? "" : "s"} still need${waitingChoice === 1 ? "s" : ""} you to choose a picture.`;
}

/** Unsplash API guidelines: call download_location only when a photo is actually used. Returns the URL to call, or null. */
export function unsplashTrackUrl(source: string, track?: string | null): string | null {
  return source === "unsplash" && track && /^https:\/\/api\.unsplash\.com\//.test(track) ? track : null;
}
