// Service-worker entry point — Publish by Gershon.AI (extension 0.1.0).
//
// Publish's OWN extension (three-platform split, 2026-10-26). It only
// publishes: every minute it asks publish.gershon.ai for the next due post and
// publishes it on the company LinkedIn page / X account, in its own minimized
// window. It never collects posts — Social's extension does that.
//
// Order matters: gx-token.js wraps fetch (adds the workspace token to calls to
// publish.gershon.ai), so it runs before anything that fetches. gx-update.js
// last, so it sees gx-publish.js's "busy" flag.
importScripts("gx-token.js", "background.js", "gx-publish.js", "gx-update.js");
