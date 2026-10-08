import { WorkOrder, daysBetween, daysUntil, getStageEnteredAt, isOverdue } from '../domain';

export default function OrderRow({ order, active, onClick }: { order: WorkOrder; active: boolean; onClick: () => void }) {
  const stageAge = daysBetween(getStageEnteredAt(order));
  const left = daysUntil(order.officialDueAt);

  return (
    <button className={`order-row ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="order-row-main">
        <div className="order-id-line">
          <span className="order-id">{order.id}</span>
          {isOverdue(order) && <span className="badge danger">เกินกำหนด</span>}
          {!isOverdue(order) && left !== null && left <= 7 && left >= 0 && <span className="badge warning">ใกล้ครบกำหนด</span>}
        </div>
        <strong>{order.subject}</strong>
        <span className="muted">{order.location}</span>
      </div>
      <div className="order-row-meta">
        <span>{order.currentCustodian}</span>
        <small>อยู่ stage นี้ {stageAge} วัน</small>
      </div>
    </button>
  );
}
