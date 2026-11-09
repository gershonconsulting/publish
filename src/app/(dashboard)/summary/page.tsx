// v0.13.0: Summary is part of the global dashboard now (the "Every company" table).
import { redirect } from "next/navigation";

export const runtime = "edge";

export default function SummaryPage() {
  redirect("/dashboard");
}
