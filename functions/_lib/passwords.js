import {fail} from './security.js';

const ITERATIONS=600000;
const hex=bytes=>[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
const bytes=value=>Uint8Array.from(value.match(/../g)||[],v=>parseInt(v,16));
export function username(value){
 const name=typeof value==='string'?value.trim().toLowerCase():'';
 if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(name))fail(400,'invalid-username');
 return name;
}
export function validatePassword(value){if(typeof value!=='string'||value.length<12||value.length>128)fail(400,'invalid-password');}
export async function derivePassword(password,salt,portable=false){
 const input=new TextEncoder().encode(password);
 if(!portable){
  try{const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt},key,256));}
  catch(e){if(!/NotSupported|OperationError/.test(e.name)&&!/iteration|not supported/i.test(e.message))throw e;}
 }
 const {pbkdf2Async,sha256}=await import('./vendor/password-kdf.js');
 return pbkdf2Async(sha256,input,salt,{c:ITERATIONS,dkLen:32,asyncTick:10});
}
export async function hashPassword(password){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return `pbkdf2-sha256$${ITERATIONS}$${hex(salt)}$${hex(await derivePassword(password,salt))}`;
}
export async function verifyPassword(password,stored){
 const parts=String(stored||'').split('$');
 const valid=parts[0]==='pbkdf2-sha256'&&parts[1]===String(ITERATIONS)&&/^[a-f0-9]{32}$/.test(parts[2])&&/^[a-f0-9]{64}$/.test(parts[3]);
 // Unknown users perform the same KDF work and receive the same login error.
 const actual=await derivePassword(password,bytes(valid?parts[2]:'00000000000000000000000000000000'));
 const expected=bytes(valid?parts[3]:'0'.repeat(64));let difference=0;
 for(let i=0;i<actual.length;i++)difference|=actual[i]^expected[i];
 return valid&&difference===0;
}
