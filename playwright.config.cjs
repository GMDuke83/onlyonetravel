const {defineConfig}=require('@playwright/test');
process.env.OO_TEST_PERSIST ||= '.wrangler/browser-tests-'+Date.now();
module.exports=defineConfig({testDir:'tests/browser',globalSetup:'./tests/browser/setup.cjs',timeout:120000,expect:{timeout:20000},workers:1,use:{actionTimeout:15000,baseURL:'http://localhost:8791',headless:true},webServer:{command:'npm run dev:backend -- --persist-to '+process.env.OO_TEST_PERSIST,url:'http://localhost:8791',reuseExistingServer:false,timeout:60000}});
