import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool, migrate, bootstrapAdmin, pruneSessions, withTx } from './db.mjs';
import { hashSessionToken, newSessionToken, verifyPassword } from './security.mjs';
import { applyAssessment, applyTransition, createOrder, listOrders } from './repository.mjs';
import { canAssess, canCreate, canTransition } from './workflow.mjs';

const PORT = Number(process.env.PORT || 8080);
const SESSION_COOKIE = 'doh_session';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const APP_ORIGIN = process.env.APP_ORIGIN?.replace(/\/$/, '');
const SECURE_COOKIE = process.env.SECURE_COOKIE === 'true' || process.env.NODE_ENV === 'production';
const DIST = path.resolve('dist');

function json(res,status,body){
  const payload=JSON.stringify(body);
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':Buffer.byteLength(payload),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  res.end(payload);
}

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map((part)=>part.trim()).filter(Boolean).map((part)=>{
    const i=part.indexOf('=');
    return i < 0 ? [part,''] : [part.slice(0,i),decodeURIComponent(part.slice(i+1))];
  }));
}

function cookieHeader(value,maxAgeSeconds){
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (SECURE_COOKIE) attrs.push('Secure');
  return attrs.join('; ');
}

async function readJson(req){
  let total=0; const chunks=[];
  for await (const chunk of req){
    total += chunk.length;
    if(total > 1024*1024) throw Object.assign(new Error('BODY_TOO_LARGE'),{statusCode:413});
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'),{statusCode:400}); }
}

function ensureOrigin(req){
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method)) return;
  if(!APP_ORIGIN) return;
  const origin=req.headers.origin;
  if(origin && origin !== APP_ORIGIN) throw Object.assign(new Error('BAD_ORIGIN'),{statusCode:403});
}

async function currentUser(req){
  const token=parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if(!token) return null;
  const result=await pool.query(
    `SELECT u.id,u.email,u.display_name,u.role,u.org_unit_code,ou.name AS org_unit_name
     FROM sessions s JOIN users u ON u.id=s.user_id
     LEFT JOIN org_units ou ON ou.code=u.org_unit_code
     WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
    [hashSessionToken(token)],
  );
  if(!result.rowCount) return null;
  const row=result.rows[0];
  return {
    id:Number(row.id),
    email:row.email,
    displayName:row.display_name,
    role:row.role,
    orgUnitCode:row.org_unit_code || undefined,
    orgUnitName:row.org_unit_name || undefined,
  };
}

async function requireUser(req){
  const user=await currentUser(req);
  if(!user) throw Object.assign(new Error('UNAUTHORIZED'),{statusCode:401});
  return user;
}

function requireFields(body,names){
  for(const name of names){
    if(typeof body[name] !== 'string' || !body[name].trim()){
      throw Object.assign(new Error(`MISSING_${name.toUpperCase()}`),{statusCode:400});
    }
  }
}

async function validateRouting(routeTeam,ownerUnit){
  const result=await pool.query(
    `SELECT 1
     FROM org_units rt JOIN org_units ou ON ou.parent_code=rt.code
     WHERE rt.kind='route_team' AND ou.kind='owner_unit'
       AND rt.active=true AND ou.active=true AND rt.name=$1 AND ou.name=$2`,
    [routeTeam,ownerUnit],
  );
  if(!result.rowCount) throw Object.assign(new Error('INVALID_ROUTING'),{statusCode:400});
}

const mime = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.ico':'image/x-icon',
  '.woff2':'font/woff2',
};

async function serveStatic(req,res,url){
  let requested = decodeURIComponent(url.pathname);
  if(requested === '/') requested='/index.html';
  const relative=requested.replace(/^\/+/, '');
  let file=path.resolve(DIST,relative);
  if(!file.startsWith(DIST + path.sep) && file !== path.join(DIST,'index.html')){
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const stat=await fs.stat(file);
    if(stat.isDirectory()) file=path.join(file,'index.html');
    const body=await fs.readFile(file);
    res.writeHead(200,{
      'content-type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control':file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options':'nosniff',
    });
    res.end(body);
  } catch {
    if(path.extname(requested)){
      res.writeHead(404); res.end('Not found'); return;
    }
    try {
      const body=await fs.readFile(path.join(DIST,'index.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});
      res.end(body);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  }
}

async function api(req,res,url){
  if(req.method === 'GET' && url.pathname === '/api/health'){
    const db=await pool.query('SELECT now() AS now');
    return json(res,200,{ok:true,database:true,now:db.rows[0].now});
  }

  if(req.method === 'POST' && url.pathname === '/api/auth/login'){
    const body=await readJson(req);
    requireFields(body,['email','password']);
    const found=await pool.query(
      'SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',
      [body.email.trim()],
    );
    const row=found.rows[0];
    if(!row || !verifyPassword(body.password,row.password_hash)){
      return json(res,401,{error:'INVALID_CREDENTIALS'});
    }
    const token=newSessionToken();
    const expires=new Date(Date.now()+SESSION_TTL_HOURS*3600000);
    await pool.query(
      'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
      [hashSessionToken(token),row.id,expires],
    );
    res.setHeader('set-cookie',cookieHeader(token,SESSION_TTL_HOURS*3600));
    return json(res,200,{
      user:{id:Number(row.id),email:row.email,displayName:row.display_name,role:row.role,orgUnitCode:row.org_unit_code || undefined},
    });
  }

  if(req.method === 'POST' && url.pathname === '/api/auth/logout'){
    const token=parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if(token) await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashSessionToken(token)]);
    res.setHeader('set-cookie',cookieHeader('',0));
    return json(res,200,{ok:true});
  }

  const user=await requireUser(req);

  if(req.method === 'GET' && url.pathname === '/api/auth/me'){
    return json(res,200,{user});
  }

  if(req.method === 'GET' && url.pathname === '/api/master-data'){
    const units=await pool.query('SELECT code,name,kind,parent_code FROM org_units WHERE active=true ORDER BY kind,code');
    return json(res,200,{
      routeTeams:units.rows.filter((x)=>x.kind==='route_team').map((x)=>({code:x.code,name:x.name})),
      ownerUnits:units.rows.filter((x)=>x.kind==='owner_unit').map((x)=>({code:x.code,name:x.name,parentCode:x.parent_code})),
    });
  }

  if(req.method === 'GET' && url.pathname === '/api/work-orders'){
    const orders=await pool.connect().then(async (client)=>{
      try { return await listOrders(client); } finally { client.release(); }
    });
    return json(res,200,{orders});
  }

  if(req.method === 'POST' && url.pathname === '/api/work-orders'){
    if(!canCreate(user.role)) throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
    const body=await readJson(req);
    requireFields(body,['referenceNo','sourceAgency','subject','location','routeTeam','ownerUnit']);
    await validateRouting(body.routeTeam,body.ownerUnit);
    const order=await withTx((client)=>createOrder(client,{
      referenceNo:body.referenceNo.trim().slice(0,200),
      sourceAgency:body.sourceAgency.trim().slice(0,200),
      subject:body.subject.trim().slice(0,1000),
      location:body.location.trim().slice(0,1000),
      routeTeam:body.routeTeam,
      ownerUnit:body.ownerUnit,
      receivedAt:body.receivedAt || undefined,
    },user));
    return json(res,201,{order});
  }

  const actionMatch=url.pathname.match(/^\/api\/work-orders\/([^/]+)\/actions$/);
  if(req.method === 'POST' && actionMatch){
    const body=await readJson(req);
    if(typeof body.action !== 'string') throw Object.assign(new Error('MISSING_ACTION'),{statusCode:400});
    if(!canTransition(user.role,body.action)) throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
    const order=await withTx((client)=>applyTransition(client,decodeURIComponent(actionMatch[1]),body.action,user));
    return json(res,200,{order});
  }

  const assessMatch=url.pathname.match(/^\/api\/work-orders\/([^/]+)\/assessments$/);
  if(req.method === 'POST' && assessMatch){
    const body=await readJson(req);
    if(!['INITIAL','IH'].includes(body.kind)) throw Object.assign(new Error('INVALID_KIND'),{statusCode:400});
    if(!canAssess(user.role,body.kind)) throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
    const order=await withTx((client)=>applyAssessment(client,decodeURIComponent(assessMatch[1]),{
      kind:body.kind,
      level:Number(body.level),
      reason:typeof body.reason==='string' ? body.reason.trim().slice(0,2000) : '',
    },user));
    return json(res,200,{order});
  }

  return json(res,404,{error:'NOT_FOUND'});
}

async function handler(req,res){
  const started=Date.now();
  try{
    ensureOrigin(req);
    const url=new URL(req.url || '/',`http://${req.headers.host || 'localhost'}`);
    if(url.pathname.startsWith('/api/')) await api(req,res,url);
    else await serveStatic(req,res,url);
  } catch(error){
    const status=Number(error.statusCode) || 500;
    if(status >= 500) console.error(error);
    if(!res.headersSent) json(res,status,{error:error.message || 'INTERNAL_ERROR'});
    else res.end();
  } finally {
    if(process.env.REQUEST_LOG === 'true'){
      console.log(JSON.stringify({method:req.method,path:(req.url || '').split('?')[0],status:res.statusCode,ms:Date.now()-started}));
    }
  }
}

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
await migrate();
await bootstrapAdmin();
await pruneSessions();
setInterval(()=>pruneSessions().catch(console.error),3600000).unref();

const server=http.createServer(handler);
server.listen(PORT,'0.0.0.0',()=>console.log(`DOH tracking app listening on :${PORT}`));

async function shutdown(){
  server.close(async ()=>{
    await pool.end();
    process.exit(0);
  });
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
