export type Difficulty = 1 | 2 | 3 | 4;

export type Stage =
  | 'OFFICE_RECEIVED'
  | 'RS_RECEIVED'
  | 'UNIT_RECEIVED'
  | 'INTERNAL_WORK'
  | 'IH_WAIT_RS_ACCEPT'
  | 'IH_WAIT_SEND'
  | 'IH_WAIT_RECEIVE'
  | 'IH_ASSESS'
  | 'IH_WORK'
  | 'IH_SUBMITTED'
  | 'UNIT_REVIEW_IH'
  | 'RETURN_WAIT_RS_ACCEPT'
  | 'RETURN_RS_RECEIVED'
  | 'SENT_TO_SAFETY'
  | 'CLOSED';

export type WorkEventType =
  | 'CREATED'
  | 'RECEIVED'
  | 'SENT'
  | 'ASSESSED'
  | 'IH_ASSIGNED'
  | 'IH_SUBMITTED'
  | 'REVISION_REQUESTED'
  | 'CLOSED'
  | 'NOTE';

export interface WorkEvent {
  id: string;
  type: WorkEventType;
  label: string;
  at: string;
  actor?: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface DifficultyAssessment {
  level: Difficulty;
  assessedAt: string;
  assessedBy: string;
  reason?: string;
}

export interface WorkOrder {
  id: string;
  referenceNo: string;
  sourceAgency: string;
  subject: string;
  location: string;
  routeTeam: string;
  ownerUnit: string;
  stage: Stage;
  currentCustodian: string;
  createdAt: string;
  initialAssessment?: DifficultyAssessment;
  ihAssessment?: DifficultyAssessment;
  officialDueAt?: string;
  ihDueAt?: string;
  ihRound: number;
  events: WorkEvent[];
}

export const DIFFICULTY_RULES: Record<Difficulty, { label: string; targetDays: number }> = {
  1: { label: 'ง่าย', targetDays: 7 },
  2: { label: 'ปานกลาง', targetDays: 21 },
  3: { label: 'ยาก', targetDays: 30 },
  4: { label: 'ซับซ้อนมาก', targetDays: 60 },
};

export const ROUTE_TEAMS = ['รส.สบ.1', 'รส.สบ.2', 'รส.สบ.3', 'รส.สบ.4'];

export const OWNER_UNITS = [
  'วทบ.1', 'วทบ.2', 'วทบ.3', 'วทบ.4', 'วทบ.5',
  'วคบ.1', 'วคบ.2', 'วคบ.3', 'วคบ.4', 'ผปบ.',
  'วมบ.', 'ชรบ.', 'อมบ.', 'ผถบ.',
];

export const STAGE_LABELS: Record<Stage, string> = {
  OFFICE_RECEIVED: 'สำนักสำรวจและออกแบบรับเรื่อง',
  RS_RECEIVED: 'รส.สบ. รับเรื่อง',
  UNIT_RECEIVED: 'หน่วยเจ้าของงานรับเรื่อง',
  INTERNAL_WORK: 'หน่วยเจ้าของงานดำเนินการ',
  IH_WAIT_RS_ACCEPT: 'รอ รส.สบ. รับเรื่องเพื่อส่ง IH',
  IH_WAIT_SEND: 'รอ รส.สบ. ส่งให้ IH',
  IH_WAIT_RECEIVE: 'รอ IH รับงาน',
  IH_ASSESS: 'IH ประเมินความยาก',
  IH_WORK: 'IH ดำเนินการ',
  IH_SUBMITTED: 'IH ส่งงานกลับหน่วย',
  UNIT_REVIEW_IH: 'หน่วยเจ้าของงานตรวจงาน IH',
  RETURN_WAIT_RS_ACCEPT: 'รอ รส.สบ. รับงานกลับ',
  RETURN_RS_RECEIVED: 'รส.สบ. รับงานกลับแล้ว',
  SENT_TO_SAFETY: 'ส่งกลับสำนักปลอดภัยแล้ว',
  CLOSED: 'ปิดงาน',
};

export function addCalendarDays(dateIso: string, days: number) {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysBetween(fromIso: string, toIso = new Date().toISOString()) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

export function getStageEnteredAt(order: WorkOrder) {
  return order.events[order.events.length - 1]?.at ?? order.createdAt;
}

export function isClosed(order: WorkOrder) {
  return order.stage === 'CLOSED';
}

export function isOverdue(order: WorkOrder) {
  return Boolean(order.officialDueAt && !isClosed(order) && new Date(order.officialDueAt) < new Date());
}

export function daysUntil(dateIso?: string) {
  if (!dateIso) return null;
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / 86_400_000);
}

export function formatThaiDate(dateIso?: string) {
  if (!dateIso) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(dateIso));
}
