---
id: task-4
title: Fix 429 rate limiting on Safe API requests
status: Done
assignee: []
created_date: '2026-02-13 14:08'
labels:
  - bugfix
  - api
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Safe Transaction Service API was returning 429 errors when checking all 7 chains in parallel. Added retry with exponential backoff (up to 4 retries, 1s/2s/4s/8s delays) and staggered chain detection (150ms gaps) and data fetching (200ms gaps) to avoid rate limits.
<!-- SECTION:DESCRIPTION:END -->
