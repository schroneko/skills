import puppeteer from "puppeteer";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const WIDTH = 440;
const HEIGHT = 280;

const messages = JSON.parse(
  readFileSync(join(rootDir, "public/_locales/en/messages.json"), "utf-8")
);
const extName = messages.extName.message;

const iconPath = join(rootDir, "public/icons/icon128.png");
const iconBase64 = readFileSync(iconPath).toString("base64");
const iconDataUrl = `data:image/png;base64,${iconBase64}`;

const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .icon {
      width: 96px;
      height: 96px;
      margin-bottom: 20px;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }
    .name {
      color: white;
      font-size: 24px;
      font-weight: 600;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      text-align: center;
      padding: 0 20px;
    }
  </style>
</head>
<body>
  <img class="icon" src="${iconDataUrl}" alt="icon">
  <div class="name">${extName}</div>
</body>
</html>
`;

async function generatePromoImage() {
  const outputDir = join(rootDir, "store-assets");
  mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const outputPath = join(outputDir, "promo-small.png");
  await page.screenshot({ path: outputPath, type: "png" });

  await browser.close();

  console.log(`Generated: ${outputPath}`);
}

generatePromoImage().catch(console.error);
