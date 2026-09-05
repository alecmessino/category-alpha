/** Presentation priority over published rows. No statistical predicates or arithmetic. */
export function principal(rows, outContract) {
  if (!outContract) return { row: null, branch: "open", rule: "The answer is the schedule of outcomes below." };
  const index = rows.findIndex(row => row.contractKey === outContract);
  const named = rows[index];
  if (!named) return { row: null, branch: "missing", rule: "This question has no published principal outcome." };
  if (!named.refusalKind && named.cell?.rate != null)
    return { row: named, branch: "named", rule: "Principal: the outcome named in the question." };
  if (named.refusalKind === "CONDITIONED_ON" && named.key.startsWith("int:")) {
    const next = rows.slice(index + 1).find(row => row.key.startsWith("int:") && !row.refusalKind && row.cell?.rate != null);
    if (next) return { row: next, branch: "above", rule: `The named threshold is conditioned on. Principal: the first published threshold above ${named.label.toLowerCase()}.` };
    return { row: null, branch: "ceiling", rule: "The named threshold is conditioned on; no higher intensity threshold publishes a rate." };
  }
  return { row: null, branch: "refused", rule: "The named outcome is refused. Its count and status remain in the schedule." };
}
