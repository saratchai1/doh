import { TARGET_DAYS, transitionSpec } from './workflow.mjs';

function mapAssessment(row) {
  if (!row) return undefined;
  return {
    level: row.level,
    assessedAt: row.assessed_at,
    assessedBy: row.assessed_by_label,
    reason: row.reason || undefined,
  };
}

function mapEvent(row) {
  return {
    id: String(row.id),
    type: row.type,
    label: row.label,
    at: row.created_at,
    actor: row.actor_label || undefined,
    from: row.from_custodian || undefined,
    to: row.to_custodian || undefined,
    note: row.note || undefined,
  };
}

export async function hydrateOrders(client, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const assessments = await client.query(
    'SELECT * FROM difficulty_assessments WHERE work_order_id = ANY($1) ORDER BY assessed_at,id',
    [ids],
  );
  const events = await client.query(
    'SELECT * FROM workflow_events WHERE work_order_id = ANY($1) ORDER BY created_at,id',
    [ids],
  );
  const assessByOrder = new Map();
  for (const row of assessments.rows) {
    const bucket = assessByOrder.get(row.work_order_id) || [];
    bucket.push(row); assessByOrder.set(row.work_order_id, bucket);
  }
  const eventsByOrder = new Map();
  for (const row of events.rows) {
    const bucket = eventsByOrder.get(row.work_order_id) || [];
    bucket.push(row); eventsByOrder.set(row.work_order_id, bucket);
  }
  return rows.map((row) => {
    const a = assessByOrder.get(row.id) || [];
    const initial = [...a].reverse().find((x) => x.kind === 'INITIAL');
    const ih = [...a].reverse().find((x) => x.kind === 'IH');
    return {
      id: row.id,
      referenceNo: row.reference_no,
      sourceAgency: row.source_agency,
      subject: row.subject,
      location: row.location,
      routeTeam: row.route_team,
      ownerUnit: row.owner_unit,
      stage: row.current_stage,
      currentCustodian: row.current_custodian,
      createdAt: row.created_at,
      initialAssessment: mapAssessment(initial),
      ihAssessment: mapAssessment(ih),
      officialDueAt: row.official_due_at || undefined,
      ihDueAt: row.ih_due_at || undefined,
      ihRound: row.ih_round,
      events: (eventsByOrder.get(row.id) || []).map(mapEvent),
      version: row.version,
    };
  });
}

export async function listOrders(client) {
  const rows = await client.query('SELECT * FROM work_orders ORDER BY created_at DESC');
  return hydrateOrders(client, rows.rows);
}

export async function getOrder(client, id, lock = false) {
  const rows = await client.query(
    `SELECT * FROM work_orders WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows.rowCount) throw Object.assign(new Error('NOT_FOUND'), { statusCode: 404 });
  const hydrated = await hydrateOrders(client, rows.rows);
  return { row: rows.rows[0], api: hydrated[0] };
}

function buddhistYearNow() {
  const gregorian = Number(new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Bangkok', year:'numeric' }).format(new Date()));
  return gregorian + 543;
}

export async function createOrder(client, payload, user) {
  const year = buddhistYearNow();
  const seq = await client.query(
    `INSERT INTO work_order_numbers(year_be,last_value) VALUES($1,1)
     ON CONFLICT(year_be) DO UPDATE SET last_value=work_order_numbers.last_value+1
     RETURNING last_value`,
    [year],
  );
  const id = `DOH-${year}-${String(seq.rows[0].last_value).padStart(4,'0')}`;
  const at = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
  if (Number.isNaN(at.getTime())) throw Object.assign(new Error('INVALID_DATE'), { statusCode: 400 });
  await client.query(
    `INSERT INTO work_orders
     (id,reference_no,source_agency,subject,location,route_team,owner_unit,current_stage,current_custodian,created_by_user_id,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,'OFFICE_RECEIVED','สำนักสำรวจและออกแบบ',$8,$9)`,
    [id,payload.referenceNo,payload.sourceAgency,payload.subject,payload.location,payload.routeTeam,payload.ownerUnit,user.id,at],
  );
  await client.query(
    `INSERT INTO workflow_events(work_order_id,type,label,actor_user_id,actor_label,to_custodian,created_at)
     VALUES($1,'CREATED','สำนักสำรวจและออกแบบรับเรื่อง',$2,$3,'สำนักสำรวจและออกแบบ',$4)`,
    [id,user.id,user.displayName,at],
  );
  await client.query(
    'INSERT INTO audit_log(user_id,work_order_id,action,details) VALUES($1,$2,$3,$4)',
    [user.id,id,'CREATE_WORK_ORDER',JSON.stringify({ referenceNo: payload.referenceNo })],
  );
  return (await getOrder(client,id)).api;
}

export async function applyAssessment(client, id, payload, user) {
  const { row } = await getOrder(client,id,true);
  const kind = payload.kind;
  if (kind === 'INITIAL' && row.current_stage !== 'UNIT_RECEIVED') {
    throw Object.assign(new Error('INVALID_ASSESSMENT_STAGE'), { statusCode: 409 });
  }
  if (kind === 'IH' && row.current_stage !== 'IH_ASSESS') {
    throw Object.assign(new Error('INVALID_ASSESSMENT_STAGE'), { statusCode: 409 });
  }
  const level = Number(payload.level);
  const targetDays = TARGET_DAYS[level];
  if (!targetDays) throw Object.assign(new Error('INVALID_LEVEL'), { statusCode: 400 });
  const now = new Date();
  const due = new Date(now.getTime() + targetDays * 86400000);
  await client.query(
    `INSERT INTO difficulty_assessments
     (work_order_id,kind,level,target_days,assessed_by_user_id,assessed_by_label,reason,assessed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id,kind,level,targetDays,user.id,user.displayName,payload.reason || null,now],
  );
  if (kind === 'INITIAL') {
    await client.query(
      `UPDATE work_orders SET current_stage='INTERNAL_WORK',current_custodian=owner_unit,
       official_due_at=$2,version=version+1 WHERE id=$1`,
      [id,due],
    );
  } else {
    await client.query(
      `UPDATE work_orders SET current_stage='IH_WORK',current_custodian='In-house Consultant',
       ih_due_at=$2,ih_round=GREATEST(ih_round,1),version=version+1 WHERE id=$1`,
      [id,due],
    );
  }
  await client.query(
    `INSERT INTO workflow_events(work_order_id,type,label,actor_user_id,actor_label,note,created_at)
     VALUES($1,'ASSESSED',$2,$3,$4,$5,$6)`,
    [id,`${kind === 'IH' ? 'IH ' : ''}ประเมินระดับ ${level} — ${targetDays} วัน`,user.id,user.displayName,payload.reason || null,now],
  );
  await client.query(
    'INSERT INTO audit_log(user_id,work_order_id,action,details) VALUES($1,$2,$3,$4)',
    [user.id,id,'ASSESS',JSON.stringify({kind,level,targetDays})],
  );
  return (await getOrder(client,id)).api;
}

export async function applyTransition(client, id, action, user) {
  const { row } = await getOrder(client,id,true);
  const spec = transitionSpec(row.current_stage, action, row);
  const from = row.current_custodian;
  const ihRoundDelta = action === 'IH_REVISION' ? 1 : 0;
  const close = spec.stage === 'CLOSED' ? ', closed_at=now()' : '';
  await client.query(
    `UPDATE work_orders
     SET current_stage=$2,current_custodian=$3,ih_round=ih_round+$4,version=version+1 ${close}
     WHERE id=$1`,
    [id,spec.stage,spec.custodian,ihRoundDelta],
  );
  await client.query(
    `INSERT INTO workflow_events(work_order_id,type,label,actor_user_id,actor_label,from_custodian,to_custodian)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [id,spec.type,spec.label,user.id,user.displayName,from,spec.custodian],
  );
  await client.query(
    'INSERT INTO audit_log(user_id,work_order_id,action,details) VALUES($1,$2,$3,$4)',
    [user.id,id,action,JSON.stringify({fromStage:row.current_stage,toStage:spec.stage,from,to:spec.custodian})],
  );
  return (await getOrder(client,id)).api;
}
