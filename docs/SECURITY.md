# MediKiosk security notes

## Authentication and authorisation

- Staff JWTs (signed, expiring) carry tenant + roles; `requireStaff` resolves the user row
  (tenant-scoped, active) and checks a **permission**, never a role name, per endpoint.
- Kiosk sessions are short-lived bearer tokens bound to one session; cross-session and
  cross-tenant reads return 404, never 403-with-existence.
- `ADMIN`/`SUPER_ADMIN` hold aggregate permissions only — no `patient.read`, `summary.read`
  or `evidence.read` (tested: admin case/summary access is 403).
- Login is rate-limited (5/min); passwords are hashed with a pepper; production refuses to
  boot on development-default secrets.

## Data protection

- PHI-free by construction: audit `detailJson` carries codes/counts only; the logger scrubs
  PHI keys; error envelopes never include PHI, SQL or stack traces.
- Kiosk privacy: inactivity warning → session wipe (server purges challenges, replay buffers
  and OCR text; patients and audit retained) → welcome screen. Tested in journey E.
- Uploads: size cap (`DOCUMENT_MAX_UPLOAD_MB`), MIME + extension allowlists, executable
  extensions refused regardless of claimed MIME, content-addressed storage names
  (`<sha256>.<ext>`), no path traversal (join from two trusted parts only).

## Secrets and supply chain

- `.env` is gitignored; `.env.example` carries no real secrets. No secrets are committed.
- Console tokens live in `sessionStorage` (tab-close ends the session); kiosk device tokens
  stay in memory only.

## Known gaps (see LIMITATIONS.md)

TLS termination, Postgres hardening, ABDM/ABHA verification, DPDPA review and penetration
testing are all outstanding. This prototype must not touch real patient data without a
security, privacy, legal and clinical-governance review.
