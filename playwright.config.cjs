const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/browser',timeout:90000,workers:1,use:{baseURL:'http://localhost:8788',headless:true},webServer:{command:'npm run dev:backend',url:'http://localhost:8788/api/v1/health',reuseExistingServer:!process.env.CI,timeout:60000}});
