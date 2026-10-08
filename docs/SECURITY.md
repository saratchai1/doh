# Security model

## Authentication

- Passwords are stored as Node.js `scrypt` hashes with per-user random salts.
- Browser sessions use 256-bit random opaque tokens.
- Only a SHA-256 hash of the session token is stored in PostgreSQL.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and can be forced `Secure` with `SECURE_COOKIE=true`.
- Write requests can enforce an exact browser origin with `APP_ORIGIN`.

## Roles

| Role | Read | Internal workflow | IH workflow | User administration |
| --- | --- | --- | --- | --- |
| VIEWER | Yes | No | No | No |
| STAFF | Yes | Yes | No | No |
| MANAGER | Yes | Yes | No | No |
| IH | Yes | No | Receive / assess / submit IH work | No |
| ADMIN | Yes | Yes | Yes | CLI/bootstrap |

All authenticated users can read Work Orders in the MVP. This matches the initial operating assumption; narrower project/unit scopes can be added later.

## Audit

Each workflow mutation writes:
- an immutable workflow event for the case timeline, and
- an `audit_log` record containing actor, action, work order and transition details.

Workflow writes lock the Work Order row in PostgreSQL before validating the next transition. Two users cannot validly advance the same stale stage twice.

## Production checklist

Before an internet-facing deployment:
- set `NODE_ENV=production`,
- set HTTPS at the reverse proxy and `SECURE_COOKIE=true`,
- set the exact HTTPS `APP_ORIGIN`,
- use a long random PostgreSQL password,
- do not keep `BOOTSTRAP_ADMIN_PASSWORD` in a long-lived environment after initial setup,
- place the database on a private network,
- back up PostgreSQL,
- add rate limiting / WAF controls at the ingress,
- integrate the organization's identity provider when available.
