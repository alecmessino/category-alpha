"""The best-track status vocabulary -- ONE definition, importable without pyarrow.

These sets decide what counts as genesis: the archive's genesis is the FIRST TROPICAL POINT,
so the answer depends entirely on which status codes are called tropical. They lived in
schema.py, which imports pyarrow, and the operational b-deck reader needs the same vocabulary
while staying a plain-stdlib parser that can be exercised without the archive's dependencies.

Restating the sets in the second module was the obvious alternative and the wrong one: two
copies of a definition this load-bearing drift, and when they do, the archive and the
operational fallback would each be internally consistent while quietly meaning different
things by the same word. schema.py re-exports these, so every existing import still resolves.
"""

# Status codes that count as "a tropical cyclone existed here".
TROPICAL_STATUS = {"TD", "TS", "HU", "TY", "ST", "TC", "HR"}
# Codes that are explicitly NOT a tropical cyclone: disturbance, low, extratropical,
# subtropical, wave. Kept separate because genesis is defined as the first TROPICAL point.
NONTROPICAL_STATUS = {"DB", "LO", "EX", "SD", "SS", "WV", "MD", "IN", "DS", "ET", "NR", "PT"}
