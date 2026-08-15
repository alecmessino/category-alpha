#!/usr/bin/env node
/* Tests for the one predicate that decides whether a verification run may write the
 * verdict the board reads.
 *
 * This file exists because the first version of that predicate was written inline and
 * silently disabled itself:
 *
 *     const IS_DEPLOYMENT = /^https:///i.test(BASE) && !isLoopback;
 *
 * Valid JavaScript. It parses as the regex /^https:/ followed by a // line comment, so the
 * test vanished and the constant became a truthy regex object — meaning every run,
 * including one against http://localhost:8099/, was free to overwrite the deployed verdict.
 * `node --check` passed it. A grep for the constant found it and it looked right.
 *
 * The failure was not the typo. The failure was verifying a guard by READING it. A guard
 * has to be made to fire, which is what the assertions below do.
 *
 * Run: node scripts/test-deploy-target.mjs
 */
import { isDeploymentUrl, reportFileFor } from "./lib/deploy-target.mjs";

let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

console.log("\n[1] the deployed site is a deployment");
eq("the real URL", isDeploymentUrl("https://alecmessino.github.io/category-alpha/"), true);
eq("any https host with a path", isDeploymentUrl("https://example.org/board/"), true);
eq("and it writes the canonical report", reportFileFor("https://alecmessino.github.io/category-alpha/"), "verify-live.json");

console.log("\n[2] a local serve is not, in every form a person actually types");
/* The exact URL that got a localhost verdict committed to main. */
eq("http://localhost:8099/", isDeploymentUrl("http://localhost:8099/"), false);
eq("http://127.0.0.1:8099/", isDeploymentUrl("http://127.0.0.1:8099/"), false);
eq("http://0.0.0.0:8099/", isDeploymentUrl("http://0.0.0.0:8099/"), false);
eq("the IPv6 loopback", isDeploymentUrl("http://[::1]:8099/"), false);
/* Loopback over TLS is still this machine. The https check must not rescue it. */
eq("https://localhost/ is still local", isDeploymentUrl("https://localhost/"), false);
eq("and https://127.0.0.1/ too", isDeploymentUrl("https://127.0.0.1/"), false);
/* Plain http anywhere is disqualifying — the real site is served over TLS, so an http
   target is either a local serve or something that has no business being called a
   deployment verdict. */
eq("plain http elsewhere is refused", isDeploymentUrl("http://example.com/"), false);

console.log("\n[3] and none of them can write the file the board reads");
for (const u of ["http://localhost:8099/", "http://127.0.0.1:8099/", "https://localhost/", "http://example.com/"]) {
  eq("local run writes its own file — " + u, reportFileFor(u), "verify-live.local.json");
}

console.log("\n[4] nonsense is not a deployment either");
/* The dangerous direction is defaulting to TRUE on something unrecognised, because that
   is the direction that lets an unknown target overwrite the deployed verdict. */
eq("empty", isDeploymentUrl(""), false);
eq("null", isDeploymentUrl(null), false);
eq("undefined", isDeploymentUrl(undefined), false);
eq("a bare hostname", isDeploymentUrl("alecmessino.github.io"), false);
eq("a file path", isDeploymentUrl("/docs/index.html"), false);
eq("https with no host", isDeploymentUrl("https://"), false);
eq("and every one of them keeps away from the canonical file",
   ["", null, "alecmessino.github.io", "https://"].map(reportFileFor),
   ["verify-live.local.json", "verify-live.local.json", "verify-live.local.json", "verify-live.local.json"]);

console.log(fail ? `\n${fail} FAILED\n` : "\nall deploy-target checks passed\n");
process.exit(fail ? 1 : 0);
