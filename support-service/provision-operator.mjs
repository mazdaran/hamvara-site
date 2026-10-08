// Run locally. Output is secret: never commit it or paste it into public chat.
import {randomBytes,createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const input=createInterface({input:process.stdin,output:process.stdout});
const id=(await input.question('Operator ID (lowercase letters, digits, _ or -): ')).trim();
const name=(await input.question('Display name: ')).trim();input.close();
if(!/^[a-z0-9_-]{1,40}$/.test(id)||!name||name.length>60)throw Error('Invalid operator ID or name');
const token=randomBytes(36).toString('base64url');
console.log('\nPRIVATE OPERATOR KEY (save in password manager):\n'+token);
console.log('\nOperator registry entry (combine entries in a JSON array for CHAT_OPERATORS):\n'+JSON.stringify({id,name,tokenHash:createHash('sha256').update(token).digest('hex')}));
