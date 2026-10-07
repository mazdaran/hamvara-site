import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
export const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export function openStore(filename = join(MODULE_DIR, 'data', 'sandbox.sqlite')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;');
  db.exec(readFileSync(join(MODULE_DIR, 'schema.sql'), 'utf8'));
  return db;
}
// Deliberately public fixture credentials, valid only for this loopback prototype.
export const TEST_PASSWORD = 'Sandbox-test-only-2026!';
export function seed(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [id, kind] of [['sku-alice','sku'],['sku-bob','sku'],['mrp-owner','mrp'],['mrp-member','mrp'],['mrp-other-owner','mrp']]) {
      const salt = randomBytes(16).toString('hex');
      db.prepare('INSERT OR IGNORE INTO users(id,username,salt,password_hash,kind) VALUES(?,?,?,?,?)').run(id,id,salt,scryptSync(TEST_PASSWORD,salt,32).toString('hex'),kind);
    }
    for (const [id, name, owner] of [['test-company-a','Test Company A','mrp-owner'],['test-company-b','Test Company B','mrp-other-owner']]) {
      db.prepare('INSERT OR IGNORE INTO companies VALUES(?,?,?,?,1)').run(id,name,owner,`${id}-site`);
      db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?)').run(owner,id);
    }
    db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?)').run('mrp-member','test-company-a');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
