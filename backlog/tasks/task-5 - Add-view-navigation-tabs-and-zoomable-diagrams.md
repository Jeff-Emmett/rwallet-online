---
id: task-5
title: Add view navigation tabs and zoomable diagrams
status: Done
assignee:
  - '@claude'
created_date: '2026-02-13 15:49'
updated_date: '2026-02-13 15:49'
labels:
  - feature
  - UX
  - d3
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Added inter-visualization navigation and zoom/pan to rWallet.online diagrams.

**View Navigation:** Added tab bar below the address input on all 3 visualization pages (Multi-Chain Flow, Balance River, Single-Chain Sankey). Tabs preserve the current wallet address via URL params so users can switch views without re-entering the address. Active tab is highlighted. Tab links update dynamically when a new wallet is loaded.

**Zoomable Sankey (wallet-visualization.html):** Wrapped all Sankey content in a d3 zoom group. Users can scroll to zoom in/out and drag to pan. Reset View button returns to default. Scale extent 0.3x–5x.

**Zoomable Multi-Chain Flow (wallet-multichain-visualization.html):** Same zoom/pan pattern applied to the bezier flow chart. Scroll to zoom, drag to pan, Reset View button.

**Files modified:** js/router.js, wallet-visualization.html, wallet-multichain-visualization.html, wallet-timeline-visualization.html (cache bump only).

Commit: c02fa26 — pushed to Gitea + GitHub, deployed to production.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 View nav tabs appear on all 3 visualization pages
- [x] #2 Tabs preserve wallet address when switching views
- [x] #3 Active tab highlighted for current page
- [x] #4 Sankey diagram supports scroll-to-zoom and drag-to-pan
- [x] #5 Multi-chain flow chart supports scroll-to-zoom and drag-to-pan
- [x] #6 Reset View button resets zoom to default on both charts
- [x] #7 Balance River existing zoom still works
- [x] #8 Tab links update when new wallet address is entered
- [x] #9 Cache busted to v=5 for router.js on all pages
- [x] #10 Deployed to production at rwallet.online
<!-- AC:END -->
