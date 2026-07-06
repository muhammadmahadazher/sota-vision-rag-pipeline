const { chromium } = require('playwright');
const { exec } = require('child_process');

async function run() {
    const server = exec('cd /app/frontend && npm run start');

    server.stdout.on('data', (data) => console.log(`Server: ${data}`));
    server.stderr.on('data', (data) => console.error(`Server Error: ${data}`));

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        console.log('Starting Playwright...');
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto('http://localhost:3000');
        await page.screenshot({ path: '/app/frontend-screenshot.png', fullPage: true });
        console.log('Screenshot captured as /app/frontend-screenshot.png');
        await browser.close();
    } catch (e) {
        console.error('Playwright Error:', e);
    } finally {
        server.kill();
    }
}
run();
