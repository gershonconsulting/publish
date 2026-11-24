export const runtime = "edge";
/**
 * GET /api/extension/version — the latest Publish extension. Public (the
 * popup checks it before the extension is bound). (Publish v0.6.0)
 *
 * Single source of truth: EXTENSION_LATEST in lib/extension-version.ts.
 */
import { NextResponse } from "next/server";
import { EXTENSION_LATEST, EXTENSION_NAME, EXTENSION_UNPACKED_FOLDER, EXTENSION_ZIP_URL } from "@/lib/extension-version";

const RELEASE_NOTES: Record<string, string> = {
  "0.3.0":
    "LinkedIn posts now tag the client company for real: the extension types @ and the company name, then picks the company from LinkedIn's suggestion list, so the name links to the page and the company is notified. If LinkedIn does not suggest the page, the @Name stays as plain text and the post still goes out; the post's history says which happened.",
  "0.1.0":
    "First release of Publish's own extension. Every minute it picks up the posts that are due on publish.gershon.ai and publishes them on the company LinkedIn page or X account, in its own minimized window that never takes over your screen (a post that fails there is retried in a normal window). It never collects posts — Social's extension does that.",
};

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        name: EXTENSION_NAME,
        latest: EXTENSION_LATEST,
        downloadUrl: EXTENSION_ZIP_URL,
        releaseNotes: RELEASE_NOTES[EXTENSION_LATEST] ?? "",
        updateInstructions: `Open chrome://extensions and press the reload arrow on "Publish by Gershon.AI" (folder: ${EXTENSION_UNPACKED_FOLDER}), or download the new zip from publish.gershon.ai/extension.`,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
