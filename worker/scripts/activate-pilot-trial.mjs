const [apiBase, workspace, startsAt, ...flags] = process.argv.slice(2);
const token = process.env.HAMVARA_MRP_ADMIN_TOKEN;
if (!apiBase || !workspace || !startsAt || !token || !flags.includes('--ready') || !flags.includes('--customer-agreed')) {
  console.error('Usage: node scripts/activate-pilot-trial.mjs <https-api-base> <workspace> <UTC-start-ISO> --ready --customer-agreed');
  console.error('Set HAMVARA_MRP_ADMIN_TOKEN privately. Confirm readiness and customer agreement before using the flags.');
  process.exit(1);
}
try {
  const base = new URL(apiBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(workspace)) throw Error('Use a valid HTTPS API base and workspace slug.');
  const response = await fetch(`${apiBase.replace(/\/$/,'')}/api/mrp/workspaces/${workspace}/trial/activate`, {
    method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({startsAt,ready:true,customerAgreed:true})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || `Activation failed (${response.status}).`);
  console.log(JSON.stringify(result,null,2));
} catch (error) { console.error(error.message); process.exitCode=1; }
