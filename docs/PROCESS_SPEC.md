# DOH Work Order Tracking — Process Specification (MVP)

## Objective

Track every request from the safety bureau as one Work Order so management can see:

- current stage and current custodian,
- time spent in the current stage,
- full send/receive timeline,
- initial difficulty and IH re-assessment,
- official target date and IH operational target date,
- where queue / handoff delay occurs.

## Workflow

1. Office receives request.
2. Relevant `รส.สบ.1–4` accepts the request.
3. Owner unit accepts the request.
4. Owner unit assesses difficulty Level 1–4.
5. Owner unit either:
   - completes the work internally, or
   - sends the same Work Order through the IH branch.
6. IH branch:
   - owner unit sends out for IH,
   - route team accepts,
   - route team sends to IH,
   - IH receives the work,
   - IH performs a separate difficulty assessment,
   - IH completes and returns the work,
   - owner unit reviews and either accepts or returns it for another IH revision round.
7. Owner unit sends the completed work back to the route team.
8. Route team accepts and returns it to the source agency.
9. Confirmation closes the Work Order.

## Difficulty targets

- Level 1 — 7 days
- Level 2 — 21 days
- Level 3 — 30 days
- Level 4 — 60 days

MVP uses calendar days. This is intentionally isolated as policy/configuration and must be confirmed before production.

## Important production decisions still to lock

- calendar days vs. business days,
- official SLA start timestamp,
- whether official SLA pauses or resets when routed to IH,
- pause states for waiting on external information,
- source-of-truth organizational master,
- exact closure rule: sent date vs. source-agency acknowledgement,
- authentication / permission model,
- integration with e-Saraban or other official document systems.
