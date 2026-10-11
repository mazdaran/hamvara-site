// Keep the existing API key out of command history, arguments, files and output.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const config=JSON.parse(readFileSync(new URL('./.local/wrangler.json',import.meta.url),'utf8'));
if(config.name!=='hamvara-billing-sandbox'||config.vars?.BILLING_ENV!=='sandbox'||config.d1_databases?.[0]?.database_id!=='760d4282-7499-4740-bf29-8f13618042a8')throw Error('Incorrect billing sandbox configuration.');
const key=process.env.PADDLE_SANDBOX_API_KEY?.trim();
if(!key||!/^pdl_sdbx_apikey_/.test(key))throw Error('Load the existing PADDLE_SANDBOX_API_KEY into this PowerShell session. Do not create a new key.');
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['worker/node_modules/wrangler/bin/wrangler.js','secret','put','PADDLE_SANDBOX_API_KEY','--config','billing-cloud/.local/wrangler.json'],{cwd:root,stdio:['pipe','inherit','inherit']});
child.stdin.on('error',()=>{});child.stdin.end(key+'\n');
child.on('error',()=>{console.error('Could not start Wrangler.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
