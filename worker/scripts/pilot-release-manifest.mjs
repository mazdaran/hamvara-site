#!/usr/bin/env node
// Read-only release fingerprint. It does not access Cloudflare, .pilot-staging,
// customer data, credentials, or billing, and never deploys or migrates.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const VERSION='0.47.0';
const TRACKED=[
 'mrp', 'worker/src', 'worker/migrations', 'worker/package.json',
 'worker/package-lock.json', 'worker/scripts/configure-pilot-roles.mjs',
 'worker/scripts/prepare-pilot-staging.mjs',
 'worker/scripts/deploy-pilot-staging.mjs',
 'worker/scripts/export-pilot-readiness.mjs',
 'worker/scripts/pilot-release-manifest.mjs'
];
const REQUIRED=[
 'mrp/index.html','mrp/mobile-receipt.html','mrp/mobile-receipt-phone.mjs',
 'mrp/mobile-receipt-client.mjs','mrp/mobile-receipts.html',
 'mrp/mobile-receipts-console.js','mrp/role-presentation.mjs',
 'worker/src/pilot-staging.js','worker/src/mobile-receipts.js',
 'worker/src/mrp.js','worker/src/trials.js',
 'worker/migrations/0013_mobile_receipts.sql',
 'worker/migrations/0014_mrp_workspace_profiles.sql',
 'worker/migrations/0015_mrp_trial_lifecycle.sql'
];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function git(...args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
async function generate(){
 if(git('status','--porcelain','--untracked-files=no'))throw Error('Tracked source has uncommitted modifications; refusing to fingerprint an ambiguous release.');
 const commit=git('rev-parse','HEAD');
 if(!/^[0-9a-f]{40}$/.test(commit))throw Error('Cannot identify a full Git commit.');
 const html=await readFile(resolve(root,'mrp/index.html'),'utf8');
 if(!/id=["']version["'][^>]*>\s*Version\s+0\.47\.0\s*</.test(html))throw Error('MRP version is not 0.47.0. Do not publish a misleading manifest.');
 const files=execFileSync('git',['ls-files','-z','--',...TRACKED],{cwd:root}).toString('utf8').split('\0').filter(Boolean).sort();
 if(files.length<50)throw Error('Too few tracked pilot files. Check that this is the complete staging checkout.');
 for(const file of REQUIRED)if(!files.includes(file))throw Error('Required pilot release file missing: '+file);
 if(files.some(file=>file.startsWith('.pilot-staging/')||file.startsWith('.mobile-staging/')))throw Error('Private staging paths must not enter release manifest.');
 const entries=[];
 for(const path of files){const bytes=await readFile(resolve(root,path));entries.push({path,sha256:sha256(bytes),size:bytes.length});}
 const payload={schemaVersion:1,product:'Hamvara MRP SaaS isolated pilot',version:VERSION,sourceCommit:commit,fileCount:entries.length,entries};
 return {...payload,manifestSha256:sha256(JSON.stringify(payload))};
}
async function main(){
 const [mode,path]=process.argv.slice(2);
 if(!['--write','--verify','--summary'].includes(mode)||((mode==='--write'||mode==='--verify')&&!path))throw Error('Usage: node worker/scripts/pilot-release-manifest.mjs --write <manifest.json> | --verify <manifest.json> | --summary');
 const current=await generate();
 if(mode==='--write'){
  const dest=resolve(process.cwd(),path);
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,JSON.stringify(current,null,2)+'\n',{mode:0o600});
 }else if(mode==='--verify'){
  const existing=JSON.parse(await readFile(resolve(process.cwd(),path),'utf8'));
  if(JSON.stringify(existing)!==JSON.stringify(current))throw Error('RELEASE BLOCKED: manifest does not match the current commit and file checksums.');
 }
 console.log(JSON.stringify({result:'PASS',mode,version:current.version,sourceCommit:current.sourceCommit,fileCount:current.fileCount,manifestSha256:current.manifestSha256}));
}
main().catch(error=>{console.error('RELEASE BLOCKED:',error.message);process.exitCode=1;});
