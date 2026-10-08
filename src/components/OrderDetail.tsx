import { useState } from 'react';
import {
  DIFFICULTY_RULES,
  Difficulty,
  STAGE_LABELS,
  WorkOrder,
  daysBetween,
  daysUntil,
  formatThaiDate,
  getStageEnteredAt,
} from '../domain';

export default function OrderDetail({
  order,
  onAction,
  onAssess,
  canAction,
  canAssess,
}: {
  order: WorkOrder;
  onAction: (order: WorkOrder, action: string) => void;
  onAssess: (order: WorkOrder, level: Difficulty, reason: string, kind: 'INITIAL' | 'IH') => void;
  canAction: (action: string) => boolean;
  canAssess: (kind: 'INITIAL' | 'IH') => boolean;
}) {
  const [level, setLevel] = useState<Difficulty>(1);
  const [reason, setReason] = useState('');
  const stageAge = daysBetween(getStageEnteredAt(order));
  const officialLeft = daysUntil(order.officialDueAt);
  const ihLeft = daysUntil(order.ihDueAt);

  const submitAssessment = (kind: 'INITIAL' | 'IH') => {
    onAssess(order, level, reason, kind);
    setReason('');
  };

  const actionsForStage: Partial<Record<WorkOrder['stage'], string[]>> = {
    OFFICE_RECEIVED: ['RS_ACCEPT'],
    RS_RECEIVED: ['UNIT_ACCEPT'],
    INTERNAL_WORK: ['INTERNAL_DONE','SEND_TO_IH'],
    IH_WAIT_RS_ACCEPT: ['RS_ACCEPT_IH'],
    IH_WAIT_SEND: ['RS_SEND_IH'],
    IH_WAIT_RECEIVE: ['IH_ACCEPT'],
    IH_WORK: ['IH_DONE'],
    IH_SUBMITTED: ['UNIT_ACCEPT_IH'],
    UNIT_REVIEW_IH: ['UNIT_APPROVE_IH','IH_REVISION'],
    RETURN_WAIT_RS_ACCEPT: ['RS_ACCEPT_RETURN'],
    RETURN_RS_RECEIVED: ['SEND_SAFETY'],
    SENT_TO_SAFETY: ['CLOSE'],
  };
  const hasWritableStep =
    (order.stage === 'UNIT_RECEIVED' && canAssess('INITIAL')) ||
    (order.stage === 'IH_ASSESS' && canAssess('IH')) ||
    (actionsForStage[order.stage] || []).some(canAction);

  return (
    <div>
      <div className="detail-head">
        <div>
          <div className="eyebrow">{order.referenceNo}</div>
          <h2>{order.subject}</h2>
          <p>{order.location}</p>
        </div>
        <span className={`badge stage ${order.stage === 'CLOSED' ? 'success' : ''}`}>{STAGE_LABELS[order.stage]}</span>
      </div>

      <div className="status-strip">
        <div><span>ผู้ถือเรื่องปัจจุบัน</span><strong>{order.currentCustodian}</strong></div>
        <div><span>อยู่ขั้นตอนนี้</span><strong>{stageAge} วัน</strong></div>
        <div>
          <span>กรอบงานหลัก</span>
          <strong>{order.officialDueAt ? formatThaiDate(order.officialDueAt) : 'ยังไม่ประเมิน'}</strong>
          {officialLeft !== null && <small className={officialLeft < 0 ? 'danger-text' : ''}>{officialLeft < 0 ? `เกิน ${Math.abs(officialLeft)} วัน` : `เหลือ ${officialLeft} วัน`}</small>}
        </div>
      </div>

      <div className="facts-grid">
        <Fact label="รส.สบ." value={order.routeTeam} />
        <Fact label="หน่วยเจ้าของงาน" value={order.ownerUnit} />
        <Fact label="รับเรื่องเมื่อ" value={formatThaiDate(order.createdAt)} />
        <Fact label="ต้นเรื่อง" value={order.sourceAgency} />
      </div>

      <div className="assessment-grid">
        <AssessmentCard title="การประเมินครั้งแรก" assessment={order.initialAssessment} due={order.officialDueAt} />
        <AssessmentCard title="การประเมินของ IH" assessment={order.ihAssessment} due={order.ihDueAt} suffix={order.ihAssessment ? `รอบ ${order.ihRound}` : undefined} />
      </div>

      <section className="action-zone">
        <h3>ดำเนินการขั้นถัดไป</h3>
        {order.stage === 'UNIT_RECEIVED' && canAssess('INITIAL') && (
          <AssessmentForm level={level} setLevel={setLevel} reason={reason} setReason={setReason} onSubmit={() => submitAssessment('INITIAL')} button="บันทึกการประเมินและเริ่มงาน" />
        )}
        {order.stage === 'IH_ASSESS' && canAssess('IH') && (
          <AssessmentForm level={level} setLevel={setLevel} reason={reason} setReason={setReason} onSubmit={() => submitAssessment('IH')} button="บันทึกการประเมิน IH และเริ่มงาน" />
        )}
        <div className="action-buttons">
          {order.stage === 'OFFICE_RECEIVED' && canAction('RS_ACCEPT') && <button className="button primary" onClick={() => onAction(order, 'RS_ACCEPT')}>{order.routeTeam} รับเรื่อง</button>}
          {order.stage === 'RS_RECEIVED' && canAction('UNIT_ACCEPT') && <button className="button primary" onClick={() => onAction(order, 'UNIT_ACCEPT')}>{order.ownerUnit} รับเรื่อง</button>}
          {order.stage === 'INTERNAL_WORK' && <>
            {canAction('INTERNAL_DONE') && <button className="button primary" onClick={() => onAction(order, 'INTERNAL_DONE')}>หน่วยทำเสร็จและส่งออก</button>}
            {canAction('SEND_TO_IH') && <button className="button secondary" onClick={() => onAction(order, 'SEND_TO_IH')}>ส่งให้ In-house Consultant</button>}
          </>}
          {order.stage === 'IH_WAIT_RS_ACCEPT' && canAction('RS_ACCEPT_IH') && <button className="button primary" onClick={() => onAction(order, 'RS_ACCEPT_IH')}>{order.routeTeam} รับเรื่องเพื่อส่ง IH</button>}
          {order.stage === 'IH_WAIT_SEND' && canAction('RS_SEND_IH') && <button className="button primary" onClick={() => onAction(order, 'RS_SEND_IH')}>{order.routeTeam} ส่งให้ IH</button>}
          {order.stage === 'IH_WAIT_RECEIVE' && canAction('IH_ACCEPT') && <button className="button primary" onClick={() => onAction(order, 'IH_ACCEPT')}>IH ยืนยันรับงานจริง</button>}
          {order.stage === 'IH_WORK' && canAction('IH_DONE') && <button className="button primary" onClick={() => onAction(order, 'IH_DONE')}>IH ทำงานแล้วเสร็จและส่งกลับ</button>}
          {order.stage === 'IH_SUBMITTED' && canAction('UNIT_ACCEPT_IH') && <button className="button primary" onClick={() => onAction(order, 'UNIT_ACCEPT_IH')}>{order.ownerUnit} รับงานเพื่อตรวจ</button>}
          {order.stage === 'UNIT_REVIEW_IH' && <>
            {canAction('UNIT_APPROVE_IH') && <button className="button primary" onClick={() => onAction(order, 'UNIT_APPROVE_IH')}>ตรวจผ่านและส่งออก</button>}
            {canAction('IH_REVISION') && <button className="button secondary" onClick={() => onAction(order, 'IH_REVISION')}>ส่งกลับ IH แก้ไข</button>}
          </>}
          {order.stage === 'RETURN_WAIT_RS_ACCEPT' && canAction('RS_ACCEPT_RETURN') && <button className="button primary" onClick={() => onAction(order, 'RS_ACCEPT_RETURN')}>{order.routeTeam} รับงานกลับ</button>}
          {order.stage === 'RETURN_RS_RECEIVED' && canAction('SEND_SAFETY') && <button className="button primary" onClick={() => onAction(order, 'SEND_SAFETY')}>ส่งกลับ {order.sourceAgency}</button>}
          {order.stage === 'SENT_TO_SAFETY' && canAction('CLOSE') && <button className="button primary" onClick={() => onAction(order, 'CLOSE')}>ยืนยันรับและปิดงาน</button>}
          {order.stage === 'CLOSED' && <span className="closed-note">งานนี้ปิดแล้ว และ Timeline ยังคงเก็บครบถ้วน</span>}
          {order.stage !== 'CLOSED' && !hasWritableStep && <span className="readonly-note">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์ดำเนินการขั้นตอนปัจจุบัน</span>}
        </div>
        {order.ihDueAt && ihLeft !== null && ['IH_ASSESS', 'IH_WORK', 'IH_SUBMITTED', 'UNIT_REVIEW_IH'].includes(order.stage) && (
          <div className="ih-sla-note">กรอบ IH: {formatThaiDate(order.ihDueAt)} · {ihLeft < 0 ? `เกิน ${Math.abs(ihLeft)} วัน` : `เหลือ ${ihLeft} วัน`}</div>
        )}
      </section>

      <section className="timeline-section">
        <div className="section-title"><h3>Timeline การส่ง–รับ</h3><span>{order.events.length} เหตุการณ์</span></div>
        <div className="timeline">
          {[...order.events].reverse().map((event, index) => (
            <div className="timeline-item" key={event.id}>
              <div className={`timeline-dot ${index === 0 ? 'current' : ''}`} />
              <div className="timeline-content">
                <strong>{event.label}</strong>
                <span>{formatThaiDate(event.at)}{event.actor ? ` · ${event.actor}` : ''}</span>
                {event.note && <p>{event.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="fact"><span>{label}</span><strong>{value}</strong></div>;
}

function AssessmentCard({ title, assessment, due, suffix }: { title: string; assessment?: WorkOrder['initialAssessment']; due?: string; suffix?: string }) {
  return (
    <div className="assessment-card">
      <div className="assessment-title"><span>{title}</span>{suffix && <small>{suffix}</small>}</div>
      {assessment ? <>
        <div className="level-line"><b>Level {assessment.level}</b><span>{DIFFICULTY_RULES[assessment.level].label}</span></div>
        <small>โดย {assessment.assessedBy} · {formatThaiDate(assessment.assessedAt)}</small>
        <small>เป้าหมาย {DIFFICULTY_RULES[assessment.level].targetDays} วัน · due {formatThaiDate(due)}</small>
        {assessment.reason && <p>{assessment.reason}</p>}
      </> : <span className="muted">ยังไม่มีการประเมิน</span>}
    </div>
  );
}

function AssessmentForm({ level, setLevel, reason, setReason, onSubmit, button }: {
  level: Difficulty;
  setLevel: (level: Difficulty) => void;
  reason: string;
  setReason: (reason: string) => void;
  onSubmit: () => void;
  button: string;
}) {
  return (
    <div className="assessment-form">
      <label>
        ระดับความยาก
        <select value={level} onChange={(e) => setLevel(Number(e.target.value) as Difficulty)}>
          {([1, 2, 3, 4] as Difficulty[]).map((key) => (
            <option key={key} value={key}>Level {key} — {DIFFICULTY_RULES[key].label} ({DIFFICULTY_RULES[key].targetDays} วัน)</option>
          ))}
        </select>
      </label>
      <label>
        เหตุผล / หมายเหตุ
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ต้องปรับแนวราบและตรวจระยะมองเห็น" />
      </label>
      <button className="button primary" onClick={onSubmit}>{button}</button>
    </div>
  );
}
