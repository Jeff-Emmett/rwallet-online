# rWallet — Treasury & Economics

**Module ID:** `rwallet`
**Domain:** `rwallet.online`
**Version:** 0.1.0
**Framework:** Static HTML/JS (Vanilla) — no server
**Status:** Draft

## Purpose

Multichain wallet visualization and treasury management. Currently static frontend showing token holdings, Safe multisig balances, and flow diagrams. Future: Gnosis Safe integration for collaborative treasury governance.

## Data Model

Client-side only. Reads from blockchain APIs (Safe API, Etherscan, etc.).

## Permission Model

| Capability | Required SpaceRole | Description |
|-----------|-------------------|-------------|
| `view_treasury` | VIEWER | See wallet balances and flows |
| `propose_transaction` | PARTICIPANT | Propose Safe transactions |
| `approve_transaction` | PARTICIPANT | Sign/approve multisig txns |
| `configure_treasury` | ADMIN | Add/remove Safe signers, change thresholds |

**Current Auth:** None. Smart contract permissions govern on-chain actions.

## Canvas Integration

Shape types:
- **`folk-token-mint`**: Token issuance widget
- **`folk-token-ledger`**: Token distribution visualization

## Migration Plan

1. Add EncryptID for identity linking (DID ↔ wallet address)
2. Space-level permissions for treasury dashboard access
3. On-chain permissions remain contract-governed
