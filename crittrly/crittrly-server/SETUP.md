# Crittrly Server — Railway Setup

## The most important thing

Railway must be pointed at the **crittrly-server/** folder as its root,
NOT the parent folder that contains both crittrly/ and crittrly-server/.

If Railway sees the parent folder it can't find package.json cleanly and
treats the project as a static site. That's the error you saw.

---

## Option A — Deploy just the server folder (recommended)

1. Create a new GitHub repo containing ONLY the crittrly-server/ contents:
   ```
   my-crittrly-server/       ← this is the repo root
   ├── server.js
   ├── package.json
   ├── railway.json
   ├── nixpacks.toml
   └── .env.example
   ```
   Do NOT include the crittrly/ site files in this repo.

2. Push to GitHub.

3. In Railway: New Project → Deploy from GitHub → select that repo.
   Railway will detect Node.js automatically via nixpacks.toml.

4. Set environment variables in Railway dashboard → Variables:
   ```
   CJ_EMAIL      = CJ5405524
   CJ_PASSWORD   = 1184c51994b8447889809d80e70464a6
   DB_HOST       = your-verpex-mysql-host
   DB_USER       = crittrly_admin
   DB_PASS       = @MazdaDriver
   DB_NAME       = crittrly_1
   DB_PORT       = 3306
   ADMIN_KEY     = crittrly-admin-2025
   STATIC_DIR    = /app/crittrly
   ```

5. Your Railway URL will be something like:
   https://crittrly-production.up.railway.app

---

## Option B — Monorepo (both folders in one repo)

If you want both crittrly/ and crittrly-server/ in one repo:

1. Push both folders to one GitHub repo.

2. In Railway: New Project → Deploy from GitHub → select the repo.

3. CRITICAL — In Railway dashboard → your service → Settings → 
   set **Root Directory** to: `crittrly-server`
   This tells Railway to look inside that subfolder for package.json.

4. Set the same environment variables as Option A.

---

## Finding your Verpex MySQL host

Log into Verpex cPanel → Databases → MySQL Databases.
The hostname is shown there — typically something like:
  sql123.verpex.com  or  your-domain.com  (port 3306)

---

## Uploading the crittrly/ site files to Railway

The server serves your site's HTML/CSS/JS files from STATIC_DIR.
On Railway, files are at /app/ so you need the crittrly/ folder there.

If using Option A (server-only repo), add your site files to the repo:
```
my-crittrly-server/
├── server.js
├── package.json
├── railway.json
├── nixpacks.toml
└── crittrly/          ← add the whole site folder here
    ├── index.html
    ├── shop.html
    ├── admin.html
    └── ...
```
Then set STATIC_DIR = /app/crittrly

---

## Verify it's working

Visit: https://your-railway-url.up.railway.app/api/status

You should see:
{
  "result": true,
  "db": true,
  "cjToken": true,
  ...
}

db: true = MySQL connected
cjToken: true = CJ API authenticated
