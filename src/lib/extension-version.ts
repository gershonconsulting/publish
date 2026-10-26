/**
 * Single source of truth for the shipped PUBLISH Chrome-extension version
 * ("Publish by Gershon.AI — LinkedIn & X Publisher", v0.6.0 of the app).
 *
 * Bump EXTENSION_LATEST together with extension-src/manifest.json: the build
 * (scripts/build-extension.mjs) FAILS when they differ, because every download
 * link is built from this constant. Consumed by:
 *   - GET /api/extension/version  (the popup's update check)
 *   - the red "out of date" banner on every page (shared layout)
 *   - /extension (download + Load unpacked)
 *
 * This is NOT Social's extension (social-extension-v0.25.x). Publish's own
 * extension only publishes; it never collects.
 */
import { PRODUCT_VERSION } from "@/lib/product";

export const EXTENSION_LATEST = "0.1.0";

export const EXTENSION_NAME = "Publish by Gershon.AI — LinkedIn & X Publisher";

/** The download carries its version in the file name, like the other Gershon extensions. */
export const EXTENSION_ZIP_NAME = `publish-extension-v${EXTENSION_LATEST}.zip`;
export const EXTENSION_ZIP_URL = `/${EXTENSION_ZIP_NAME}`;

/** The folder on Olivier's computer that Chrome loads the unpacked extension from. */
export const EXTENSION_UNPACKED_FOLDER =
  "C:\\Users\\oatti\\Documents\\Claude\\Projects\\Social Gershon Consulting\\publish-chrome-extension";

/** Browser ids the Publish extension registers with (Social's start "ag_"). */
export const PUBLISH_BROWSER_ID_PREFIX = "pb_";

/** App version — the Publish product version (shown in reports and file names). */
export const APP_VERSION = PRODUCT_VERSION;
