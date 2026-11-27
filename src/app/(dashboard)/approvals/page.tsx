import { Header } from "@/components/layout/header";
import { ApprovalsClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return <div>
    <Header title="Approvals" eyebrow="Workspace" subtitle="Create a private link for selected posts, and find every request here to open or share it again." />
    <ApprovalsClient />
  </div>;
}
