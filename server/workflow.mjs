export const TARGET_DAYS = { 1: 7, 2: 21, 3: 30, 4: 60 };

const INTERNAL_ROLES = new Set(['ADMIN','MANAGER','STAFF']);
const IH_ROLES = new Set(['ADMIN','IH']);

export function canCreate(role) {
  return INTERNAL_ROLES.has(role);
}

export function canAssess(role, kind) {
  return kind === 'IH' ? IH_ROLES.has(role) : INTERNAL_ROLES.has(role);
}

export function canTransition(role, action) {
  const ihActions = new Set(['IH_ACCEPT','IH_DONE']);
  if (ihActions.has(action)) return IH_ROLES.has(role);
  return INTERNAL_ROLES.has(role);
}

export function transitionSpec(stage, action, order) {
  const key = stage + ':' + action;
  const map = {
    'OFFICE_RECEIVED:RS_ACCEPT': ['RS_RECEIVED', order.route_team, `${order.route_team} รับเรื่อง`, 'RECEIVED'],
    'RS_RECEIVED:UNIT_ACCEPT': ['UNIT_RECEIVED', order.owner_unit, `${order.owner_unit} รับเรื่อง`, 'RECEIVED'],
    'INTERNAL_WORK:INTERNAL_DONE': ['RETURN_WAIT_RS_ACCEPT', order.route_team, `${order.owner_unit} ดำเนินการเสร็จและส่งออก`, 'SENT'],
    'INTERNAL_WORK:SEND_TO_IH': ['IH_WAIT_RS_ACCEPT', order.route_team, `${order.owner_unit} ส่งงานออกเพื่อให้ IH ดำเนินการ`, 'IH_ASSIGNED'],
    'IH_WAIT_RS_ACCEPT:RS_ACCEPT_IH': ['IH_WAIT_SEND', order.route_team, `${order.route_team} รับเรื่องสำหรับส่งต่อ IH`, 'RECEIVED'],
    'IH_WAIT_SEND:RS_SEND_IH': ['IH_WAIT_RECEIVE', 'In-house Consultant', `${order.route_team} ส่งงานให้ IH`, 'SENT'],
    'IH_WAIT_RECEIVE:IH_ACCEPT': ['IH_ASSESS', 'In-house Consultant', 'IH รับงานจริง', 'RECEIVED'],
    'IH_WORK:IH_DONE': ['IH_SUBMITTED', order.owner_unit, `IH ส่งงานกลับ ${order.owner_unit}`, 'IH_SUBMITTED'],
    'IH_SUBMITTED:UNIT_ACCEPT_IH': ['UNIT_REVIEW_IH', order.owner_unit, `${order.owner_unit} รับงานจาก IH เพื่อตรวจ`, 'RECEIVED'],
    'UNIT_REVIEW_IH:IH_REVISION': ['IH_WORK', 'In-house Consultant', `${order.owner_unit} ส่งกลับ IH แก้ไข`, 'REVISION_REQUESTED'],
    'UNIT_REVIEW_IH:UNIT_APPROVE_IH': ['RETURN_WAIT_RS_ACCEPT', order.route_team, `${order.owner_unit} ตรวจรับงาน IH และส่งออก`, 'SENT'],
    'RETURN_WAIT_RS_ACCEPT:RS_ACCEPT_RETURN': ['RETURN_RS_RECEIVED', order.route_team, `${order.route_team} รับงานกลับ`, 'RECEIVED'],
    'RETURN_RS_RECEIVED:SEND_SAFETY': ['SENT_TO_SAFETY', order.source_agency, `${order.route_team} ส่งกลับ ${order.source_agency}`, 'SENT'],
    'SENT_TO_SAFETY:CLOSE': ['CLOSED', 'ปิดงาน', 'ยืนยันรับและปิดงาน', 'CLOSED'],
  };
  const spec = map[key];
  if (!spec) throw Object.assign(new Error('INVALID_TRANSITION'), { statusCode: 409 });
  return { stage: spec[0], custodian: spec[1], label: spec[2], type: spec[3] };
}
