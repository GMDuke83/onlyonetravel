// Writes only a credential HASH into SQL. The token stays in an ignored local file.
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {mkdirSync,writeFileSync}=require('node:fs');
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),now=Date.now();
mkdirSync('.local',{recursive:true});
writeFileSync('.local/owner-token.txt',token,{flag:'wx',mode:0o600});
writeFileSync('.local/bootstrap-owner.sql',`INSERT INTO users(id,name,role,token_hash,active,created_at,updated_at,created_by) VALUES('${randomUUID()}','Owner','owner','${hash}',1,${now},${now},'bootstrap');\n`,{flag:'wx',mode:0o600});
console.log('Created .local/owner-token.txt and .local/bootstrap-owner.sql. Apply SQL to the intended D1 environment. Never commit either file.');
