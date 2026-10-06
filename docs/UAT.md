# UAT — DOH Work Order Tracking

## Setup

1. Copy `.env.example` to `.env`.
2. Replace both database and admin passwords.
3. Run `docker compose up --build`.
4. Open `http://localhost:8080`.
5. Sign in with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

The bootstrap password is only used to create the first admin if that email does not already exist.

## UAT 1 — Internal work path

1. Create a Work Order.
2. Confirm current stage = สำนักสำรวจและออกแบบรับเรื่อง.
3. Click the selected รส.สบ. receive action.
4. Click the owner unit receive action.
5. Assess Level 1–4 and enter a reason.
6. Confirm the official due date is created from 7 / 21 / 30 / 60 calendar days.
7. Select “หน่วยทำเสร็จและส่งออก”.
8. Route through รส.สบ. and send back to the source agency.
9. Confirm receipt and close.
10. Verify Timeline retains all timestamps and actors.

Expected: one Work Order ID is used for the complete lifecycle.

## UAT 2 — IH path

1. Create and route a Work Order to the owner unit.
2. Perform the initial difficulty assessment.
3. Select “ส่งให้ In-house Consultant”.
4. Complete รส.สบ. receive + send handoff.
5. Sign in as an IH-role account.
6. Confirm IH can receive the work and perform an independent Level 1–4 assessment.
7. Complete IH work and submit it to the owner unit.
8. Sign back in as an internal account.
9. Accept and review the IH result.
10. Send it back to IH for revision once, then submit again.
11. Confirm `ihRound` increments and old timeline events are still present.
12. Approve, return through รส.สบ., send to source, and close.

Expected: initial and IH assessments remain separate and the case is never duplicated.

## UAT 3 — Permission boundary

Create users with:

```bash
docker compose exec app npm run user:create -- --email staff@example.go.th --password "long-password-here" --role STAFF --name "เจ้าหน้าที่" --org-unit WTB.2
docker compose exec app npm run user:create -- --email ih@example.com --password "long-password-here" --role IH --name "IH Consultant"
docker compose exec app npm run user:create -- --email viewer@example.go.th --password "long-password-here" --role VIEWER --name "ผู้ดูอย่างเดียว"
```

Verify:
- STAFF/MANAGER can route and assess internal work.
- IH can only receive/assess/submit IH work.
- VIEWER can search, inspect Timeline, and export but cannot mutate.
- ADMIN can perform all actions.

## UAT 4 — Concurrency / stale action

Open the same Work Order in two browser sessions and perform the same next action twice.

Expected: the first request succeeds; the second is rejected with an invalid-transition message rather than creating duplicate workflow events.

## Policy decisions still not locked

Do not treat the current 7/21/30/60 implementation as final policy until DOH confirms:
- calendar days vs business days,
- official SLA start timestamp,
- whether the official SLA pauses/resets during IH work,
- pause states and external dependencies,
- final organization master,
- whether closure occurs on sent date or source-agency acknowledgement.
