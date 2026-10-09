const {execFileSync}=require('node:child_process');
module.exports=async()=>{
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','onlyone-travel','--local','--persist-to',process.env.OO_TEST_PERSIST],{stdio:'pipe'});
};
