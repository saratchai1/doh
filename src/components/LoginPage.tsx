import { FormEvent, useState } from 'react';

export default function LoginPage({ onLogin, error }: {
  onLogin: (email: string, password: string) => Promise<void>;
  error?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark large">ทล</div>
          <div>
            <div className="eyebrow">DEPARTMENT OF HIGHWAYS</div>
            <h1>ระบบติดตามงาน สำนักสำรวจและออกแบบ</h1>
            <p>Work Order Tracking · ติดตามผู้ถือเรื่อง ขั้นตอน เวลา และกรอบการดำเนินงาน</p>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            อีเมล
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            รหัสผ่าน
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="error-banner">{error}</div>}
          <button className="button primary login-submit" type="submit" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        <small className="login-note">บัญชีผู้ใช้และสิทธิ์ถูกจัดการใน PostgreSQL ไม่มีรหัสผ่านตัวอย่างฝังอยู่ในหน้าเว็บ</small>
      </section>
    </main>
  );
}
