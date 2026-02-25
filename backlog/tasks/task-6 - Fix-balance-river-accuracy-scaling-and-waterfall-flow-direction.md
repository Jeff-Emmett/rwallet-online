---
id: TASK-6
title: 'Fix balance river accuracy, scaling, and waterfall flow direction'
status: Done
assignee:
  - '@claude'
created_date: '2026-02-18 19:54'
labels:
  - fix
  - visualization
  - blockchain
dependencies: []
references:
  - js/safe-api.js
  - wallet-timeline-visualization.html
  - js/data-transform.js
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fixed three issues with the wallet balance river visualization:

1. **Transaction accuracy** — Switched `fetchChainData` from separate `getAllMultisigTransactions` + `getAllIncomingTransfers` endpoints to the unified `getAllTransactions` endpoint. This returns enriched `transfers[]` arrays with proper `tokenInfo` including correct decimals (e.g., USDC=6 decimals, not hardcoded 18). Eliminates the inaccurate `dataDecoded` fallback parsing.

2. **Flow scaling** — Flow widths are now sankey-proportional: each waterfall's width at the river is proportional to `tx.usd / balance`, so flows visually represent their share of the river. Far ends taper to 30% for dramatic effect.

3. **Waterfall direction** — Inflows now flow diagonally from upper-left down-right into the river (like a tributary waterfall). Outflows flow diagonally from the river down-right away (like water cascading off). Gradients updated to diagonal to follow flow direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ERC20 token amounts use correct decimals from tokenInfo
- [ ] #2 Flow widths are proportional to their share of the river balance
- [ ] #3 Inflows flow diagonally down-right into the river from above-left
- [ ] #4 Outflows flow diagonally down-right away from the river below
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Committed and pushed to main as `f197a20`. Changes span `js/safe-api.js` (all-transactions endpoint, sequential rate-limited fetching) and `wallet-timeline-visualization.html` (diagonal bezier waterfall paths, proportional widths, diagonal gradients). Resolved merge conflict with upstream `eb5f93e` that had introduced sankey-proportional widths and sequential API calls — merged both improvements together.
<!-- SECTION:FINAL_SUMMARY:END -->
