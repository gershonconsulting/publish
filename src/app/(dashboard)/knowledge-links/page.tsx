// Knowledge links (v0.23.0) — every company's client validation link on one page.
import { Header } from "@/components/layout/header";
import { KnowledgeLinksClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div>
      <Header
        title="Knowledge links"
        eyebrow="Workspace"
        subtitle="One private link per client to confirm or correct what we know about them: value proposition, competitors, ideal customers, writing style and brand. Publish never sends these links — copy them into your own email."
      />
      <KnowledgeLinksClient />
    </div>
  );
}
