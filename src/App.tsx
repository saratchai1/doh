import { useEffect, useMemo, useState } from 'react';
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
import { api, CurrentUser, MasterData } from './api';
import OrderDetail from './components/OrderDetail';
import OrderRow from './components/OrderRow';
import NewOrderModal, { NewOrderPayload } from './components/NewOrderModal';
import LoginPage from './components/LoginPage';

const INTERNAL_ACTIONS = new Set([
  'RS_ACCEPT','UNIT_ACCEPT','INTERNAL_DONE','SEND_TO_IH','RS_ACCEPT_IH','RS_SEND_IH',
  'UNIT_ACCEPT_IH','UNIT_APPROVE_IH','IH_REVISION','RS_ACCEPT_RETURN','SEND_SAFETY','CLOSE',
]);
const IH_ACTIONS = new Set(['IH_ACCEPT','IH_DONE']);

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const map: Record<string,string> = {
    INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    UNAUTHORIZED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการนี้',
    INVALID_TRANSITION: 'สถานะงานเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่',
    INVALID_ASSESSMENT_STAGE: 'ไม่สามารถประเมินงานในสถานะปัจจุบันได้',
    INVALID_ROUTING: 'หน่วยเจ้าของงานไม่อยู่ภายใต้ รส.สบ. ที่เลือก',
  };
  return map[code] || `เกิดข้อผิดพลาด: ${code}`;
}

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | Stage>('ALL');
  const [custodianFilter, setCustodianFilter] = useState('ALL');
  const [newOpen, setNewOpen] = useState(false);
  const [error, setError] = useState<string>('');

  async function loadWorkspace() {
    const [ordersResponse, master] = await Promise.all([api.orders(), api.masterData()]);
    setOrders(ordersResponse.orders);
    setMasterData(master);
    setSelectedId((current) => current && ordersResponse.orders.some((x) => x.id === current)
      ? current
      : ordersResponse.orders[0]?.id || null);
  }

  useEffect(() => {
    (async () => {
      try {
        const session = await api.me();
        setUser(session.user);
        await loadWorkspace();
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status !== 401) setError(friendlyError(e));
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    setError('');
    try {
      const result = await api.login(email, password);
      setUser(result.user);
      await loadWorkspace();
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function logout() {
    try { await api.logout(); } catch { /* local state still clears */ }
    setUser(null);
    setOrders([]);
    setMasterData(null);
    setSelectedId(null);
    setError('');
  }

  async function refreshAfterMutation(promise: Promise<{ order: WorkOrder }>) {
    setError('');
    try {
      const { order } = await promise;
      setOrders((current) => current.map((x) => x.id === order.id ? order : x));
      setSelectedId(order.id);
    } catch (e) {
      setError(friendlyError(e));
      if ((e as { status?: number })?.status === 401) setUser(null);
    }
  }

  async function performAction(order: WorkOrder, action: string) {
    await refreshAfterMutation(api.action(order.id, action));
  }

  async function assess(order: WorkOrder, level: Difficulty, reason: string, kind: 'INITIAL' | 'IH') {
    await refreshAfterMutation(api.assess(order.id, level, reason, kind));
  }

  async function createOrder(payload: NewOrderPayload) {
    setError('');
    try {
      const { order } = await api.createOrder(payload);
      setOrders((current) => [order, ...current]);
      setSelectedId(order.id);
      setNewOpen(false);
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  function canAction(action: string) {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'IH') return IH_ACTIONS.has(action);
    if (user.role === 'STAFF' || user.role === 'MANAGER') return INTERNAL_ACTIONS.has(action);
    return false;
  }

  function canAssess(kind: 'INITIAL' | 'IH') {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (kind === 'IH') return user.role === 'IH';
    return user.role === 'STAFF' || user.role === 'MANAGER';
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const openOrders = orders.filter((o) => !isClosed(o));
  const overdue = openOrders.filter(isOverdue);
  const dueSoon = openOrders.filter((o) => {
    const left = daysUntil(o.officialDueAt);
    return left !== null && left >= 0 && left <= 7;
  });
  const waitingHandoff = openOrders.filter((o) =>
    ['IH_WAIT_RS_ACCEPT','IH_WAIT_SEND','IH_WAIT_RECEIVE','RETURN_WAIT_RS_ACCEPT'].includes(o.stage));
  const ihActive = openOrders.filter((o) => ['IH_ASSESS','IH_WORK','IH_SUBMITTED'].includes(o.stage));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => stageFilter === 'ALL' || o.stage === stageFilter)
      .filter((o) => custodianFilter === 'ALL' || o.currentCustodian === custodianFilter)
      .filter((o) => !q || [
        o.id,o.referenceNo,o.subject,o.location,o.routeTeam,o.ownerUnit,o.currentCustodian,
      ].join(' ').toLowerCase().includes(q))
      .sort((a,b) => Number(isOverdue(b)) - Number(isOverdue(a)) || b.createdAt.localeCompare(a.createdAt));
  }, [orders,query,stageFilter,custodianFilter]);

  const bottlenecks = useMemo(() => {
    const map = new Map<string,{count:number;days:number}>();
    openOrders.forEach((o) => {
      const current = map.get(o.currentCustodian) || { count:0,days:0 };
      current.count += 1;
      current.days += daysBetween(getStageEnteredAt(o));
      map.set(o.currentCustodian,current);
    });
    return [...map.entries()]
      .map(([name,value]) => ({ name,...value,avgDays:value.count ? value.days/value.count : 0 }))
      .sort((a,b) => b.avgDays-a.avgDays)
      .slice(0,5);
  }, [orders]);

  const allCustodians = [...new Set(orders.map((o) => o.currentCustodian))].sort();

  function exportCsv() {
    const headers = ['รหัสงาน','เลขที่หนังสือ','เรื่อง','สถานที่','รส.สบ.','หน่วยเจ้าของงาน','สถานะ','ผู้ถือเรื่อง','ระดับ','กำหนดเสร็จ','เกินกำหนด'];
    const rows = orders.map((o) => [
      o.id,o.referenceNo,o.subject,o.location,o.routeTeam,o.ownerUnit,STAGE_LABELS[o.stage],o.currentCustodian,
      o.initialAssessment?.level ?? '',o.officialDueAt ? new Date(o.officialDueAt).toLocaleDateString('th-TH') : '',isOverdue(o) ? 'ใช่' : 'ไม่ใช่',
    ]);
    const csv = [headers,...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url;
    a.download=`doh-work-tracking-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) {
    return <div className="loading-screen"><div className="brand-mark large">ทล</div><strong>กำลังเปิดระบบติดตามงาน…</strong></div>;
  }
  if (!user) return <LoginPage onLogin={login} error={error} />;

  const canCreateOrder = ['ADMIN','MANAGER','STAFF'].includes(user.role);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">ทล</div>
          <div><div className="brand-title">ระบบติดตามงาน สำนักสำรวจและออกแบบ</div><div className="brand-subtitle">Department of Highways · Work Order Tracking</div></div>
        </div>
        <div className="top-actions">
          <div className="user-chip">
            <strong>{user.displayName}</strong>
            <span>{user.orgUnitName || user.role}</span>
          </div>
          <button className="button ghost" onClick={exportCsv}>ส่งออก CSV</button>
          {canCreateOrder && masterData && <button className="button primary" onClick={() => setNewOpen(true)}>+ รับเรื่องใหม่</button>}
          <button className="button ghost" onClick={logout}>ออกจากระบบ</button>
        </div>
      </header>

      <main className="page">
        {error && <div className="error-banner workspace-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
        <section className="hero">
          <div>
            <div className="eyebrow">COMMAND DASHBOARD</div>
            <h1>เห็นทันทีว่างานอยู่ที่ไหน และช้าเพราะช่วงไหน</h1>
            <p>หนึ่ง Work Order ต่อหนึ่งเรื่อง พร้อม Timeline การส่ง–รับ ผู้ถือเรื่องปัจจุบัน และกรอบเวลาตามระดับความยาก</p>
          </div>
          <div className="policy-card"><span className="policy-dot" /><div><strong>กรอบเวลาปัจจุบัน</strong><span>7 / 21 / 30 / 60 วัน · IH ประเมินแยก แต่ไม่สร้าง Work Order ใหม่</span></div></div>
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
            <div className="panel-head"><div><h2>รายการงาน</h2><span>{filtered.length} รายการจากทั้งหมด {orders.length}</span></div></div>
            <div className="filters">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขงาน เรื่อง สถานที่ หน่วย..." />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as 'ALL' | Stage)}>
                <option value="ALL">ทุกสถานะ</option>
                {Object.entries(STAGE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select value={custodianFilter} onChange={(e) => setCustodianFilter(e.target.value)}>
                <option value="ALL">ทุกผู้ถือเรื่อง</option>
                {allCustodians.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="order-list">
              {filtered.map((order) => <OrderRow key={order.id} order={order} active={order.id === selectedId} onClick={() => setSelectedId(order.id)} />)}
              {filtered.length === 0 && <div className="empty">ไม่พบรายการตามเงื่อนไข</div>}
            </div>
          </div>

          <div className="panel detail-panel">
            {selected
              ? <OrderDetail order={selected} onAction={performAction} onAssess={assess} canAction={canAction} canAssess={canAssess} />
              : <div className="empty big">ยังไม่มี Work Order — ผู้มีสิทธิ์สามารถกด “รับเรื่องใหม่” เพื่อเริ่มงาน</div>}
          </div>
        </section>

        <section className="panel bottleneck-panel">
          <div className="panel-head"><div><h2>จุดค้างที่ควรตรวจ</h2><span>เรียงตามอายุเฉลี่ยของงานใน stage ปัจจุบัน</span></div></div>
          <div className="bottleneck-grid">
            {bottlenecks.map((item) => <div className="bottleneck-card" key={item.name}><strong>{item.name}</strong><span>{item.count} งาน</span><div><b>{item.avgDays.toFixed(1)}</b> วันเฉลี่ยใน stage ปัจจุบัน</div></div>)}
            {bottlenecks.length === 0 && <div className="empty">ยังไม่มีงานเปิด</div>}
          </div>
        </section>
      </main>

      {newOpen && masterData && <NewOrderModal masterData={masterData} onClose={() => setNewOpen(false)} onCreate={createOrder} />}
    </div>
  );
}

function Metric({ label,value,helper,tone='default' }: { label:string;value:number;helper:string;tone?:'default'|'danger'|'warning' }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

export default App;
