/* PAGE COUNT FROM THE BYTES, WITH NO PDF LIBRARY.
 *
 * "One PDF, one page" is the outbound rule, so the count has to be asserted on the artifact that
 * is actually sent, not inferred from an in-browser height measurement that was taken before the
 * print pipeline ran. No pdf toolchain is installable in this container (pypdf's crypto backend
 * does not build here), and the count does not need one: a page tree's root node carries /Count,
 * and every page object is /Type /Page. Both are read and they must agree -- a disagreement means
 * the file is not shaped the way this reader assumes, which is reported rather than guessed past.
 */
import { readFileSync } from "node:fs";

export function pdfPageCount(path) {
  const buf = readFileSync(path);
  const s = buf.toString("latin1");
  /* /Type /Page but not /Pages, and not /PageLabels etc. */
  const objs = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  /* The page-tree root's own /Count. Several may appear in nested trees; the largest is the root. */
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const declared = counts.length ? Math.max(...counts) : null;
  return { objs, declared, bytes: buf.length, agree: declared !== null && declared === objs };
}

if (process.argv[1] && process.argv[1].endsWith("pdf-pagecount.mjs")) {
  for (const p of process.argv.slice(2)) {
    const r = pdfPageCount(p);
    console.log(`${r.agree ? "ok  " : "??  "} ${String(r.objs).padStart(3)} page(s) `
      + `(declared ${r.declared})  ${(r.bytes / 1024).toFixed(0)} KB  ${p}`);
  }
}
