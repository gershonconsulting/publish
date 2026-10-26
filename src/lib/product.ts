/** Which of the three Gershon platforms this build is. */
export const PRODUCT_NAME = "Publish";
export const PRODUCT_HOME = "/publishing";
export const PRODUCT_TAGLINE = "Create, approve, schedule and publish";
export const PRODUCT_VERSION = "0.2.0";

/**
 * Company categories this product serves (Olivier, 2026-10-26): Publish and
 * Social Tracking are for our CAMPAIGN clients and INTERNAL (Gershon) only.
 * Social keeps the whole ecosystem (partners, competition, prospects...).
 */
export const PRODUCT_CLIENT_TYPES = ["CAMPAIGN", "INTERNAL"] as const;
