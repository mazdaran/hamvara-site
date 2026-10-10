import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleMrpRequest } from '../src/mrp.js';

export const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
export async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of ['0002_mrp_saas.sql', '0004_mrp_mobile_scan.sql', '0014_mrp_workspace_profiles.sql']) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const DB = {
    beforeClaim: null,
    prepare(sql) {
      return { bind(...args) {
        return {
          async first() { return db.prepare(sql).get(...args) ?? null; },
          async all() { return { results: db.prepare(sql).all(...args) }; },
          async run() {
            if (sql.startsWith('UPDATE mrp_scan_sessions SET device_hash=') && DB.beforeClaim) {
              const hook = DB.beforeClaim; DB.beforeClaim = null; await hook();
            }
            return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
          }
        };
      } };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const env = { DB, MRP_ADMIN_TOKEN: 'test-only-admin' };
  async function call(path, { method = 'GET', headers = {}, body } = {}) {
    const req = new Request(`https://example.test/api/mrp/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return handleMrpRequest(req, env, new URL(req.url));
  }
  const companies = {};
  for (const slug of ['istanbul-test', 'us-test']) {
    const response = await call('workspaces', { method: 'POST', headers: { Authorization: 'Bearer test-only-admin' }, body: { workspace: slug, name: slug } });
    const created = await response.json();
    const headers = { 'X-Hamvara-Workspace': slug, 'X-Hamvara-User': 'owner', 'X-Hamvara-Key': created.accessKey };
    const { workspace } = await (await call('session', { headers })).json();
    db.prepare('UPDATE mrp_state SET state_json=? WHERE workspace_id=?').run(JSON.stringify({ companyMarker: slug }), workspace.id);
    companies[slug] = { headers, id: workspace.id };
  }
  return { db, DB, call, a: companies['istanbul-test'], b: companies['us-test'] };
}
