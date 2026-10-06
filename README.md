# DOH Work Tracking

MVP/prototype for the **Bureau of Location and Design, Department of Highways** to track safety-related design work orders from intake through internal execution or In-house Consultant (IH) execution and final return.

## What is implemented

- Command dashboard: open, overdue, due-soon, handoff queue, IH-active counts.
- One Work Order = one case with one auditable timeline.
- Explicit current stage and current custodian.
- Internal-work path and IH path in the same case.
- Initial Level 1–4 assessment and separate IH re-assessment.
- Target rules: 7 / 21 / 30 / 60 days.
- IH revision rounds without losing earlier history.
- Stage-age / bottleneck view.
- Create new Work Order.
- CSV export.
- Local persistence in `localStorage` for prototype/UAT.
- Responsive Thai-language UI using DOH-style navy/yellow colors.

## Run locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Prototype scope

This branch intentionally has **no backend and no authentication yet**. Data is stored in the browser for process validation first. Before production, move the same domain model to a server/API + persistent database and add permissions/audit identity.

See [`docs/PROCESS_SPEC.md`](docs/PROCESS_SPEC.md) for the workflow and unresolved policy decisions.
