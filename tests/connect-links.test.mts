import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/profile-links.ts";
const { xProfileUrl, liProfileUrl } = ((m as { default?: typeof m }).default ?? m) as typeof m;

test("X account links open the profile on x.com", () => {
  assert.equal(xProfileUrl("Amphasys"), "https://x.com/Amphasys");
  assert.equal(xProfileUrl("@alexrouleau"), "https://x.com/alexrouleau");
});
test("LinkedIn person links open linkedin.com/in/<slug>/", () => {
  assert.equal(liProfileUrl("mbernasconich"), "https://www.linkedin.com/in/mbernasconich/");
  assert.equal(liProfileUrl("in/alexandre-rouleau-7141544/"), "https://www.linkedin.com/in/alexandre-rouleau-7141544/");
});
