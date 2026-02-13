---
id: task-2
title: Transform into generalized rWallet.online platform
status: Done
assignee: []
created_date: '2026-02-13 10:34'
updated_date: '2026-02-13 10:34'
labels:
  - feature
  - frontend
  - deployment
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace hardcoded single-wallet static site with a dynamic platform that can explore any Safe multi-sig wallet across 7 chains via live Safe Global API data. New homepage with democratic wallet management messaging, interactive visualizations for group treasury management.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 js/safe-api.js - Browser-side Safe Transaction Service API client for 7 chains
- [x] #2 js/data-transform.js - API response to D3 visualization transforms
- [x] #3 js/router.js - URL-based state management and shared address bar
- [x] #4 index.html - Rich homepage with wallet input, ELI5, viz cards, demo CTA
- [x] #5 wallet-visualization.html - Dynamic single-chain Sankey from live data
- [x] #6 wallet-timeline-visualization.html - Dynamic Balance River from live data
- [x] #7 wallet-multichain-visualization.html - Dynamic multi-chain flow from live data
- [x] #8 Dockerfile copies js/ directory alongside HTML files
- [x] #9 docker-compose.yml adds rwallet.online domain to Traefik routing
- [x] #10 Deployed and live on server
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed as d0c75ab, pushed to Gitea + GitHub, deployed on Netcup RS 8000
<!-- SECTION:NOTES:END -->
