import {
  DIFFICULTY_RULES,
  Difficulty,
  Stage,
  WorkEvent,
  WorkOrder,
  addCalendarDays,
} from './domain';

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pushEvent(order: WorkOrder, event: Omit<WorkEvent, 'id' | 'at'> & { at?: string }) {
  return {
    ...order,
    events: [...order.events, { ...event, id: uid('event'), at: event.at ?? new Date().toISOString() }],
  };
}

function transition(order: WorkOrder, stage: Stage, custodian: string, label: string, type: WorkEvent['type'] = 'SENT') {
  const withEvent = pushEvent(order, { type, label, actor: order.currentCustodian, to: custodian });
  return { ...withEvent, stage, currentCustodian: custodian };
}

export function performTransition(order: WorkOrder, action: string): WorkOrder {
  switch (action) {
    case 'RS_ACCEPT':
      return transition(order, 'RS_RECEIVED', order.routeTeam, `${order.routeTeam} รับเรื่อง`, 'RECEIVED');
    case 'UNIT_ACCEPT':
      return transition(order, 'UNIT_RECEIVED', order.ownerUnit, `${order.ownerUnit} รับเรื่อง`, 'RECEIVED');
    case 'INTERNAL_DONE':
      return transition(order, 'RETURN_WAIT_RS_ACCEPT', order.routeTeam, `${order.ownerUnit} ดำเนินการเสร็จและส่งออก`, 'SENT');
    case 'SEND_TO_IH':
      return transition(order, 'IH_WAIT_RS_ACCEPT', order.routeTeam, `${order.ownerUnit} ส่งงานออกเพื่อให้ IH ดำเนินการ`, 'IH_ASSIGNED');
    case 'RS_ACCEPT_IH':
      return transition(order, 'IH_WAIT_SEND', order.routeTeam, `${order.routeTeam} รับเรื่องสำหรับส่งต่อ IH`, 'RECEIVED');
    case 'RS_SEND_IH':
      return transition(order, 'IH_WAIT_RECEIVE', 'In-house Consultant', `${order.routeTeam} ส่งงานให้ IH`, 'SENT');
    case 'IH_ACCEPT':
      return transition(order, 'IH_ASSESS', 'In-house Consultant', 'IH รับงานจริง', 'RECEIVED');
    case 'IH_DONE':
      return transition(order, 'IH_SUBMITTED', order.ownerUnit, `IH ส่งงานกลับ ${order.ownerUnit}`, 'IH_SUBMITTED');
    case 'UNIT_ACCEPT_IH':
      return transition(order, 'UNIT_REVIEW_IH', order.ownerUnit, `${order.ownerUnit} รับงานจาก IH เพื่อตรวจ`, 'RECEIVED');
    case 'IH_REVISION': {
      const revised = transition(order, 'IH_WORK', 'In-house Consultant', `${order.ownerUnit} ส่งกลับ IH เพื่อแก้ไขรอบ ${order.ihRound + 1}`, 'REVISION_REQUESTED');
      return { ...revised, ihRound: order.ihRound + 1 };
    }
    case 'UNIT_APPROVE_IH':
      return transition(order, 'RETURN_WAIT_RS_ACCEPT', order.routeTeam, `${order.ownerUnit} ตรวจรับงาน IH และส่งออก`, 'SENT');
    case 'RS_ACCEPT_RETURN':
      return transition(order, 'RETURN_RS_RECEIVED', order.routeTeam, `${order.routeTeam} รับงานกลับ`, 'RECEIVED');
    case 'SEND_SAFETY':
      return transition(order, 'SENT_TO_SAFETY', order.sourceAgency, `${order.routeTeam} ส่งกลับ ${order.sourceAgency}`, 'SENT');
    case 'CLOSE':
      return transition(order, 'CLOSED', 'ปิดงาน', 'ยืนยันรับและปิดงาน', 'CLOSED');
    default:
      return order;
  }
}

export function applyAssessment(order: WorkOrder, level: Difficulty, reason: string, kind: 'INITIAL' | 'IH'): WorkOrder {
  const now = new Date().toISOString();
  const rule = DIFFICULTY_RULES[level];
  const withEvent = pushEvent(order, {
    type: 'ASSESSED',
    label: `${kind === 'IH' ? 'IH ' : ''}ประเมินระดับ ${level} — ${rule.label}`,
    actor: kind === 'IH' ? 'In-house Consultant' : order.ownerUnit,
    note: reason || undefined,
    at: now,
  });

  if (kind === 'INITIAL') {
    return {
      ...withEvent,
      stage: 'INTERNAL_WORK',
      currentCustodian: order.ownerUnit,
      initialAssessment: { level, assessedAt: now, assessedBy: order.ownerUnit, reason: reason || undefined },
      officialDueAt: addCalendarDays(now, rule.targetDays),
    };
  }

  return {
    ...withEvent,
    stage: 'IH_WORK',
    currentCustodian: 'In-house Consultant',
    ihAssessment: { level, assessedAt: now, assessedBy: 'In-house Consultant', reason: reason || undefined },
    ihDueAt: addCalendarDays(now, rule.targetDays),
    ihRound: Math.max(1, order.ihRound),
  };
}
