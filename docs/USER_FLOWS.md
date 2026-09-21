# MediKiosk user flows

## Patient (kiosk)

```
Welcome → Language (en/hi/mr) → Identity (guest / OTP / QR / returning)
  → Granular consent (receipt; decline exits) → Chief complaint (+ speech)
  → Adaptive interview (engine-selected; Unknown/Skip/Decline always offered)
  → Health details hub (history · medicines · allergies · vitals · documents — all skippable)
  → Review (complete assembled record) → Confirm → Submit
  → Queue token (A-042) + priority + instructions
```

- Inactivity: warning, then session wipe and reset to welcome (`session-policy.ts`;
  `?idle=N` shortens it for demonstration).
- Expiry/revocation at any point returns to a clean state; transient artifacts are purged
  server-side (`POST /kiosk/sessions/:id/wipe`).

## Doctor (console, dr.rao)

```
Sign in → Queue (EMERGENCY-first, live waiting minutes)
  → Open case: reported / system-generated / longitudinal / doctor-authored blocks
  → Verify/reject/edit extracted evidence → Add notes → Record diagnosis
  → Set disposition → Complete encounter (queue completes with it)
```

Supporting flows: patient search → record → grouped timeline → pairwise compare;
FHIR demo export per case.

## Administrator (console, admin.patil)

Overview (live counts, demo data labelled) → fleet (Online/Offline/Maintenance derived from
`lastSeenAt`) → audit log (filterable, PHI-free) → system health (DB, storage, MOCKED
document processor). The ADMIN role holds no clinical read permission by construction.

## Document flow (shared)

```
Upload (validated, content-addressed) → mock-OCR extract → entities + evidence
  → Patient confirms (fact rows materialise as DOCUMENT_DERIVED/UNVERIFIED)
  → Doctor verifies (fact rows VERIFIED) / rejects (fact rows removed)
    / edits (superseding evidence + entity, fact row corrected)
```

Unrecognised bytes extract to zero entities with an explicit issue — never fabricated text.
