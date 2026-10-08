# DOH Work Order Tracking

ระบบติดตามงานของ **สำนักสำรวจและออกแบบ กรมทางหลวง** สำหรับติดตามเรื่องที่รับจากสำนักอำนวยความปลอดภัย ตั้งแต่รับเรื่อง → รส.สบ. → หน่วยเจ้าของงาน → ทำเองหรือส่ง In-house Consultant (IH) → ตรวจรับ → ส่งกลับ → ปิดงาน

## Core rule

**หนึ่งเรื่อง = หนึ่ง Work Order ตลอด lifecycle**

การส่งให้ IH ไม่สร้างรายการซ้ำ แต่เพิ่ม event และการประเมิน IH เข้าไปใน Work Order เดิม จึงตอบได้ว่า:
- ตอนนี้งานอยู่ที่ใคร
- อยู่ขั้นตอนไหน
- ค้างขั้นตอนนี้กี่วัน
- กำหนดเสร็จเมื่อไร
- ช่วงใดเป็น bottleneck
- กรมประเมินความยากเท่าไร และ IH ประเมินเท่าไร
- ใครส่ง/รับ/เปลี่ยนสถานะเมื่อไร

## Current implementation

### Frontend
- React + TypeScript + Vite
- Thai-language dashboard
- Search / stage / custodian filters
- SLA and overdue indicators
- full Work Order Timeline
- internal and IH workflow actions
- CSV export
- responsive desktop/tablet/mobile UI

### Backend
- Node.js HTTP API
- PostgreSQL persistence
- automatic SQL migrations at startup
- session authentication with HttpOnly cookies
- scrypt password hashing
- role-based writes: ADMIN / MANAGER / STAFF / IH / VIEWER
- row-locked workflow transitions
- audit log for mutations
- organization master data stored in PostgreSQL

### Current SLA assumption
- Level 1 = 7 calendar days
- Level 2 = 21 calendar days
- Level 3 = 30 calendar days
- Level 4 = 60 calendar days

This is isolated as a policy assumption and still requires DOH confirmation before production.

## Quick start with Docker

```bash
cp .env.example .env
# edit .env and replace both passwords
docker compose up --build
```

Open:

```text
http://localhost:8080
```

The first admin is created only when both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are supplied.

## Create additional users

```bash
docker compose exec app npm run user:create -- \
  --email staff@example.go.th \
  --password "use-a-long-password" \
  --role STAFF \
  --name "เจ้าหน้าที่ วทบ.2" \
  --org-unit WTB.2
```

Available roles: `ADMIN`, `MANAGER`, `STAFF`, `IH`, `VIEWER`.

## Local development

Start PostgreSQL separately, set `DATABASE_URL`, then run:

```bash
npm install
npm run dev:api
```

In another terminal:

```bash
npm run dev:web
```

Vite proxies `/api` to port 8080.

## Tests

Pure workflow rules do not require PostgreSQL:

```bash
npm test
```

Full build:

```bash
npm run build
```

## Documentation

- [Process specification](docs/PROCESS_SPEC.md)
- [UAT scenarios](docs/UAT.md)
- [Security model](docs/SECURITY.md)

## Before production

Still requires policy sign-off on:
1. calendar days vs business days,
2. official SLA starting point,
3. SLA behavior while work is with IH,
4. pause / waiting states,
5. final organization master,
6. closure rule: sent date vs acknowledgement by the source agency,
7. integration with e-Saraban / DOH identity systems if required.
