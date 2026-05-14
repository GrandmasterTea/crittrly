'use strict';
/**
 * Crittrly Server v4
 * ─────────────────────────────────────────────────────────
 * Architecture: Catalog-based dropshipping
 *
 * HOW IT WORKS:
 *   1. Admin browses CJ → adds specific products to MySQL catalog
 *   2. Shop/homepage serve from catalog (every product has a CJ PID)
 *   3. Customer orders → order items include exact CJ PID
 *   4. Fulfillment sheet shows direct CJ link per item → one click to fulfill
 *
 * ROUTES:
 *   Public:
 *     GET  /api/status
 *     GET  /api/catalog?cat=dog&page=1&limit=24&search=
 *     GET  /api/catalog/:id
 *     GET  /api/cj/search?q=&cat=&page=&limit=   (admin browse CJ)
 *     POST /api/orders
 *     GET  /api/orders/:id
 *
 *   Admin (X-Admin-Key required):
 *     GET  /api/admin/stats
 *     GET  /api/admin/orders?page=&limit=&status=&search=
 *     PUT  /api/admin/orders/:id
 *     POST /api/admin/catalog         (add product to catalog)
 *     PUT  /api/admin/catalog/:id     (update product)
 *     DELETE /api/admin/catalog/:id   (remove from catalog)
 *     GET  /api/admin/settings
 *     POST /api/admin/settings
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const mysql = require('mysql2/promise');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT         || 3000;
const CJ_EMAIL   = process.env.CJ_EMAIL     || 'CJ5405524';
const CJ_PASS    = process.env.CJ_PASSWORD  || '1184c51994b8447889809d80e70464a6';
const STATIC_DIR = process.env.STATIC_DIR   || path.join(__dirname, '..', 'crittrly');
const DB_HOST    = process.env.MYSQL_HOST   || process.env.DB_HOST || 'localhost';
const DB_USER    = process.env.MYSQL_USER   || process.env.DB_USER || 'crittrly_admin';
const DB_PASS    = process.env.MYSQL_PASSWORD || process.env.DB_PASS || '@MazdaDriver';
const DB_NAME    = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'crittrly_1';
const DB_PORT    = parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306');
const BRIDGE_URL = process.env.BRIDGE_URL   || '';
const BRIDGE_KEY = process.env.BRIDGE_KEY   || 'change-this-to-something-secret-crittrly-2025';
const ADMIN_KEY  = process.env.ADMIN_KEY    || 'crittrly-admin-2025';
const MARKUP     = parseFloat(process.env.PRICE_MARKUP || '3.0');
const CJ_HOST    = 'developers.cjdropshipping.com';
const CACHE_TTL  = 20 * 60 * 1000;

// ── DATABASE ──────────────────────────────────────────────────────────────────
let _db;
async function getDb() {
  if (_db) return _db;
  _db = await mysql.createPool({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASS, database: DB_NAME,
    waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4',
  });
  console.log('[DB] Pool created →', DB_NAME, '@', DB_HOST);
  return _db;
}

async function dbQuery(sql, params) {
  params = params || [];
  if (BRIDGE_URL) {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': BRIDGE_KEY },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch {}
      console.error('[Bridge] HTTP', res.status, '— response:', errBody.substring(0, 300));
      // Try to parse error message from JSON response
      try {
        const errJson = JSON.parse(errBody);
        throw new Error('Bridge error: ' + (errJson.error || errJson.sql || errBody.substring(0, 200)));
      } catch {}
      throw new Error('Bridge HTTP ' + res.status + ': ' + errBody.substring(0, 150));
    }
    const data = await res.json();
    if (data.error) {
      console.error('[Bridge] SQL error:', data.error, '| SQL:', data.sql || '');
      throw new Error(data.error);
    }
    if (Array.isArray(data.rows)) return [data.rows];
    return [{ affectedRows: data.affected || 0, insertId: data.insertId || 0 }];
  }
  const pool = await getDb();
  return pool.execute(sql, params);
}

async function initTables() {
  // Orders table
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
      cj_order_id   VARCHAR(100)  DEFAULT NULL,
      tracking      VARCHAR(200)  DEFAULT NULL,
      tracking_url  VARCHAR(500)  DEFAULT NULL,
      fulfillment_error TEXT      DEFAULT NULL,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Product catalog — admin adds products here with exact CJ PIDs
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS catalog (
      id          VARCHAR(40)   PRIMARY KEY,
      cj_pid      VARCHAR(100)  NOT NULL,
      cj_vid      VARCHAR(100)  DEFAULT NULL,
      cj_sku      VARCHAR(100)  DEFAULT NULL,  -- CJ productSku e.g. CJNSSYWY01847
      name        VARCHAR(500)  NOT NULL,
      description TEXT          DEFAULT NULL,
      image       TEXT          DEFAULT NULL,
      images      JSON          DEFAULT NULL,
      category    VARCHAR(50)   NOT NULL DEFAULT 'dog',
      price       DECIMAL(10,2) NOT NULL DEFAULT 0,
      orig_price  DECIMAL(10,2) DEFAULT NULL,
      wholesale   DECIMAL(10,2) DEFAULT NULL,
      badge       VARCHAR(20)   DEFAULT NULL,
      featured    TINYINT(1)    NOT NULL DEFAULT 0,
      active      TINYINT(1)    NOT NULL DEFAULT 1,
      weight_g    INT           NOT NULL DEFAULT 100,  -- product weight in grams
      sort_order  INT           NOT NULL DEFAULT 0,
      created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_featured (featured),
      INDEX idx_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Settings
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      k   VARCHAR(100) PRIMARY KEY,
      v   TEXT         NOT NULL,
      ts  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbQuery(`
    INSERT IGNORE INTO settings (k,v) VALUES
    ('store_name',   'Crittrly'),
    ('store_email',  'hello@crittrly.com'),
    ('free_ship',    '35'),
    ('cj_logistics', 'CJPacket')
  `);

  console.log('[DB] Tables ready');
}

// ── CJ AUTH ───────────────────────────────────────────────────────────────────
let _cjTok = null, _cjExp = 0;

async function cjToken() {
  if (_cjTok && Date.now() < _cjExp) return _cjTok;
  const apiKey = CJ_PASS.includes('@api@') ? CJ_PASS : (CJ_EMAIL + '@api@' + CJ_PASS);
  console.log('[CJ] Authenticating...');
  try {
    const res = await cjReq('POST', '/api2.0/v1/authentication/getAccessToken', { apiKey });
    if (res.result && res.data && res.data.accessToken) {
      _cjTok = res.data.accessToken;
      _cjExp = Date.now() + 22 * 3600 * 1000;
      console.log('[CJ] ✅ Token OK');
      return _cjTok;
    }
    console.warn('[CJ] Auth fallback:', JSON.stringify(res).slice(0, 150));
  } catch (e) { console.error('[CJ] Auth error:', e.message); }
  _cjTok = CJ_PASS.includes('@api@') ? CJ_PASS : (CJ_EMAIL + '@api@' + CJ_PASS);
  _cjExp = Date.now() + 3600 * 1000;
  return _cjTok;
}

function cjReq(method, endpoint, body, tok) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: CJ_HOST, path: endpoint, method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    if (tok) opts.headers['CJ-Access-Token'] = tok;
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Bad JSON')); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('CJ timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
const _cache = new Map();
const cGet = k => { const e = _cache.get(k); if (!e || Date.now() > e.e) { _cache.delete(k); return null; } return e.d; };
const cSet = (k, d, t) => _cache.set(k, { d, e: Date.now() + (t || CACHE_TTL) });

// ── MARKUP ────────────────────────────────────────────────────────────────────
function applyMarkup(raw) {
  if (!raw || raw <= 0) return 0;
  return Math.ceil(raw * MARKUP) - 0.01;
}

// ── SHAPE CJ PRODUCT (for browse results only — not for catalog) ──────────────
function shapeCJProduct(p, cat) {
  const wholesale = parseFloat(p.sellPrice || p.productPrice || 0);
  const list      = parseFloat(p.productPrice || 0);
  return {
    pid:         p.pid,
    name:        (p.productNameEn || p.productName || 'Product').substring(0, 120),
    image:       p.productImage || p.productImgUrl || (p.productImages || [])[0] || null,
    images:      p.productImages || [],
    price:       applyMarkup(wholesale),
    origPrice:   list > wholesale ? applyMarkup(list) : null,
    wholesale,
    category:    cat || guessCategory(p),
    stock:       p.inventoryQuantity || 99,
    cjUrl:       'https://app.cjdropshipping.com/product-detail.html?id=' + p.pid,
    sku:         p.productSku || p.sku || null,
    rating:      (4.5 + Math.round(Math.random() * 5) / 10),
    reviews:     Math.floor(60 + Math.random() * 400),
  };
}

function guessCategory(p) {
  const s = ((p.productNameEn || '') + ' ' + (p.categoryName || '')).toLowerCase();
  if (s.includes('dog') || s.includes('puppy'))                     return 'dog';
  if (s.includes('cat') || s.includes('kitten'))                    return 'cat';
  if (s.includes('bird') || s.includes('parrot'))                   return 'bird';
  if (s.includes('reptile') || s.includes('lizard') || s.includes('gecko')) return 'reptile';
  if (s.includes('fish') || s.includes('aquarium'))                 return 'fish';
  if (s.includes('hamster') || s.includes('rabbit') || s.includes('guinea')) return 'small';
  return 'dog';
}

// ── CJ SEARCH (for admin browse) ─────────────────────────────────────────────
async function cjSearch(query, page, limit) {
  const k = `cj:${query}:${page}:${limit}`;
  const cached = cGet(k);
  if (cached) return cached;
  const tok = await cjToken();
  const qs = new URLSearchParams({
    pageNum: page || 1, pageSize: Math.min(limit || 20, 50), // CJ API max is 50 per page
    productNameEn: query, productType: 'ORDINARY_PRODUCT',
  }).toString();
  console.log('[CJ] Search:', query, 'pg:', page);
  const res = await cjReq('GET', '/api2.0/v1/product/list?' + qs, null, tok);
  cSet(k, res);
  return res;
}

// ── HTTP HELPERS ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html;charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
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
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

// ── REQUEST HANDLER ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const pn      = parsed.pathname;
  const q       = parsed.query;
  const m       = req.method;
  const isAdmin = req.headers['x-admin-key'] === ADMIN_KEY;

  if (m === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  // ── GET /api/status ───────────────────────────────────────────────────────
  if (pn === '/api/status' && m === 'GET') {
    let catalogCount = 0;
    try { const [[row]] = await dbQuery('SELECT COUNT(*) AS n FROM catalog WHERE active=1'); catalogCount = row.n; } catch {}
    return jsn(res, {
      result: true,
      db: !!BRIDGE_URL || !!_db,
      cjToken: !!_cjTok && Date.now() < _cjExp,
      catalogProducts: catalogCount,
      uptime: Math.floor(process.uptime()),
    });
  }

  // ── GET /api/catalog — serve products from MySQL catalog ─────────────────
  if (pn === '/api/catalog' && m === 'GET') {
    const cat    = q.cat    || '';
    const search = q.search || '';
    const feat   = q.featured === '1';
    const page   = Math.max(1, parseInt(q.page) || 1);
    const limit  = Math.min(48, parseInt(q.limit) || 24);
    const offset = (page - 1) * limit;

    try {
      let where = 'active = 1', params = [];
      if (cat)    { where += ' AND category = ?'; params.push(cat); }
      if (search) { where += ' AND (name LIKE ? OR description LIKE ?)'; const s = '%'+search+'%'; params.push(s,s); }
      if (feat)   { where += ' AND featured = 1'; }

      const [rows]    = await dbQuery(`SELECT * FROM catalog WHERE ${where} ORDER BY featured DESC, sort_order ASC, created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
      const [[count]] = await dbQuery(`SELECT COUNT(*) AS n FROM catalog WHERE ${where}`, params);

      const products = rows.map(p => ({
        id:        p.id,
        pid:       p.cj_pid,
        cj_pid:    p.cj_pid,
        cj_vid:    p.cj_vid,
        cj_sku:    p.cj_sku,
        name:      p.name,
        image:     p.image,
        images:    p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [],
        price:     parseFloat(p.price),
        origPrice: p.orig_price ? parseFloat(p.orig_price) : null,
        category:  p.category,
        badge:     p.badge,
        featured:  !!p.featured,
        rating:    (4.5 + (parseInt(p.id, 36) % 5) / 10) || 4.7,
        reviews:   (50 + (parseInt(p.id, 36) % 400)) || 120,
        cjUrl:     'https://app.cjdropshipping.com/product-detail.html?id=' + p.cj_pid,
        description: p.description || '',
      }));

      return jsn(res, { result: true, products, total: count.n, page, limit });
    } catch (e) { return err(res, e.message); }
  }

  // ── GET /api/catalog/:id — single product ─────────────────────────────────
  const catItem = pn.match(/^\/api\/catalog\/([^/]+)$/);
  if (catItem && m === 'GET') {
    try {
      const [rows] = await dbQuery('SELECT * FROM catalog WHERE id = ? AND active = 1', [catItem[1]]);
      if (!rows.length) return err(res, 'Not found', 404);
      const p = rows[0];
      return jsn(res, { result: true, product: {
        id: p.id, pid: p.cj_pid, cj_pid: p.cj_pid, cj_vid: p.cj_vid, cj_sku: p.cj_sku,
        name: p.name, description: p.description, image: p.image,
        images: p.images ? JSON.parse(p.images) : [],
        price: parseFloat(p.price), origPrice: p.orig_price ? parseFloat(p.orig_price) : null,
        category: p.category, badge: p.badge,
        weight_g: parseInt(p.weight_g) || 100,
        cjUrl: 'https://app.cjdropshipping.com/product-detail.html?id=' + p.cj_pid,
      }});
    } catch (e) { return err(res, e.message); }
  }

  // ── GET /api/cj/search — browse CJ using keyword variations ─────────────────
  // CJ pagination returns duplicate results, so we fire multiple keyword
  // variations in parallel to get genuinely different products
  if (pn === '/api/cj/search' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const query = q.q || '';
    const cat   = q.cat || '';
    if (!query) return jsn(res, { result: true, products: [], total: 0 });
    try {
      const tok = await cjToken();
      const words = query.trim().toLowerCase().split(/\s+/);

      // Build varied search terms — CJ returns different results for different phrasings
      const termSet = new Set();
      termSet.add(query);
      // Word order variations
      if (words.length > 1) {
        termSet.add(words.slice().reverse().join(' '));
        words.forEach(w => { if (w.length > 2) termSet.add(w); });
      }
      // Common suffixes that unlock different CJ catalog sections
      const suffixes = ['', ' for pets', ' pet', ' dog', ' cat', ' small animal'];
      const hasPetWord = ['dog','cat','pet','bird','fish','hamster','rabbit','reptile'].some(w => query.includes(w));
      if (!hasPetWord) {
        suffixes.forEach(s => termSet.add(query + s));
      }
      // Use first 8 unique terms
      const terms = [...termSet].filter(Boolean).slice(0, 8);

      async function fetchTerm(term, page) {
        const qs = new URLSearchParams({
          pageNum: page, pageSize: 50,
          productNameEn: term, productType: 'ORDINARY_PRODUCT',
        }).toString();
        return cjReq('GET', '/api2.0/v1/product/list?' + qs, null, tok);
      }

      // Fire all terms page 1 + page 2 in parallel = up to 16 requests, 800 raw results
      const requests = [];
      for (const term of terms) {
        requests.push(fetchTerm(term, 1));
        requests.push(fetchTerm(term, 2));
      }
      const results = await Promise.all(requests.map(p => p.catch(() => null)));

      const seen = new Set();
      const allProducts = [];
      let total = 0;

      for (const data of results) {
        if (!data || !data.data) continue;
        if (data.data.total > total) total = data.data.total;
        for (const p of (data.data.list || [])) {
          if (seen.has(p.pid)) continue;
          seen.add(p.pid);
          allProducts.push(shapeCJProduct(p, cat || null));
        }
      }

      console.log('[CJ Browse] "'+query+'" terms:'+terms.length+' → '+allProducts.length+' unique products');
      return jsn(res, { result: true, products: allProducts, total, terms: terms.length });
    } catch (e) { console.error('[CJ Browse] error:', e.message); return err(res, e.message); }
  }

  // ── GET /api/cj/product/:pid — fetch a single CJ product detail ──────────
  const cjProd = pn.match(/^\/api\/cj\/product\/([^/]+)$/);
  if (cjProd && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const pid = cjProd[1];
    const k = 'cjpid:' + pid;
    let data = cGet(k);
    if (!data) {
      const tok = await cjToken();
      data = await cjReq('GET', '/api2.0/v1/product/query?pid=' + pid, null, tok);
      cSet(k, data, 60 * 60 * 1000);
    }
    if (!data.result || !data.data) return err(res, 'CJ product not found');
    const p = data.data;
    // Fetch variants
    let variants = [];
    try {
      const vr = await cjReq('GET', '/api2.0/v1/product/variant/query?pid=' + pid, null, await cjToken());
      variants = (vr.data && vr.data.variants) ? vr.data.variants : (Array.isArray(vr.data) ? vr.data : []);
    } catch {}
    return jsn(res, {
      result: true,
      product: shapeCJProduct(p, null),
      variants,
    });
  }

  // ── POST /api/orders ──────────────────────────────────────────────────────
  if (pn === '/api/orders' && m === 'POST') {
    const b = await body(req);
    const required = ['id','customer_name','email','phone','address','city','country_code','items'];
    const missing = required.filter(k => !b[k] || (Array.isArray(b[k]) && !b[k].length));
    if (missing.length) return err(res, 'Missing: ' + missing.join(', '), 400);

    // Enrich items with CJ PIDs from catalog if not already set
    const items = b.items || [];
    for (const item of items) {
      if (!item.cj_pid && item.id) {
        try {
          const [rows] = await dbQuery('SELECT cj_pid, cj_vid FROM catalog WHERE id = ?', [item.id]);
          if (rows.length) { item.cj_pid = rows[0].cj_pid; item.cj_vid = rows[0].cj_vid; }
        } catch {}
      }
    }

    try {
      await dbQuery(
        `INSERT INTO orders
           (id,customer_name,email,phone,address,address2,city,province,zip,
            country_code,country,items,subtotal,shipping_cost,discount,total,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        [
          b.id, b.customer_name, b.email, b.phone,
          b.address, b.address2 || '', b.city, b.province || '', b.zip || '',
          b.country_code, b.country || b.country_code,
          JSON.stringify(items),
          parseFloat(b.subtotal) || 0, parseFloat(b.shipping_cost) || 0,
          parseFloat(b.discount) || 0, parseFloat(b.total) || 0,
        ]
      );
      console.log('[Orders] Saved:', b.id, b.customer_name, '$' + b.total);
      return jsn(res, { result: true, orderId: b.id });
    } catch (e) { console.error('[Orders] Error:', e.message); return err(res, e.message); }
  }

  // ── GET /api/orders/:id ───────────────────────────────────────────────────
  const ordGet = pn.match(/^\/api\/orders\/([^/]+)$/);
  if (ordGet && m === 'GET') {
    try {
      const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ?', [ordGet[1]]);
      if (!rows.length) return err(res, 'Order not found', 404);
      const o = rows[0];
      o.items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      return jsn(res, { result: true, order: o });
    } catch (e) { return err(res, e.message); }
  }

  // ═══════════════════════════════════════════════════
  // ADMIN ROUTES
  // ═══════════════════════════════════════════════════

  if (!pn.startsWith('/api/admin/') && !pn.startsWith('/api/cj/')) {
    // handled above or falls through to static
  }

  // ── GET /api/admin/stats ──────────────────────────────────────────────────
  if (pn === '/api/admin/stats' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    try {
      const [[rev]]     = await dbQuery('SELECT COALESCE(SUM(total),0) AS v FROM orders');
      const [[total]]   = await dbQuery('SELECT COUNT(*) AS v FROM orders');
      const [[pending]] = await dbQuery('SELECT COUNT(*) AS v FROM orders WHERE status IN ("pending","processing")');
      const [[catalog]] = await dbQuery('SELECT COUNT(*) AS v FROM catalog WHERE active=1');
      return jsn(res, { result: true, revenue: parseFloat(rev.v), orders: total.v, pending: pending.v, catalog: catalog.v });
    } catch (e) { return err(res, e.message); }
  }

  // ── GET /api/admin/orders ─────────────────────────────────────────────────
  if (pn === '/api/admin/orders' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const page   = Math.max(1, parseInt(q.page) || 1);
    const limit  = Math.min(100, parseInt(q.limit) || 50);
    const offset = (page - 1) * limit;
    const status = q.status || '';
    const search = q.search || '';
    try {
      let where = '1=1', params = [];
      if (status) { where += ' AND status = ?'; params.push(status); }
      if (search) {
        where += ' AND (id LIKE ? OR customer_name LIKE ? OR email LIKE ?)';
        const s = '%' + search + '%'; params.push(s, s, s);
      }
      const [rows]    = await dbQuery(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
      const [[count]] = await dbQuery(`SELECT COUNT(*) AS n FROM orders WHERE ${where}`, params);
      rows.forEach(o => { o.items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; });
      return jsn(res, { result: true, orders: rows, total: count.n, page, limit });
    } catch (e) { return err(res, e.message); }
  }

  // ── PUT /api/admin/orders/:id ─────────────────────────────────────────────
  const adminOrd = pn.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (adminOrd && m === 'PUT') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    const allowed = ['status','tracking','tracking_url','fulfillment_error','cj_order_id'];
    const sets = [], vals = [];
    for (const k of allowed) { if (b[k] !== undefined) { sets.push(k + ' = ?'); vals.push(b[k]); } }
    if (!sets.length) return err(res, 'Nothing to update', 400);
    vals.push(adminOrd[1]);
    try { await dbQuery('UPDATE orders SET ' + sets.join(', ') + ' WHERE id = ?', vals); return jsn(res, { result: true }); }
    catch (e) { return err(res, e.message); }
  }

  // ── GET /api/admin/catalog ────────────────────────────────────────────────
  if (pn === '/api/admin/catalog' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const cat    = q.cat || '';
    const search = q.search || '';
    const page   = Math.max(1, parseInt(q.page) || 1);
    const limit  = Math.min(100, parseInt(q.limit) || 50);
    const offset = (page - 1) * limit;
    try {
      let where = '1=1', params = [];
      if (cat)    { where += ' AND category = ?'; params.push(cat); }
      if (search) { where += ' AND name LIKE ?'; params.push('%'+search+'%'); }
      const [rows]    = await dbQuery(`SELECT * FROM catalog WHERE ${where} ORDER BY featured DESC, sort_order ASC, created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
      const [[count]] = await dbQuery(`SELECT COUNT(*) AS n FROM catalog WHERE ${where}`, params);
      return jsn(res, { result: true, products: rows, total: count.n });
    } catch (e) { return err(res, e.message); }
  }

  // ── POST /api/admin/catalog — add product to catalog ─────────────────────
  if (pn === '/api/admin/catalog' && m === 'POST') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    if (!b.cj_pid) return err(res, 'cj_pid required', 400);
    if (!b.name)   return err(res, 'name required', 400);
    const id = 'cat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    // Auto-fetch variant SKU from CJ if not provided
    let cj_sku  = b.cj_sku  || null;
    let cj_vid  = b.cj_vid  || null;
    let images  = b.images  || [];

    try {
      const tok = await cjToken();

      // Fetch variants to get the orderable SKU
      const vr = await cjReq('GET', '/api2.0/v1/product/variant/query?pid=' + b.cj_pid, null, tok);
      const variants = (vr.data && vr.data.variants)
        ? vr.data.variants
        : (Array.isArray(vr.data) ? vr.data : []);

      if (variants.length > 0) {
        const first = variants[0];
        console.log('[Catalog] First variant fields:', JSON.stringify(first).substring(0, 400));
        // Try all known CJ variant SKU field names
        cj_sku = first.variantSku || first.sku || first.skuCode || first.productSku || first.variantCode || cj_sku;
        cj_vid = first.vid || first.variantId || first.id || cj_vid;
        console.log('[Catalog] PID', b.cj_pid, '→ variant SKU:', cj_sku, 'VID:', cj_vid, '('+variants.length+' variants)');
      } else {
        // No variants returned — use product SKU + "-default" suffix
        if (cj_sku && !cj_sku.includes('-')) {
          cj_sku = cj_sku + '-default';
        }
        console.log('[Catalog] PID', b.cj_pid, '→ no variants, SKU:', cj_sku);
      }

      // Also fetch product images if not provided
      if (!images.length) {
        const pr = await cjReq('GET', '/api2.0/v1/product/query?pid=' + b.cj_pid, null, tok);
        if (pr.data && pr.data.productImages) {
          images = pr.data.productImages;
        }
      }
    } catch (e) {
      console.warn('[Catalog] Variant fetch failed for', b.cj_pid, ':', e.message);
      // Still save the product — just without variant SKU
    }

    try {
      await dbQuery(
        `INSERT INTO catalog (id,cj_pid,cj_vid,cj_sku,name,description,image,images,category,price,orig_price,wholesale,badge,featured,active,weight_g,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [
          id, b.cj_pid, cj_vid, cj_sku, b.name, b.description || null,
          b.image || null, images.length ? JSON.stringify(images) : null,
          b.category || 'dog',
          parseFloat(b.price) || 0,
          b.orig_price ? parseFloat(b.orig_price) : null,
          b.wholesale ? parseFloat(b.wholesale) : null,
          b.badge || null,
          b.featured ? 1 : 0,
          parseInt(b.weight_g) || 100,
          parseInt(b.sort_order) || 0,
        ]
      );
      return jsn(res, { result: true, id, cj_sku, cj_vid });
    } catch (e) { return err(res, e.message); }
  }

  // ── PUT /api/admin/catalog/:id ────────────────────────────────────────────
  const catAdmin = pn.match(/^\/api\/admin\/catalog\/([^/]+)$/);
  if (catAdmin && m === 'PUT') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    const allowed = ['name','description','image','category','price','orig_price','badge','featured','active','sort_order','cj_vid','cj_sku','weight_g'];
    const sets = [], vals = [];
    for (const k of allowed) { if (b[k] !== undefined) { sets.push(k + ' = ?'); vals.push(b[k]); } }
    if (!sets.length) return err(res, 'Nothing to update', 400);
    vals.push(catAdmin[1]);
    try { await dbQuery('UPDATE catalog SET ' + sets.join(', ') + ' WHERE id = ?', vals); return jsn(res, { result: true }); }
    catch (e) { return err(res, e.message); }
  }

  // ── DELETE /api/admin/catalog/:id ─────────────────────────────────────────
  if (catAdmin && m === 'DELETE') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    try {
      await dbQuery('DELETE FROM catalog WHERE id = ?', [catAdmin[1]]);
      console.log('[Catalog] Deleted product:', catAdmin[1]);
      return jsn(res, { result: true });
    }
    catch (e) { return err(res, e.message); }
  }

  // ── GET /api/admin/settings ───────────────────────────────────────────────
  if (pn === '/api/admin/settings' && m === 'GET') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    try {
      const [rows] = await dbQuery('SELECT k, v FROM settings');
      const out = {};
      rows.forEach(r => { out[r.k] = r.v; });
      return jsn(res, { result: true, settings: out });
    } catch (e) { return err(res, e.message); }
  }

  // ── POST /api/admin/settings ──────────────────────────────────────────────
  if (pn === '/api/admin/settings' && m === 'POST') {
    if (!isAdmin) return err(res, 'Unauthorized', 401);
    const b = await body(req);
    try {
      for (const [k, v] of Object.entries(b)) {
        await dbQuery('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=?, ts=NOW()', [k, String(v), String(v)]);
      }
      return jsn(res, { result: true });
    } catch (e) { return err(res, e.message); }
  }

  // ── STATIC FILE SERVER ─────────────────────────────────────────────────────
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
  try { await initTables(); } catch (e) { console.error('[DB] Init failed:', e.message); }
  server.listen(PORT, async () => {
    console.log('\n🐾 Crittrly v4 — http://localhost:' + PORT);
    console.log('   DB:     ' + DB_NAME + ' @ ' + (BRIDGE_URL ? 'bridge' : DB_HOST));
    console.log('   Static: ' + STATIC_DIR + '\n');
    try { await cjToken(); } catch (e) { console.warn('[CJ]', e.message); }
  });
  server.on('error', e => console.error('Server error:', e.message));
}

start();
