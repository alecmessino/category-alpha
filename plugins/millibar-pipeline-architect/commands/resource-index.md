---
description: Print the Resource Master List — all 4 clusters, endpoints, auth, cadence, format.
argument-hint: "[cluster number | resource name, e.g. 1 or ndbc]"
allowed-tools: Read, Grep, Glob
---

Print the Resource Master List index.

Read `${CLAUDE_PLUGIN_ROOT}/skills/data-pipeline-integration/references/resource-master-list.md`.

Argument: `$1`

- **No argument** — print all four cluster tables plus the "Already wired in this repo"
  table, so the developer can see at a glance what exists and what is still to build.
- **A cluster number (1–4)** — print only that cluster's table, then read and summarize
  the matching `cluster-N-*.md` reference: transport, auth, cadence, and the failure-mode
  table.
- **A resource name** (`goes`, `gibs`, `nhc`, `tsr`, `ecmwf`, `gribstream`, `thredds`,
  `cmems`, `cimss`, `ndbc`, `kalshi`, `adsb`, `eia`) — state which cluster it belongs to,
  print its row, then give the concrete first call: the AWS CLI statement, the curl, or
  the Python snippet that gets one real record out of it.

Then check whether the repo already reads it. Grep `scripts/` and `docs/app/` for the
endpoint host before suggesting anything new — this project already ingests NHC/ATCF,
TGFTP recon, NOMADS GFS, Kalshi, Polymarket, CPC ONI and NASA GIBS, and a second reader
for a feed that already has one is a defect, not a feature.

End with the routing question: which endpoint or bucket are we implementing next?
