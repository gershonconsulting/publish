/** Which of the three Gershon platforms this build is. */
export const PRODUCT_NAME = "Publish";
/** v0.6.0: Publish's own Dashboard is the landing page (and the sign-in redirect). */
export const PRODUCT_HOME = "/dashboard";
export const PRODUCT_TAGLINE = "Create, approve, schedule and publish";
export const PRODUCT_VERSION = "0.8.0";

/** Sign-in page copy (v0.2.1: was still Social's copy). */
export const PRODUCT_LOGIN_HEADLINE = "Create, approve and publish every campaign post.";
export const PRODUCT_LOGIN_SUBLINE = "Content, client review, scheduling and Autopilot for our campaign and internal companies, on LinkedIn and X.";
export const PRODUCT_LOGIN_POINTS = ["Client review before anything goes out", "Calendar and scheduled publishing on LinkedIn and X", "Autopilot drafts from each company's Knowledge Base"];
export const PRODUCT_DESCRIPTION = "Publish by Gershon.AI \u2014 create, approve, schedule and publish (internal)";

/**
 * Company categories this product serves (Olivier, 2026-10-26): Publish and
 * Social Tracking are for our CAMPAIGN clients and INTERNAL (Gershon) only.
 * Social keeps the whole ecosystem (partners, competition, prospects...).
 */
export const PRODUCT_CLIENT_TYPES = ["CAMPAIGN", "INTERNAL"] as const;
