// v0.12.0 Content funnel (ex CloudCampaign / HeroPost views). Client-side; see page-client.
import { FunnelClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function FunnelPage() {
  return <FunnelClient />;
}
