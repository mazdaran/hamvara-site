import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }
export function login(db, username, password, now = Date.now()) {
  const user = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
  const candidate = scryptSync(String(password), user?.salt || 'dummy-salt', 32);
  const stored = Buffer.from(user?.password_hash || '00'.repeat(32), 'hex');
  if (!user || !timingSafeEqual(candidate,stored)) throw new HttpError(401,'invalid_test_credentials');
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),user.id,csrf,now+60*60*1000);
  return { token, csrf, user: { id:user.id, username:user.username, kind:user.kind } };
}
export function session(db, cookie = '', now = Date.now()) {
  const tokens = cookie.split(';').map(p=>p.trim()).filter(p=>p.startsWith('hamvara_sandbox_session='));
  if(tokens.length!==1) throw new HttpError(401,'test_login_required');
  const token = tokens[0].slice('hamvara_sandbox_session='.length);
  if(!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401,'test_login_required');
  const row=db.prepare('SELECT s.*,u.username,u.kind FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(token),now);
  if(!row) throw new HttpError(401,'test_login_required');
  return row;
}
export function requireCsrf(actor, supplied) {
  if(typeof supplied!=='string'||! /^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(actor.csrf),Buffer.from(supplied))) throw new HttpError(403,'csrf_failed');
}
export function resolveOwner(db, actor, plan) {
  if(plan.scope==='user') return actor.user_id;
  const companies=db.prepare('SELECT c.id FROM companies c JOIN memberships m ON m.company_id=c.id WHERE c.billing_owner=? AND m.user_id=? AND c.active=1').all(actor.user_id,actor.user_id);
  // The prototype never accepts a browser company selector. Ambiguous owners fail closed.
  if(companies.length!==1) throw new HttpError(403,'explicit_single_company_billing_owner_required');
  return companies[0].id;
}
