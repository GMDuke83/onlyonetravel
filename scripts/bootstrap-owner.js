// SQL contains hashes only; the generated login stays in an ignored local file.
const {randomBytes,createHash,randomUUID,pbkdf2Sync}=require('node:crypto');
const {mkdirSync,writeFileSync}=require('node:fs');
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),now=Date.now(),id=randomUUID();
const password=randomBytes(24).toString('base64url'),salt=randomBytes(16);
const passwordHash='pbkdf2-sha256$600000$'+salt.toString('hex')+'$'+pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex');
mkdirSync('.local',{recursive:true});
writeFileSync('.local/owner-login.txt','Username: owner\nPassword: '+password+'\n',{flag:'wx',mode:0o600});
writeFileSync('.local/bootstrap-owner.sql',`BEGIN;\nINSERT INTO users(id,name,role,token_hash,active,created_at,updated_at,created_by) VALUES('${id}','Owner','owner','${hash}',1,${now},${now},'bootstrap');\nINSERT INTO staff_credentials VALUES('${id}','owner','${passwordHash}',${now});\nCOMMIT;\n`,{flag:'wx',mode:0o600});
console.log('Created .local/owner-login.txt and .local/bootstrap-owner.sql. Apply SQL after all migrations to the intended D1 environment. Never commit either file.');
