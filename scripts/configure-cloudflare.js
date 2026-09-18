// CI uses an environment-scoped database ID. Never silently deploy a local ID.
const fs=require('node:fs');
const id=process.env.CLOUDFLARE_D1_DATABASE_ID;
if(!/^[a-f0-9-]{36}$/i.test(id||'')||/^0{8}-/.test(id))throw new Error('Set CLOUDFLARE_D1_DATABASE_ID for this deployment environment');
const binding={binding:'DB',database_name:'onlyone-travel',database_id:id,migrations_dir:'migrations'};
fs.writeFileSync('wrangler.jsonc',JSON.stringify({name:'onlyone-luxury-travel',pages_build_output_dir:'public',compatibility_date:'2026-09-18',d1_databases:[binding],env:{preview:{d1_databases:[binding]}}},null,2)+'\n');
