/* Is a verification run checking the DEPLOYED site, or rehearsing against a local serve?
 *
 * This is one predicate and it lives in its own file for one reason: the first version was
 * written inline and silently disabled itself.
 *
 *     const IS_DEPLOYMENT = /^https:///i.test(BASE) && !isLoopback;
 *
 * That is valid JavaScript. It parses as the regex /^https:/ followed by a // line
 * comment, so the whole test vanished and the constant became a truthy regex object.
 * `node --check` passed. A grep for the constant's name found it and looked right. The
 * guard was dead, and the only way to know was to run it and look at which file appeared.
 *
 * A guard that can fail silently is not a guard, so it is now a pure function with tests
 * around it. The lesson generalises past this file: verifying a safety check by reading
 * the code that implements it is not verifying it. You have to make it fire.
 *
 * WHY IT MATTERS. scripts/verify-live.mjs is deliberately runnable against a local serve —
 * that is what makes it a pre-flight rather than only a post-mortem. But it writes a report
 * the board reads to say whether the deployed site has been checked, and a local run's
 * report has exactly the same shape as a real one. One was committed during this build and
 * the deployed board reported a verdict produced against http://localhost:8099/.
 */

/* Loopback in the forms a person actually types. */
const LOOPBACK = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(:|\/|$)/i;

/* A deployment is served over HTTPS from somewhere that is not this machine. HTTP alone is
   disqualifying: GitHub Pages serves the real site over TLS, so a plain-http target is
   either a local serve or something this check has no business calling a deployment. */
export function isDeploymentUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (LOOPBACK.test(u)) return false;
  return /^https:\/\/[^/\s]+/i.test(u);
}

/* The canonical report is the one the board reads. A run that is not against a deployment
   can never write it — it gets its own filename, which is gitignored, so the mistake is
   structurally unavailable rather than merely discouraged. */
export function reportFileFor(url) {
  return isDeploymentUrl(url) ? "verify-live.json" : "verify-live.local.json";
}
