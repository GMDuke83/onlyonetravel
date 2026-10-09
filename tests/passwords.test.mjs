import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {hashPassword,verifyPassword,derivePassword,username,validatePassword} from '../functions/_lib/passwords.js';
test('native and portable password KDF match PBKDF2-SHA256 reference at 600000 rounds',async()=>{
 const salt=new Uint8Array(16).fill(42),password='Mitarbeiter-Şifre-2026';
 const expected=pbkdf2Sync(password,salt,600000,32,'sha256');
 assert.deepEqual(Buffer.from(await derivePassword(password,salt)),expected);
 assert.deepEqual(Buffer.from(await derivePassword(password,salt,true)),expected);
});
test('passwords are salted, verified without plaintext and reject wrong or missing credentials',async()=>{
 const password='A long personal password',a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a,b);assert.equal(a.includes(password),false);
 assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('incorrect',a),false);
 assert.equal(await verifyPassword(password,null),false);assert.equal(await verifyPassword(password,'broken-hash'),false);
 assert.equal(username(' Maria.Example '),'maria.example');
 for(const value of ['x','has spaces','тест',undefined])assert.throws(()=>username(value));
 for(const value of ['admin','x'.repeat(129),undefined])assert.throws(()=>validatePassword(value));
});
