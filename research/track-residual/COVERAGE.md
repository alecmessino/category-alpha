# Track residual — historical coverage

_Measured 2026-09-07T21:21:45.399Z by `scripts/residual-coverage.mjs`. Two public indexes per season, counted._

**What CP/EP material exists to backtest a track residual on, from live-available products, 2015 forward?**

| Season | Decks | Messages | Scoreable as lead | EP storms | EP f-decks | EP w/ intermediates | CP storms | CP f-decks |
|---|---|---|---|---|---|---|---|---|
| 2015 | PRESENT | PRESENT | yes | 22 | 22 | 6 | 9 | 9 |
| 2016 | PRESENT | PRESENT | yes | 22 | 22 | 5 | 1 | 1 |
| 2017 | PRESENT | PRESENT | yes | 20 | 20 | 8 | 0 | 0 |
| 2018 | PRESENT | PRESENT | yes | 25 | 25 | 8 | 1 | 1 |
| 2019 | PRESENT | PRESENT | yes | 21 | 21 | 4 | 0 | 0 |
| 2020 | PRESENT | PRESENT | yes | 21 | 21 | 2 | 0 | 0 |
| 2021 | PRESENT | PRESENT | yes | 19 | 19 | 6 | 0 | 0 |
| 2022 | PRESENT | PRESENT | yes | 19 | 19 | 9 | 0 | 0 |
| 2023 | PRESENT | PRESENT | yes | 20 | 20 | 7 | 0 | 0 |
| 2024 | PRESENT | PRESENT | yes | 14 | 14 | 3 | 1 | 1 |
| 2025 | PRESENT | PRESENT | yes | 18 | 18 | 7 | 2 | 2 |
| 2026 | ABSENT (HTTP 404) | ABSENT (HTTP 404) | **no** | – | – | – | – | – |

**EP** — 221 storms across the window, 221 with a fix deck, 65 with intermediate advisories, 221 in seasons where first-availability can be established.
**CP** — 14 storms across the window, 14 with a fix deck, 0 with intermediate advisories, 14 in seasons where first-availability can be established.

## What is missing

- The current season has no archived messages/ index — it is written after the season, so first-availability for a live storm must come from the live adv/ directory instead, which is a different shape and is not retained historically.
- An f-deck's presence is not a guarantee of fix DENSITY. Eastern Pacific storms are rarely flown, so many f-decks hold satellite fixes only — one upstream platform, hence one independent group, hence INSUFFICIENT_SAMPLE under this module's own gate.
- Receipt time at THIS pipeline does not exist for any historical storm. Every historical residual therefore carries an explicit availability assumption.
- The cp NN basin id undercounts Central Pacific activity: a storm that forms in the eastern Pacific and crosses 140W keeps its EP id for life. Lowell (EP122026) was written by CPHC in Honolulu and counts as EP here. A basin stratum built on the id is a stratum on where a storm FORMED, not on who forecast it.
- Central Pacific seasons are small. A CP-only stratum will usually be too thin to score, and the honest output there is a base rate and a refusal.
