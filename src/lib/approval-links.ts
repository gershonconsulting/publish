import prisma from "@/lib/db-raw";
import { APPROVAL_PREFIX, approvalRecord } from "@/lib/approval-links-model";

export async function resolveApprovalLink(token: string) {
  if (!/^ga_[a-f0-9]{48}$/.test(token)) return null;
  const row = await prisma.orgSetting.findFirst({ where: { key: APPROVAL_PREFIX + token } });
  if (!row) return null;
  let value;
  try { value = JSON.parse(row.value); } catch { return null; }
  const parsed = approvalRecord.safeParse(value);
  if (!parsed.success) return null;
  return { orgId: row.organizationId, clientId: parsed.data.clientId, approval: parsed.data };
}
