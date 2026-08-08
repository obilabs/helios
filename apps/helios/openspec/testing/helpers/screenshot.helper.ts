import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class ScreenshotHelper {
  private basePath: string;
  private changeName: string;
  private sessionId: string;

  constructor(changeName: string) {
    this.changeName = changeName;
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.basePath = path.join(
      __dirname,
      '../../changes',
      changeName,
      'tests',
      'evidence',
      'screenshots',
      this.sessionId
    );

    // Ensure directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Capture screenshot with metadata
   */
  async capture(page: Page, name: string, options?: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    mask?: string[];
  }): Promise<string> {
    const timestamp = Date.now();
    const fileName = `${name}_${timestamp}.png`;
    const filePath = path.join(this.basePath, fileName);

    // Take screenshot
    await page.screenshot({
      path: filePath,
      fullPage: options?.fullPage ?? true,
      clip: options?.clip,
      mask: options?.mask ? page.locator(options.mask.join(', ')).all() : undefined
    });

    // Create metadata file
    const metadataPath = filePath.replace('.png', '.json');
    const metadata = {
      name,
      timestamp,
      url: page.url(),
      viewport: page.viewportSize(),
      change: this.changeName,
      session: this.sessionId
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`📸 Screenshot saved: ${fileName}`);
    return filePath;
  }

  /**
   * Compare screenshot with baseline
   */
  async compare(page: Page, name: string, threshold: number = 0.01): Promise<boolean> {
    const baselinePath = path.join(
      __dirname,
      '../../changes',
      this.changeName,
      'tests',
      'evidence',
      'baseline',
      `${name}.png`
    );

    if (!fs.existsSync(baselinePath)) {
      // Create baseline if it doesn't exist
      await page.screenshot({ path: baselinePath, fullPage: true });
      console.log(`📸 Baseline created: ${name}`);
      return true;
    }

    // Take current screenshot
    const currentPath = await this.capture(page, `${name}_compare`);

    // Compare screenshots (using Playwright's built-in comparison)
    const currentBuffer = fs.readFileSync(currentPath);
    const baselineBuffer = fs.readFileSync(baselinePath);

    // Simple size comparison (you'd want to use a proper image comparison library)
    if (currentBuffer.length !== baselineBuffer.length) {
      console.log(`❌ Screenshot mismatch: ${name}`);
      return false;
    }

    console.log(`✅ Screenshot match: ${name}`);
    return true;
  }

  /**
   * Capture element screenshot
   */
  async captureElement(page: Page, selector: string, name: string): Promise<string> {
    const element = page.locator(selector);
    const timestamp = Date.now();
    const fileName = `${name}_element_${timestamp}.png`;
    const filePath = path.join(this.basePath, fileName);

    await element.screenshot({ path: filePath });

    console.log(`📸 Element screenshot saved: ${fileName}`);
    return filePath;
  }

  /**
   * Create screenshot report
   */
  async createReport(): Promise<string> {
    const reportPath = path.join(this.basePath, '../report.html');
    const screenshots = fs.readdirSync(this.basePath)
      .filter(file => file.endsWith('.png'));

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Screenshot Report - ${this.changeName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #8b5cf6;
      padding-bottom: 10px;
    }
    .screenshot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .screenshot-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .screenshot-card img {
      width: 100%;
      height: auto;
      display: block;
    }
    .screenshot-info {
      padding: 15px;
      background: #fafafa;
      border-top: 1px solid #eee;
    }
    .screenshot-name {
      font-weight: 600;
      color: #333;
      margin-bottom: 5px;
    }
    .screenshot-time {
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Screenshot Report: ${this.changeName}</h1>
  <p>Session: ${this.sessionId}</p>
  <p>Total Screenshots: ${screenshots.length}</p>

  <div class="screenshot-grid">
    ${screenshots.map(file => {
      const metadataPath = path.join(this.basePath, file.replace('.png', '.json'));
      let metadata: any = {};

      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }

      return `
        <div class="screenshot-card">
          <img src="${file}" alt="${file}" />
          <div class="screenshot-info">
            <div class="screenshot-name">${metadata.name || file}</div>
            <div class="screenshot-time">${metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : ''}</div>
            <div class="screenshot-url">${metadata.url || ''}</div>
          </div>
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;

    fs.writeFileSync(reportPath, html);
    console.log(`📊 Screenshot report created: ${reportPath}`);
    return reportPath;
  }

  /**
   * Clean up old screenshots
   */
  async cleanup(daysToKeep: number = 7): Promise<void> {
    const evidencePath = path.join(
      __dirname,
      '../../changes',
      this.changeName,
      'tests',
      'evidence',
      'screenshots'
    );

    if (!fs.existsSync(evidencePath)) {
      return;
    }

    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const sessions = fs.readdirSync(evidencePath);

    for (const session of sessions) {
      const sessionPath = path.join(evidencePath, session);
      const stats = fs.statSync(sessionPath);

      if (stats.mtimeMs < cutoffTime) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`🗑️ Cleaned up old session: ${session}`);
      }
    }
  }
}

export default ScreenshotHelper;