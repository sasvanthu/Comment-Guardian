const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', err => console.log(`PAGE ERROR: ${err.message}`));

  console.log("Checking port 8080...");
  try {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 5000 });
  } catch (e) {
    console.log("Port 8080 failed, trying 5173...");
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 5000 });
  }
  
  await browser.close();
})();
