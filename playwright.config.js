import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://localhost:4173',
        acceptDownloads: true
    },
    projects: [
        { name: 'phone-chromium', use: { ...devices['Pixel 7'] } },
        { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
        { name: 'laptop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
    ],
    webServer: {
        // http.server's default listen backlog of 5 drops connections when parallel workers load pages
        command: 'python3 -c "import http.server as h; h.ThreadingHTTPServer.request_queue_size = 128; h.test(h.SimpleHTTPRequestHandler, h.ThreadingHTTPServer, port=4173)"',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI
    }
});
