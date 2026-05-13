# Crittrly — Setup Guide

## What's in this folder

```
crittrly-server/
  server.js       ← Node.js proxy server (run this)
  package.json
  .env.example    ← copy to .env and fill in

crittrly/         ← the website files (auto-served by server.js)
  index.html
  shop.html
  admin.html
  ...
```

---

## Quick Start (5 minutes)

### 1. Install Node.js
Download from https://nodejs.org — get the LTS version.

### 2. Set up the server
```bash
cd crittrly-server
cp .env.example .env
# .env is already pre-filled with your CJ credentials
```

### 3. Start the server
```bash
node server.js
```

You'll see:
```
🐾 Crittrly Server running at http://localhost:3000
✅ CJ token obtained
```

### 4. Open the site
Visit **http://localhost:3000** in your browser.

Product images will now load directly from CJ Dropshipping's catalog.

---

## How real images work

When the server is running:
- The homepage and shop page call `/api/pet-products?pet=dog` etc.
- The server authenticates with CJ using your API key (server-side only — never exposed to browsers)
- Real product images, names, and prices come back from CJ's catalog
- Results are cached for 30 minutes so you don't hit rate limits

When the server is NOT running (just opening HTML files directly):
- The site falls back to the built-in product data with emoji placeholders
- Everything still works — cart, wishlist, admin panel, etc.

---

## Deploy to a VPS / hosting

1. Upload the entire folder to your server (both `crittrly-server/` and `crittrly/`)
2. Install Node.js on the server
3. Set environment variables:
   ```
   PORT=3000
   CJ_EMAIL=CJ5405524
   CJ_API_KEY=1184c51994b8447889809d80e70464a6
   STATIC_DIR=/path/to/crittrly
   ```
4. Run with PM2 for production:
   ```bash
   npm install -g pm2
   pm2 start server.js --name crittrly
   pm2 save
   pm2 startup
   ```
5. Point your domain (crittrly.com) to port 3000 via Nginx or Cloudflare

---

## API Endpoints (for reference)

| Endpoint | What it does |
|---|---|
| `GET /api/status` | Health check, token status |
| `GET /api/pet-products?pet=dog` | Products for a pet type (dog/cat/bird/reptile/fish/small/all) |
| `GET /api/products/search?q=puzzle+feeder` | Search CJ catalog |
| `GET /api/products/:pid` | Single product detail + all images |
| `GET /api/categories` | CJ category tree |

All other requests serve static files from the `crittrly/` folder.

---

## Your CJ Dropshipping credentials
These are stored in `server.js` and `.env`. Never expose them in frontend JS.

```
Account: CJ5405524
API Key: 1184c51994b8447889809d80e70464a6
```
