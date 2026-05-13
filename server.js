'use strict';
/**
 * Crittrly Server
 * ─────────────────────────────────────────────
 * • Saves orders to MySQL (Verpex)
 * • CJ product image/search proxy
 * • Admin API for order management
 * • Serves static crittrly/ files
 * • NO auto-fulfillment — orders are fulfilled manually via CJ dashboard
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const mysql = require('mysql2/promise');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT        || 3000;
const CJ_EMAIL   = process.env.CJ_EMAIL    || 'CJ5405524';
const CJ_PASS    = process.env.CJ_PASSWORD || '1184c51994b8447889809d80e70464a6';
const STATIC_DIR = process.env.STATIC_DIR  || path.join(__dirname, '..', 'crittrly');
// DB config — three modes:
// 1. BRIDGE_URL set → use PHP bridge on Verpex (no port 3306 needed)
// 2. MYSQL_* set    → use Railway MySQL plugin
// 3. DB_* set       → use direct MySQL connection
const DB_HOST     = process.env.MYSQL_HOST     || process.env.DB_HOST || 'localhost';
const DB_USER     = process.env.MYSQL_USER     || process.env.DB_USER || 'crittrly_admin';
const DB_PASS     = process.env.MYSQL_PASSWORD || process.env.DB_PASS || '@MazdaDriver';
const DB_NAME     = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'crittrly_1';
const DB_PORT     = parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306');
const BRIDGE_URL  = process.env.BRIDGE_URL  || ''; // e.g. https://crittrly.com/db-bridge.php
const BRIDGE_KEY  = process.env.BRIDGE_KEY  || 'change-this-to-something-secret-crittrly-2025';
const ADMIN_KEY  = process.env.ADMIN_KEY   || 'crittrly-admin-2025';
const CJ_API     = 'developers.cjdropshipping.com';
const CACHE_TTL  = 25 * 60 * 1000;

// ── DATABASE ──────────────────────────────────────────────────────────────────
// Supports two modes:
//   BRIDGE mode: BRIDGE_URL set → calls PHP script on Verpex over HTTPS
//   DIRECT mode: connects to MySQL directly (Railway MySQL plugin or any host)

let _db;

async function getDb() {
  if (_db) return _db;
  _db = await mysql.createPool({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASS, database: DB_NAME,
    waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4',
  });
  console.log('[DB] Direct pool created →', DB_NAME, '@', DB_HOST);
  return _db;
}

async function dbQuery(sql, params) {
  params = params || [];

  if (BRIDGE_URL) {
    // ── BRIDGE MODE: call PHP script on Verpex ──────────────────────────────
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': BRIDGE_KEY },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) throw new Error('Bridge HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    // Return in mysql2-compatible format: [rows]
    if (Array.isArray(data.rows)) return [data.rows];
    return [{ affectedRows: data.affected || 0, insertId: data.insertId || 0 }];
  }

  // ── DIRECT MODE: use mysql2 pool ────────────────────────────────────────────
  const pool = await getDb();
  return pool.execute(sql, params);
}

async function initTables() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS orders (
      id            VARCHAR(40)   PRIMARY KEY,
      customer_name VARCHAR(200)  NOT NULL,
      email         VARCHAR(200)  NOT NULL,
      phone         VARCHAR(50)   NOT NULL DEFAULT '',
      address       VARCHAR(500)  NOT NULL,
      address2      VARCHAR(200)  DEFAULT '',
      city          VARCHAR(100)  NOT NULL,
      province      VARCHAR(100)  DEFAULT '',
      zip           VARCHAR(20)   DEFAULT '',
      country_code  VARCHAR(5)    NOT NULL DEFAULT 'US',
      country       VARCHAR(100)  DEFAULT '',
      items         JSON          NOT NULL,
      subtotal      DECIMAL(10,2) DEFAULT 0,
      shipping_cost DECIMAL(10,2) DEFAULT 0,
      discount      DECIMAL(10,2) DEFAULT 0,
      total         DECIMAL(10,2) NOT NULL DEFAULT 0,
      status        VARCHAR(30)   NOT NULL DEFAULT 'pending',
      tracking      VARCHAR(200)  DEFAULT NULL,
      tracking_url  VARCHAR(500)  DEFAULT NULL,
      notes         TEXT          DEFAULT NULL,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      k   VARCHAR(100) PRIMARY KEY,
      v   TEXT         NOT NULL,
      ts  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbQuery(`
    INSERT IGNORE INTO settings (k,v) VALUES
    ('store_name',      'Crittrly'),
    ('store_email',     'hello@crittrly.com'),
    ('free_ship',       '35'),
    ('cj_api_key',      '${CJ_PASS}'),
    ('cj_logistics',    'CJPacket')
  `);

  console.log('[DB] Tables ready');
}

// ── CJ TOKEN ──────────────────────────────────────────────────────────────────
let _cjTok = null, _cjExp = 0;

async function cjToken() {
  if (_cjTok && Date.now() < _cjExp) return _cjTok;

  // CJ API v2.0 uses apiKey format: "CJUserNum@api@secret"
  // Build the full key — if CJ_PASS already has @api@ use it directly,
  // otherwise combine CJ_EMAIL + @api@ + CJ_PASS
  const apiKey = CJ_PASS.includes('@api@')
    ? CJ_PASS
    : (CJ_EMAIL + '@api@' + CJ_PASS);

  console.log('[CJ] Authenticating with apiKey:', apiKey.substring(0, 20) + '...');

  try {
    const res = await cjReq('POST', '/api2.0/v1/authentication/getAccessToken', { apiKey });
    console.log('[CJ] Auth response:', JSON.stringify(res).substring(0, 300));

    if (res.result && res.data && res.data.accessToken) {
      _cjTok = res.data.accessToken;
      _cjExp = Date.now() + 22 * 3600 * 1000;
      console.log('[CJ] ✅ Token obtained successfully');
      return _cjTok;
    }
    console.warn('[CJ] Auth failed — response was:', JSON.stringify(res).substring(0, 200));
  } catch (e) {
    console.error('[CJ] Auth exception:', e.message);
  }

  // Last resort: use the apiKey string itself as the bearer token
  // (some CJ integrations work this way)
  console.log('[CJ] Falling back to apiKey as bearer token');
  _cjTok = apiKey;
  _cjExp = Date.now() + 3600 * 1000;
  return _cjTok;
}

// ── CJ REQUEST ────────────────────────────────────────────────────────────────
function cjReq(method, endpoint, body, tok) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: CJ_API, path: endpoint, method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    if (tok) opts.headers['CJ-Access-Token'] = tok;
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('CJ bad JSON: ' + raw.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
const _cache = new Map();
const cGet = k => { const e = _cache.get(k); if (!e || Date.now() > e.e) { _cache.delete(k); return null; } return e.d; };
const cSet = (k, d, t) => _cache.set(k, { d, e: Date.now() + (t || CACHE_TTL) });

// ── CJ PRODUCT HELPERS ────────────────────────────────────────────────────────

// Specific CJ search terms per category — tight enough to avoid non-pet results
const PET_Q = {
  dog: [
    'dog chew toy', 'dog rope toy', 'dog harness', 'dog leash',
    'dog food bowl', 'dog water fountain', 'dog bed mat', 'dog crate',
    'dog training collar', 'puppy toy squeaky', 'dog grooming brush',
    'dog automatic feeder', 'dog puzzle toy', 'dog carrier bag',
  ],
  cat: [
    'cat teaser wand toy', 'cat scratcher post', 'cat tree tower',
    'cat litter box', 'cat automatic feeder', 'cat water fountain',
    'cat window hammock', 'cat tunnel toy', 'cat ball toy',
    'kitten toy interactive', 'cat grooming brush', 'cat carrier bag',
  ],
  bird: [
    'parrot bird toy', 'bird cage perch', 'bird swing toy',
    'parrot foraging toy', 'bird feeder dish', 'bird mirror toy',
    'cockatiel toy', 'bird cage accessory', 'parakeet toy',
  ],
  reptile: [
    'reptile terrarium decoration', 'reptile heat lamp', 'gecko hide cave',
    'reptile water dish', 'lizard basking platform', 'reptile thermometer',
    'snake hide box', 'reptile fogger mister', 'tortoise food dish',
  ],
  fish: [
    'aquarium fish decoration', 'fish tank ornament', 'aquarium led light',
    'fish tank filter', 'aquarium air pump', 'fish tank heater',
    'aquarium plant artificial', 'betta fish tank', 'aquarium gravel',
  ],
  small: [
    'hamster exercise wheel', 'hamster hideout house', 'rabbit hay feeder',
    'guinea pig hideout', 'hamster water bottle', 'small animal tunnel',
    'rabbit chew toy', 'hamster bedding nest', 'guinea pig toy',
  ],
  all: [
    // Dogs
    'dog chew toy', 'dog harness', 'dog leash', 'dog bed mat',
    'dog food bowl', 'dog puzzle toy', 'dog grooming brush', 'dog automatic feeder',
    // Cats
    'cat scratcher post', 'cat teaser wand toy', 'cat tree tower',
    'cat water fountain', 'cat window hammock', 'cat litter box',
    // Birds
    'parrot bird toy', 'bird cage perch', 'bird swing toy',
    // Reptiles
    'reptile terrarium decoration', 'reptile heat lamp', 'gecko hide cave',
    // Fish
    'aquarium fish decoration', 'fish tank ornament', 'aquarium led light',
    // Small pets
    'hamster exercise wheel', 'hamster hideout house', 'rabbit chew toy',
    'guinea pig toy', 'small animal tunnel',
  ],
};

// Keywords that must appear in product name/category for it to be considered pet-related
const PET_KEYWORDS = [
  'dog','cat','pet','puppy','kitten','bird','parrot','fish','aquarium',
  'reptile','lizard','gecko','hamster','rabbit','guinea','tortoise',
  'ferret','hedgehog','gerbil','chinchilla','cockatiel','parakeet',
  'canary','turtle','snake','frog','leash','harness','litter','kibble',
  'paw','tail','fur','feather','crate','kennel','hutch','vivarium',
  'terrarium','perch','scratching','grooming','chew','squeaky','catnip',
];

function isPetProduct(p) {
  const text = [
    p.productNameEn || p.productName || '',
    p.categoryName || '',
    p.remark || '',
  ].join(' ').toLowerCase();
  return PET_KEYWORDS.some(kw => text.includes(kw));
}

function shapeProduct(p, cat) {
  return {
    pid:     p.pid,
    name:    p.productNameEn || p.productName || 'Product',
    image:   p.productImage || p.productImgUrl || (p.productImages || [])[0] || null,
    images:  p.productImages || [p.productImage].filter(Boolean),
    price:   parseFloat(p.sellPrice || p.productPrice || 0),
    category: cat || guessCategory(p),
    stock:   p.inventoryQuantity || 99,
    rating:  4.5 + Math.round(Math.random() * 5) / 10,
    reviews: Math.floor(60 + Math.random() * 400),
    cjUrl:   `https://app.cjdropshipping.com/product-detail.html?id=${p.pid}`,
  };
}

function guessCategory(p) {
  const s = ((p.productNameEn || '') + ' ' + (p.categoryName || '')).toLowerCase();
  if (s.includes('dog') || s.includes('puppy'))       return 'dog';
  if (s.includes('cat') || s.includes('kitten'))      return 'cat';
  if (s.includes('bird') || s.includes('parrot'))     return 'bird';
  if (s.includes('reptile') || s.includes('lizard'))  return 'reptile';
  if (s.includes('fish') || s.includes('aquarium'))   return 'fish';
  if (s.includes('hamster') || s.includes('rabbit'))  return 'small';
  return 'dog';
}

async function cjSearch(query, page, limit) {
  // Request more than needed so filtering doesn't leave us short
  const fetchSize = Math.min((limit || 20) * 3, 60);
  const k = `s:${query}:${page}:${fetchSize}`;
  const cached = cGet(k); if (cached) return cached;
  const tok = await cjToken();
  const qs = new URLSearchParams({
    pageNum: page || 1,
    pageSize: fetchSize,
    productNameEn: query,
    productType: 'ORDINARY_PRODUCT',
  }).toString();
  const res = await cjReq('GET', `/api2.0/v1/product/list?${qs}`, null, tok);
  cSet(k, res);
  return res;
}

async function cjDetail(pid) {
  const k = 'p:' + pid; const c = cGet(k); if (c) return c;
  const tok = await cjToken();
  const res = await cjReq('GET', `/api2.0/v1/product/query?pid=${pid}`, null, tok);
  cSet(k, res, 60 * 60 * 1000);
  return res;
}

// ── HTTP HELPERS ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Key');
}
function jsn(res, data, status) {
  cors(res);
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function err(res, msg, status) { jsn(res, { result: false, message: msg }, status || 500); }
function body(req) {
  return new Promise(ok => {
    let s = '';
    req.on('data', c => s += c);
    req.on('end', () => { try { ok(JSON.parse(s)); } catch { ok({}); } });
  });
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const p  = url.parse(req.url, true);
  const pn = p.pathname;
  const q  = p.query;
  const m  = req.method;

  if (m === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  const isAdmin = req.headers['x-admin-key'] === ADMIN_KEY;

  // ── /api/status ──────────────────────────────────────────────────────────
  if (pn === '/api/status' && m === 'GET') {
    return jsn(res, {
      result: true,
      mode: BRIDGE_URL ? 'bridge' : 'direct',
      db: BRIDGE_URL ? 'bridge' : !!_db,
      cjToken: !!_cjTok && Date.now() < _cjExp,
      cache: _cache.size,
      uptime: Math.floor(process.uptime()),
    });
  }

  // ── /api/pet-products?pet=dog&page=1&limit=12 ────────────────────────────
  if (pn === '/api/pet-products' && m === 'GET') {
    const pet   = q.pet || 'all';
    const page  = parseInt(q.page) || 1;
    const limit = parseInt(q.limit) || 12;

    try {
      const seen = new Set();
      let products = [];

      if (pet === 'all') {
        // Pull from ALL 6 categories in parallel — 2 items per cat = 12 total
        const CATS = ['dog','cat','bird','reptile','fish','small'];
        const perCat = Math.ceil(limit / CATS.length);
        const offset = ((page - 1) * 2) % 4; // rotate which terms we use each page

        const catResults = await Promise.all(
          CATS.map(cat => {
            const terms = PET_Q[cat];
            const term  = terms[(offset + CATS.indexOf(cat)) % terms.length];
            return cjSearch(term, 1, perCat * 4).catch(() => null);
          })
        );

        // Take perCat products from each category
        for (let i = 0; i < CATS.length; i++) {
          const data = catResults[i];
          const cat  = CATS[i];
          if (!data || !data.data) continue;
          let taken = 0;
          for (const p of (data.data.list || [])) {
            if (seen.has(p.pid)) continue;
            seen.add(p.pid);
            if (!isPetProduct(p)) continue;
            const img = p.productImage || p.productImgUrl || (p.productImages || [])[0];
            if (!img) continue;
            products.push(shapeProduct(p, cat));
            taken++;
            if (taken >= perCat) break;
          }
        }

        // Shuffle so it's not always dog/cat/bird/reptile/fish/small in order
        for (let i = products.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [products[i], products[j]] = [products[j], products[i]];
        }

      } else {
        // Single category — run 3 terms in parallel
        const queries  = PET_Q[pet] || PET_Q.all;
        const startIdx = ((page - 1) * 3) % queries.length;
        const terms    = [
          queries[startIdx % queries.length],
          queries[(startIdx + 1) % queries.length],
          queries[(startIdx + 2) % queries.length],
        ];

        const allResults = await Promise.all(
          terms.map(term => cjSearch(term, 1, limit * 3).catch(() => null))
        );

        // First pass — strict pet filter + image required
        for (const data of allResults) {
          if (!data || !data.data) continue;
          for (const p of (data.data.list || [])) {
            if (seen.has(p.pid)) continue;
            seen.add(p.pid);
            if (!isPetProduct(p)) continue;
            const img = p.productImage || p.productImgUrl || (p.productImages || [])[0];
            if (!img) continue;
            products.push(shapeProduct(p, pet));
            if (products.length >= limit) break;
          }
          if (products.length >= limit) break;
        }

        // Second pass — if short, relax pet filter but keep image requirement
        if (products.length < limit) {
          for (const data of allResults) {
            if (!data || !data.data) continue;
            for (const p of (data.data.list || [])) {
              if (seen.has(p.pid)) continue;
              seen.add(p.pid);
              const img = p.productImage || p.productImgUrl || (p.productImages || [])[0];
              if (!img) continue;
              products.push(shapeProduct(p, pet));
              if (products.length >= limit) break;
            }
            if (products.length >= limit) break;
          }
        }
      }

      console.log('[CJ] pet=' + pet + ' page=' + page + ' → ' + products.length + ' products');
      return jsn(res, { result: true, products, total: products.length });
    } catch (e) {
      console.error('[CJ] pet-products error:', e.message);
      return err(res, e.message);
    }
  }

  // ── /api/products/search?q= ──────────────────────────────────────────────
  if (pn === '/api/products/search' && m === 'GET') {
    const query = q.q || '';
    const page  = parseInt(q.page) || 1;
    const limit = parseInt(q.limit) || 20;
    if (!query) return jsn(res, { result: true, products: [], total: 0 });
    try {
      const data = await cjSearch(query, page, limit);
      const products = (data.data?.list || []).map(p => shapeProduct(p));
      return jsn(res, { result: true, products, total: products.length });
    } catch (e) { return err(res, e.message); }
  }

  // ── /api/products/:pid ───────────────────────────────────────────────────
  const prodM = pn.match(/^\/api\/products\/([^/]+)$/);
  if (prodM && m === 'GET') {
    try {
      const data = await cjDetail(prodM[1]);
      const p = data.data || {};
      return jsn(res, {
        result: true,
        product: {
          pid: p.pid, name: p.productNameEn || p.productName,
          description: (p.description || '').replace(/<[^>]*>/g, ''),
          image: p.productImage || p.productImgUrl || null,
          images: p.productImages || [p.productImage].filter(Boolean),
          price: parseFloat(p.sellPrice || p.productPrice || 0),
          category: guessCategory(p), stock: p.inventoryQuantity || 99,
          cjUrl: `https://app.cjdropshipping.com/product-detail.html?id=${p.pid}`,
        },
      });
    } catch (e) { return err(res, e.message); }
  }

  // ── POST /api/orders  — save new order from checkout ────────────────────
  if (pn === '/api/orders' && m === 'POST') {
    const b = await body(req);
    const required = ['id','customer_name','email','phone','address','city','country_code','items'];
    const missing = required.filter(k => !b[k] || (Array.isArray(b[k]) && !b[k].length));
    if (missing.length) return err(res, 'Missing: ' + missing.join(', '), 400);

    try {
      await dbQuery(
        `INSERT INTO orders
           (id,customer_name,email,phone,address,address2,city,province,zip,
            country_code,country,items,subtotal,shipping_cost,discount,total,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        [
          b.id, b.customer_name, b.email, b.phone,
          b.address, b.address2 || '',
          b.city, b.province || '', b.zip || '',
          b.country_code, b.country || b.country_code,
          JSON.stringify(b.items),
          parseFloat(b.subtotal) || 0,
          parseFloat(b.shipping_cost) || 0,
          parseFloat(b.discount) || 0,
          parseFloat(b.total) || 0,
        ]
      );
      console.log('[Orders] Saved:', b.id, '|', b.customer_name, '|', b.total);
      return jsn(res, { result: true, orderId: b.id });
    } catch (e) {
      console.error('[Orders] Insert error:', e.message);
      return err(res, e.message);
    }
  }

  // ── GET /api/orders/:id  — order status lookup (tracking page) ───────────
  const ordM = pn.match(/^\/api\/orders\/([^/]+)$/);
  if (ordM && m === 'GET') {
    try {
      const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ?', [ordM[1]]);
      if (!rows.length) return err(res, 'Order not found', 404);
      const o = rows[0];
      o.items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      return jsn(res, { result: true, order: o });
    } catch (e) { return err(res, e.message); }
  }

  // ═══════════════════════════════════════════════════
  // ADMIN ROUTES  (X-Admin-Key required)
  // ═══════════════════════════════════════════════════

  // GET /api/admin/orders
  if (pn === '/api/admin/orders' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const page   = Math.max(1, parseInt(q.page) || 1);
    const limit  = Math.min(100, parseInt(q.limit) || 50);
    const offset = (page - 1) * limit;
    const status = q.status || '';
    const search = q.search || '';
    try {
      const pool = await getDb();
      let where = '1=1', params = [];
      if (status) { where += ' AND status = ?'; params.push(status); }
      if (search) {
        where += ' AND (id LIKE ? OR customer_name LIKE ? OR email LIKE ?)';
        const s = '%' + search + '%';
        params.push(s, s, s);
      }
      const [rows]    = await dbQuery(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
      const [[count]] = await dbQuery(`SELECT COUNT(*) AS n FROM orders WHERE ${where}`, params);
      rows.forEach(o => { o.items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; });
      return jsn(res, { result: true, orders: rows, total: count.n, page, limit });
    } catch (e) { return err(res, e.message); }
  }

  // GET /api/admin/stats
  if (pn === '/api/admin/stats' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    try {
      const [[rev]]     = await dbQuery('SELECT COALESCE(SUM(total),0) AS v FROM orders');
      const [[total]]   = await dbQuery('SELECT COUNT(*) AS v FROM orders');
      const [[pending]] = await dbQuery('SELECT COUNT(*) AS v FROM orders WHERE status IN ("pending","processing")');
      const [[unfulfilled]] = await dbQuery('SELECT COUNT(*) AS v FROM orders WHERE status = "pending"');
      return jsn(res, {
        result: true,
        revenue:     parseFloat(rev.v),
        orders:      total.v,
        pending:     pending.v,
        unfulfilled: unfulfilled.v,
      });
    } catch (e) { return err(res, e.message); }
  }

  // PUT /api/admin/orders/:id  — update status/tracking/notes
  const adminOrdM = pn.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (adminOrdM && m === 'PUT') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    const allowed = ['status', 'tracking', 'tracking_url', 'notes'];
    const sets = [], vals = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
    }
    if (!sets.length) return err(res, 'Nothing to update', 400);
    vals.push(adminOrdM[1]);
    try {
      await dbQuery(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, vals);
      return jsn(res, { result: true });
    } catch (e) { return err(res, e.message); }
  }

  // GET /api/admin/settings
  if (pn === '/api/admin/settings' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    try {
      const [rows] = await dbQuery('SELECT k, v FROM settings');
      const out = {};
      rows.forEach(r => { out[r.k] = r.v; });
      return jsn(res, { result: true, settings: out });
    } catch (e) { return err(res, e.message); }
  }

  // POST /api/admin/settings
  if (pn === '/api/admin/settings' && m === 'POST') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    try {
      const pool = await getDb();
      for (const [k, v] of Object.entries(b)) {
        await dbQuery(
          'INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=?, ts=NOW()',
          [k, String(v), String(v)]
        );
      }
      return jsn(res, { result: true });
    } catch (e) { return err(res, e.message); }
  }

  // ── STATIC FILE SERVER ────────────────────────────────────────────────────
  let fp = path.join(STATIC_DIR, pn === '/' ? 'index.html' : pn).split('?')[0];
  if (!fp.startsWith(STATIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!path.extname(fp)) fp += '.html';

  fs.readFile(fp, (e, content) => {
    if (e) {
      if (e.code === 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1><a href="/">Home</a>'); }
      res.writeHead(500); return res.end('Error');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
    res.end(content);
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  try { await initTables(); }
  catch (e) { console.error('[DB] Init failed — check env vars:', e.message); }

  server.listen(PORT, async () => {
    console.log(`\n🐾 Crittrly — http://localhost:${PORT}`);
    console.log(`   DB:     ${DB_NAME} @ ${DB_HOST}`);
    console.log(`   Static: ${STATIC_DIR}\n`);
    try { await cjToken(); } catch (e) { console.warn('[CJ]', e.message); }
  });
  server.on('error', e => console.error('Server:', e.message));
}

start();
