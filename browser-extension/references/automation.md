# Chrome Web Store Automation

## chrome-webstore-upload-cli

CLI tool for uploading extensions to Chrome Web Store.

### Installation

```bash
npm install -D chrome-webstore-upload-cli
```

### Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Chrome Web Store API
3. Create OAuth 2.0 credentials (Desktop app)
4. Get refresh token using the client ID and secret

### Environment Variables

```bash
export EXTENSION_ID="your-extension-id"
export CLIENT_ID="your-client-id"
export CLIENT_SECRET="your-client-secret"
export REFRESH_TOKEN="your-refresh-token"
```

### Commands

```bash
# Upload new version
npx chrome-webstore-upload upload --source dist/chrome-mv3.zip

# Publish
npx chrome-webstore-upload publish
```

### package.json Scripts

```json
{
  "scripts": {
    "upload": "chrome-webstore-upload upload --source dist/chrome-mv3.zip",
    "publish": "chrome-webstore-upload publish",
    "release": "npm run build && npm run zip && npm run upload && npm run publish"
  }
}
```

## GitHub Actions

```yaml
name: Publish to Chrome Web Store

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm run zip
      - run: npx chrome-webstore-upload upload --source dist/chrome-mv3.zip
        env:
          EXTENSION_ID: ${{ secrets.EXTENSION_ID }}
          CLIENT_ID: ${{ secrets.CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.REFRESH_TOKEN }}
```

## References

- [chrome-webstore-upload-cli](https://github.com/fregante/chrome-webstore-upload-cli)
- [Chrome Web Store API](https://developer.chrome.com/docs/webstore/api/)
