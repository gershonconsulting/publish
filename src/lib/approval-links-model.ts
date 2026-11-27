import { z } from "zod";

export const APPROVAL_PREFIX = "approval_link:";
export const approvalInput = z.object({
  name: z.string().trim().min(1, "Give this request a name.").max(160),
  clientId: z.string().min(1).nullable(),
  ids: z.array(z.string().min(1)).min(1, "Select at least one post.").max(2000)
    .transform((ids) => [...new Set(ids)]),
});
export const approvalRecord = approvalInput.extend({
  scopeName: z.string(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type ApprovalRecord = z.infer<typeof approvalRecord>;

/** A persisted selection never depends on status, age, or a submission batch. */
export function approvalScope<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => { const item = byId.get(id); return item ? [item] : []; });
}

/** Never trust client-supplied action IDs to widen the link's selection. */
export function approvalActionIds(selected: string[], requested: string[] | null): string[] {
  return requested === null ? selected : selected.filter((id) => requested.includes(id));
}
