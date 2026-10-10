import { readFile } from 'node:fs/promises';
import { validateWorkspaceProfile } from '../src/workspace-management.js';
const [apiBase, workspace, name, profileFile, username = 'owner'] = process.argv.slice(2);
const token = process.env.HAMVARA_MRP_ADMIN_TOKEN;
if (!apiBase || !workspace || !name || !profileFile || !token) {
  console.error('Usage: HAMVARA_MRP_ADMIN_TOKEN=<existing token> node scripts/create-pilot-workspace.mjs <https-api-base> <workspace> <company-name> <profile.json> [owner-username]');
  process.exit(1);
}
try {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Use an HTTPS API base URL without credentials, query or fragment.');
  const profile = validateWorkspaceProfile(JSON.parse(await readFile(profileFile, 'utf8')));
  const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/mrp/workspaces`, {
    method:'POST', redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({workspace,name,username,role:'CEO',pilot:true,profile})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || `Creation failed (${response.status}).`);
  console.log(JSON.stringify(result,null,2));
  console.error('Owner key is shown once. Save privately; do not paste output into tickets or public chat. This prepares a workspace; it does not start a timed trial.');
} catch (error) { console.error(error.message); process.exitCode=1; }
