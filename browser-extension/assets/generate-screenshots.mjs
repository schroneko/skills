import puppeteer from "puppeteer";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const extensionPath = join(rootDir, "dist/chrome-mv3");
const outputDir = join(rootDir, "store-assets");

const STORE_SIZE = { width: 1280, height: 800 };
const POPUP_SIZE = { width: 360, height: 540 };

async function getExtensionId(browser) {
  const targets = await browser.targets();
  const extensionTarget = targets.find(
    (target) => target.type() === "service_worker"
  );
  if (!extensionTarget) {
    throw new Error("Extension service worker not found");
  }
  return extensionTarget.url().split("/")[2];
}

async function waitForExtensionReady(browser, extensionId, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Extension not ready");
}

function createWrapperHtml(popupBase64, title, description) {
  const displayWidth = Math.floor(POPUP_SIZE.width * 1.4);
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${STORE_SIZE.width}px;
      height: ${STORE_SIZE.height}px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .container {
      display: flex;
      align-items: center;
      gap: 40px;
    }
    .popup-wrapper {
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 40px rgba(29, 155, 240, 0.1);
    }
    .popup-wrapper img {
      display: block;
      width: ${displayWidth}px;
      height: auto;
    }
    .branding {
      color: #e7e9ea;
      text-align: center;
    }
    .branding h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .branding p {
      font-size: 18px;
      color: #71767b;
      max-width: 320px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="popup-wrapper">
      <img src="data:image/png;base64,${popupBase64}" />
    </div>
    <div class="branding">
      <h1>${title}</h1>
      <p>${description}</p>
    </div>
  </div>
</body>
</html>`;
}

async function generateScreenshots() {
  if (!existsSync(extensionPath)) {
    console.error(`Extension not found at ${extensionPath}`);
    console.error("Run 'npm run build' first.");
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  console.log("Launching browser with extension...");
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: POPUP_SIZE,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    await new Promise((r) => setTimeout(r, 2000));

    const extensionId = await getExtensionId(browser);
    console.log(`Extension ID: ${extensionId}`);

    await waitForExtensionReady(browser, extensionId);
    console.log("Extension ready");

    const popupUrl = `chrome-extension://${extensionId}/popup.html`;

    console.log("Capturing screenshot...");

    const popupPage = await browser.newPage();
    await popupPage.setViewport({ ...POPUP_SIZE, deviceScaleFactor: 2 });
    await popupPage.goto(popupUrl, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 300));

    const popupScreenshot = await popupPage.screenshot({ encoding: "base64" });
    await popupPage.close();

    const wrapperPage = await browser.newPage();
    await wrapperPage.setViewport(STORE_SIZE);

    const wrapperHtml = createWrapperHtml(
      popupScreenshot,
      "Extension Name",
      "Short description of your extension"
    );
    await wrapperPage.setContent(wrapperHtml, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 300));

    const outputPath = join(outputDir, "01-screenshot.png");
    await wrapperPage.screenshot({ path: outputPath, fullPage: false });
    console.log(`  Saved: ${outputPath}`);

    await wrapperPage.close();

    console.log(`\nScreenshots saved to: ${outputDir}`);
  } finally {
    await browser.close();
  }
}

generateScreenshots().catch(console.error);
