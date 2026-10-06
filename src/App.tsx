import { useMemo, useState } from 'react';
import {
  Difficulty,
  STAGE_LABELS,
  Stage,
  WorkOrder,
  daysBetween,
  daysUntil,
  getStageEnteredAt,
  isClosed,
  isOverdue,
} from './domain';
import { SAMPLE_ORDERS } from './data';
import { applyAssessment, performTransition, uid } from './workflow';
import OrderDetail from './components/OrderDetail';
import OrderRow from './components/OrderRow';
import NewOrderModal, { NewOrderPayload } from './components/NewOrderModal';

const STORAGE_KEY = 'doh-work-orders-v1';

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkOrder[]) : SAMPLE_ORDERS;
  } catch {
    return SAMPLE_ORDERS;
  }
}

function persist(orders: WorkOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function App() {
  const [orders, setOrdersState] = useState<WorkOrder[]>(loadOrders);
  const [selectedId, setSelectedId] = useState<string | null>(SAMPLE_ORDERS[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | Stage>('ALL');
  const [custodianFilter, setCustodianFilter] = useState('ALL');
  const [newOpen, setNewOpen] = useState(false);

  const setOrders = (next: WorkOrder[]) => {
    setOrdersState(next);
    persist(next);
  };

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const openOrders = orders.filter((o) => !isClosed(o));
  const overdue = openOrders.filter(isOverdue);
  const dueSoon = openOrders.filter((o) => {
    const left = daysUntil(o.officialDueAt);
    return left !== null && left >= 0 && left <= 7;
  });
  const waitingHandoff = openOrders.filter((o) => ['IH_WAIT_RS_ACCEPT', 'IH_WAIT_SEND', 'IH_WAIT_RECEIVE', 'RETURN_WAIT_RS_ACCEPT'].includes(o.stage));
  const ihActive = openOrders.filter((o) => ['IH_ASSESS', 'IH_WORK', 'IH_SUBMITTED'].includes(o.stage));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => stageFilter === 'ALL' || o.stage === stageFilter)
      .filter((o) => custodianFilter === 'ALL' || o.currentCustodian === custodianFilter)
      .filter((o) => {
        if (!q) return true;
        return [o.id, o.referenceNo, o.subject, o.location, o.routeTeam, o.ownerUnit, o.currentCustodian].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || b.createdAt.localeCompare(a.createdAt));
  }, [orders, query, stageFilter, custodianFilter]);

  const bottlenecks = useMemo(() => {
    const map = new Map<string, { count: number; days: number }>();
    openOrders.forEach((o) => {
      const current = map.get(o.currentCustodian) ?? { count: 0, days: 0 };
      current.count += 1;
      current.days += daysBetween(getStageEnteredAt(o));
      map.set(o.currentCustodian, current);
    });
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value, avgDays: value.count ? value.days / value.count : 0 }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 5);
  }, [orders]);

  const allCustodians = [...new Set(orders.map((o) => o.currentCustodian))].sort();

  function updateOrder(id: string, updater: (order: WorkOrder) => WorkOrder) {
    setOrders(orders.map((order) => (order.id === id ? updater(order) : order)));
  }

  function performAction(order: WorkOrder, action: string) {
    updateOrder(order.id, () => performTransition(order, action));
  }

  function assess(order: WorkOrder, level: Difficulty, reason: string, kind: 'INITIAL' | 'IH') {
    updateOrder(order.id, () => applyAssessment(order, level, reason, kind));
  }

  function createOrder(payload: NewOrderPayload) {
    const now = new Date(payload.receivedAt || new Date().toISOString()).toISOString();
    const id = `DOH-${new Date().getFullYear() + 543}-${String(orders.length + 1).padStart(3, '0')}`;
    const order: WorkOrder = {
      id,
      referenceNo: payload.referenceNo,
      sourceAgency: payload.sourceAgency,
      subject: payload.subject,
      location: payload.location,
      routeTeam: payload.routeTeam,
      ownerUnit: payload.ownerUnit,
      stage: 'OFFICE_RECEIVED',
      currentCustodian: 'สำนักสำรวจและออกแบบ',
      createdAt: now,
      ihRound: 0,
      events: [{ id: uid('event'), type: 'CREATED', label: 'สำนักสำรวจและออกแบบรับเรื่อง', at: now, actor: 'สารบรรณ สบ.' }],
    };
    setOrders([order, ...orders]);
    setSelectedId(order.id);
    setNewOpen(false);
  }

  function resetDemo() {
    if (!window.confirm('รีเซ็ตข้อมูลทดลองทั้งหมดกลับเป็นค่าเริ่มต้น?')) return;
    setOrders(SAMPLE_ORDERS);
    setSelectedId(SAMPLE_ORDERS[0]?.id ?? null);
  }

  function exportCsv() {
    const headers = ['รหัสงาน', 'เลขอ้างอิง', 'เรื่อง', 'สถานที่', 'รส.สบ.', 'หน่วยเจ้าของงาน', 'สถานะ', 'ผู้ถือเรื่อง', 'ระดับ', 'กำหนดเสร็จ', 'เกินกำหนด'];
    const rows = orders.map((o) => [
      o.id, o.referenceNo, o.subject, o.location, o.routeTeam, o.ownerUnit, STAGE_LABELS[o.stage], o.currentCustodian,
      o.initialAssessment?.level ?? '', o.officialDueAt ? new Date(o.officialDueAt).toLocaleDateString('th-TH') : '', isOverdue(o) ? 'ใช่' : 'ไม่ใช่',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doh-work-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">ทล</div>
          <div><div className="brand-title">ระบบติดตามงาน สำนักสำรวจและออกแบบ</div><div className="brand-subtitle">Department of Highways · Work Order Tracking</div></div>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={exportCsv}>ส่งออก CSV</button>
          <button className="button primary" onClick={() => setNewOpen(true)}>+ รับเรื่องใหม่</button>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">COMMAND DASHBOARD</div>
            <h1>เห็นทันทีว่างานอยู่ที่ไหน และช้าเพราะช่วงไหน</h1>
            <p>หนึ่ง Work Order ต่อหนึ่งเรื่อง พร้อม Timeline การส่ง–รับ, ผู้ถือเรื่องปัจจุบัน และกรอบเวลาตามระดับความยาก</p>
          </div>
          <div className="policy-card"><span className="policy-dot" /><div><strong>นโยบายเวลาใน MVP</strong><span>ใช้วันปฏิทิน 7 / 21 / 30 / 60 วัน และแยกกรอบเวลาของ IH ออกจากกรอบงานหลัก</span></div></div>
        </section>

        <section className="metrics-grid">
          <Metric label="งานเปิด" value={openOrders.length} helper="ยังไม่ปิดงาน" />
          <Metric label="เกินกำหนด" value={overdue.length} helper="ต้องเร่งติดตาม" tone="danger" />
          <Metric label="ครบกำหนด ≤ 7 วัน" value={dueSoon.length} helper="ควรเตรียมส่งมอบ" tone="warning" />
          <Metric label="ค้างช่วงส่งต่อ" value={waitingHandoff.length} helper="handoff / queue" />
          <Metric label="IH กำลังดำเนินการ" value={ihActive.length} helper="รวมรอประเมิน/ส่งกลับ" />
        </section>

        <section className="workspace-grid">
          <div className="panel list-panel">
            <div className="panel-head"><div><h2>รายการงาน</h2><span>{filtered.length} รายการจากทั้งหมด {orders.length}</span></div><button className="text-button" onClick={resetDemo}>รีเซ็ตข้อมูลทดลอง</button></div>
            <div className="filters">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขงาน เรื่อง สถานที่ หน่วย..." />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as 'ALL' | Stage)}><option value="ALL">ทุกสถานะ</option>{Object.entries(STAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <select value={custodianFilter} onChange={(e) => setCustodianFilter(e.target.value)}><option value="ALL">ทุกผู้ถือเรื่อง</option>{allCustodians.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            </div>
            <div className="order-list">
              {filtered.map((order) => <OrderRow key={order.id} order={order} active={order.id === selectedId} onClick={() => setSelectedId(order.id)} />)}
              {filtered.length === 0 && <div className="empty">ไม่พบรายการตามเงื่อนไข</div>}
            </div>
          </div>
          <div className="panel detail-panel">
            {selected ? <OrderDetail order={selected} onAction={performAction} onAssess={assess} /> : <div className="empty big">เลือกรายการงานเพื่อดูรายละเอียด</div>}
          </div>
        </section>

        <section className="panel bottleneck-panel">
          <div className="panel-head"><div><h2>จุดค้างที่ควรตรวจ</h2><span>เรียงตามอายุเฉลี่ยของ stage ปัจจุบัน</span></div></div>
          <div className="bottleneck-grid">
            {bottlenecks.map((item) => <div className="bottleneck-card" key={item.name}><strong>{item.name}</strong><span>{item.count} งาน</span><div><b>{item.avgDays.toFixed(1)}</b> วันเฉลี่ยใน stage ปัจจุบัน</div></div>)}
          </div>
        </section>
      </main>

      {newOpen && <NewOrderModal onClose={() => setNewOpen(false)} onCreate={createOrder} />}
    </div>
  );
}

function Metric({ label, value, helper, tone = 'default' }: { label: string; value: number; helper: string; tone?: 'default' | 'danger' | 'warning' }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

export default App;
