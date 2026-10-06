import { FormEvent, useState } from 'react';
import { OWNER_UNITS, ROUTE_TEAMS } from '../domain';

export type NewOrderPayload = {
  referenceNo: string;
  sourceAgency: string;
  subject: string;
  location: string;
  routeTeam: string;
  ownerUnit: string;
  receivedAt: string;
};

export default function NewOrderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: NewOrderPayload) => void }) {
  const [form, setForm] = useState<NewOrderPayload>({
    referenceNo: '',
    sourceAgency: 'สำนักอำนวยความปลอดภัย',
    subject: '',
    location: '',
    routeTeam: ROUTE_TEAMS[0],
    ownerUnit: OWNER_UNITS[0],
    receivedAt: new Date().toISOString().slice(0, 16),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.referenceNo || !form.subject || !form.location) return;
    onCreate(form);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">NEW WORK ORDER</span><h2>รับเรื่องใหม่</h2></div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>เลขที่หนังสือ / อ้างอิง<input required value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} /></label>
          <label>ต้นเรื่อง<input required value={form.sourceAgency} onChange={(e) => setForm({ ...form, sourceAgency: e.target.value })} /></label>
          <label className="full">เรื่อง<input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          <label className="full">ถนน / จุด / สถานที่<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label>รส.สบ.<select value={form.routeTeam} onChange={(e) => setForm({ ...form, routeTeam: e.target.value })}>{ROUTE_TEAMS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>หน่วยเจ้าของงาน<select value={form.ownerUnit} onChange={(e) => setForm({ ...form, ownerUnit: e.target.value })}>{OWNER_UNITS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>วันที่เข้าสำนัก<input type="datetime-local" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label>
          <div className="form-actions full">
            <button type="button" className="button ghost" onClick={onClose}>ยกเลิก</button>
            <button className="button primary" type="submit">สร้าง Work Order</button>
          </div>
        </form>
      </div>
    </div>
  );
}
