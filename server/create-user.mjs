import { migrate, pool } from './db.mjs';
import { hashPassword } from './security.mjs';

function arg(name){
  const i=process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i+1] : undefined;
}

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const email=arg('email')?.trim();
const password=arg('password');
const role=arg('role') || 'STAFF';
const name=arg('name') || email;
const org=arg('org-unit');

if(!email || !password) throw new Error('Usage: npm run user:create -- --email user@example.go.th --password "..." --role STAFF --name "..." --org-unit WTB.1');
if(password.length < 12) throw new Error('Password must be at least 12 characters');
if(!['ADMIN','MANAGER','STAFF','IH','VIEWER'].includes(role)) throw new Error('Invalid role');

await migrate();
if(org){
  const found=await pool.query('SELECT 1 FROM org_units WHERE code=$1 AND active=true',[org]);
  if(!found.rowCount) throw new Error(`Unknown org unit code: ${org}`);
}

const existing=await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)',[email]);
const passwordHash=hashPassword(password);
if(existing.rowCount){
  await pool.query(
    `UPDATE users SET display_name=$2,role=$3,org_unit_code=$4,password_hash=$5,active=true WHERE id=$1`,
    [existing.rows[0].id,name,role,org || null,passwordHash],
  );
}else{
  await pool.query(
    `INSERT INTO users(email,display_name,role,org_unit_code,password_hash) VALUES($1,$2,$3,$4,$5)`,
    [email,name,role,org || null,passwordHash],
  );
}
console.log(`user ready: ${email} (${role})`);
await pool.end();
