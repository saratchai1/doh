import { FormEvent, useMemo, useState } from 'react';
import type { MasterData } from '../api';

export type NewOrderPayload = {
  referenceNo: string;
  sourceAgency: string;
  subject: string;
  location: string;
  routeTeam: string;
  ownerUnit: string;
  receivedAt: string;
};

export default function NewOrderModal({
  onClose,
  onCreate,
  masterData,
}: {
  onClose: () => void;
  onCreate: (payload: NewOrderPayload) => Promise<void>;
  masterData: MasterData;
}) {
  const firstRoute = masterData.routeTeams[0];
  const initialUnits = masterData.ownerUnits.filter((x) => x.parentCode === firstRoute?.code);
  const [form, setForm] = useState<NewOrderPayload>({
    referenceNo: '',
    sourceAgency: 'สำนักอำนวยความปลอดภัย',
    subject: '',
    location: '',
    routeTeam: firstRoute?.name || '',
    ownerUnit: initialUnits[0]?.name || '',
    receivedAt: new Date().toISOString().slice(0, 16),
  });
  const [busy, setBusy] = useState(false);

  const selectedRoute = masterData.routeTeams.find((x) => x.name === form.routeTeam);
  const availableUnits = useMemo(
    () => masterData.ownerUnits.filter((x) => x.parentCode === selectedRoute?.code),
    [masterData.ownerUnits, selectedRoute?.code],
  );

  function changeRoute(routeName: string) {
    const route = masterData.routeTeams.find((x) => x.name === routeName);
    const units = masterData.ownerUnits.filter((x) => x.parentCode === route?.code);
    setForm({ ...form, routeTeam: routeName, ownerUnit: units[0]?.name || '' });
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.referenceNo || !form.subject || !form.location || !form.routeTeam || !form.ownerUnit) return;
    setBusy(true);
    try {
      await onCreate(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">NEW WORK ORDER</span><h2>รับเรื่องใหม่</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="ปิด">×</button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>เลขที่หนังสือ / อ้างอิง<input required value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} /></label>
          <label>ต้นเรื่อง<input required value={form.sourceAgency} onChange={(e) => setForm({ ...form, sourceAgency: e.target.value })} /></label>
          <label className="full">เรื่อง<input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          <label className="full">ถนน / จุด / สถานที่<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label>รส.สบ.
            <select value={form.routeTeam} onChange={(e) => changeRoute(e.target.value)}>
              {masterData.routeTeams.map((x) => <option key={x.code} value={x.name}>{x.name}</option>)}
            </select>
          </label>
          <label>หน่วยเจ้าของงาน
            <select value={form.ownerUnit} onChange={(e) => setForm({ ...form, ownerUnit: e.target.value })}>
              {availableUnits.map((x) => <option key={x.code} value={x.name}>{x.name}</option>)}
            </select>
          </label>
          <label>วันที่เข้าสำนัก<input type="datetime-local" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label>
          <div className="form-actions full">
            <button type="button" className="button ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className="button primary" type="submit" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้าง Work Order'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
