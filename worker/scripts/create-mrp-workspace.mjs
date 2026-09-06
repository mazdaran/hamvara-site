const [apiBase, adminToken, workspace, name, username = 'owner'] = process.argv.slice(2);
if (!apiBase || !adminToken || !workspace || !name) {
  console.error('Usage: npm run mrp:provision -- <api-base> <admin-token> <workspace> <company-name> [username]');
  process.exit(1);
}

const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/mrp/workspaces`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ workspace, name, username, role: 'CEO' })
});
const result = await response.json();
if (!response.ok) {
  console.error(result.error || `Provisioning failed (${response.status}).`);
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
