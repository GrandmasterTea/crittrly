/* ═══════════════════════════════════════
   CRITTRLY — Shared Data & State (data.js)
   ═══════════════════════════════════════ */

// ── DEFAULT PRODUCTS (seeded into localStorage if empty) ──
const DEFAULT_PRODUCTS = [
  {id:'dog001',name:'Interactive Puzzle Feeder',category:'dog',type:'toys',emoji:'🧩',price:22.99,orig:34.99,rating:4.9,reviews:312,badge:'hot',stock:47,description:'Mental stimulation toy that makes mealtime fun. Adjustable difficulty levels. BPA-free, dishwasher safe.',cjdSku:'CJD-DOG-PZL-001',bg:'#fff5f0'},
  {id:'dog002',name:'Memory Foam Ortho Dog Bed',category:'dog',type:'beds',emoji:'🛏️',price:49.99,orig:79.99,rating:4.8,reviews:198,badge:'sale',stock:23,description:'Premium memory foam support for joints. Machine-washable cover. Available in multiple sizes.',cjdSku:'CJD-DOG-BED-002',bg:'#f0f5ff'},
  {id:'dog003',name:'Braided Rope Tug Toy Set (3pk)',category:'dog',type:'toys',emoji:'🪢',price:14.99,orig:null,rating:4.7,reviews:445,badge:'new',stock:89,description:'Durable braided cotton ropes. Set of 3 sizes. Great for tug-of-war and fetch. Cleans teeth naturally.',cjdSku:'CJD-DOG-TOY-003',bg:'#f0fff5'},
  {id:'dog004',name:'6-Meal Auto Pet Feeder',category:'dog',type:'feeders',emoji:'🍽️',price:28.99,orig:42.99,rating:4.9,reviews:401,badge:'hot',stock:34,description:'Program up to 6 meals per day. Portion-control display. Works with all dry kibble. App-controlled.',cjdSku:'CJD-DOG-FDR-004',bg:'#f5fff0'},
  {id:'dog005',name:'Retractable Dog Leash 16ft',category:'dog',type:'accessories',emoji:'🦮',price:18.99,orig:26.00,rating:4.6,reviews:267,badge:'sale',stock:56,description:'16-foot retractable nylon leash. One-button brake and lock. Ergonomic anti-slip handle. Up to 55 lbs.',cjdSku:'CJD-DOG-LSH-005',bg:'#fff8f0'},
  {id:'dog006',name:'Dog GPS Tracker & Collar',category:'dog',type:'health',emoji:'📡',price:39.99,orig:59.99,rating:4.7,reviews:134,badge:'top',stock:18,description:'Real-time GPS tracking. Waterproof. 7-day battery. Activity monitoring. Fits necks 10"–26".',cjdSku:'CJD-DOG-GPS-006',bg:'#f0f8ff'},
  {id:'cat001',name:'Cat Window Hammock Perch',category:'cat',type:'beds',emoji:'🪟',price:28.99,orig:42.00,rating:4.9,reviews:287,badge:'hot',stock:41,description:'Suction-cup window mount. Holds up to 30 lbs. Cozy sherpa cover. Easy install — no tools needed.',cjdSku:'CJD-CAT-HAM-001',bg:'#fff0f5'},
  {id:'cat002',name:'Self-Cleaning Litter Box',category:'cat',type:'health',emoji:'🚽',price:89.99,orig:120.00,rating:4.8,reviews:156,badge:'top',stock:12,description:'Auto-rake after each use. Odor-control carbon filter. Fits all litter types. Accommodates cats up to 15 lbs.',cjdSku:'CJD-CAT-LIT-002',bg:'#f5f0ff'},
  {id:'cat003',name:'Feather Wand Interactive Toy',category:'cat',type:'toys',emoji:'🪄',price:11.99,orig:null,rating:4.6,reviews:523,badge:'new',stock:102,description:'3-foot flexible wand with feather and bell. Mimics bird movement. Refill feathers sold separately.',cjdSku:'CJD-CAT-WND-003',bg:'#fffff0'},
  {id:'cat004',name:'7-Tier Cat Tree Tower',category:'cat',type:'beds',emoji:'🏰',price:74.99,orig:99.99,rating:4.7,reviews:189,badge:'sale',stock:8,description:'Multi-level activity center. Sisal scratching posts, hammock, and top perch. Easy assembly.',cjdSku:'CJD-CAT-TRE-004',bg:'#f0fff8'},
  {id:'cat005',name:'Automatic Laser Cat Toy',category:'cat',type:'toys',emoji:'🔴',price:19.99,orig:29.99,rating:4.5,reviews:341,badge:'sale',stock:67,description:'Random pattern laser keeps cats engaged. 3 speed modes. Auto-shutoff after 15 min. USB chargeable.',cjdSku:'CJD-CAT-LSR-005',bg:'#fff5fc'},
  {id:'bird001',name:'Spacious Bird Cage with Stand',category:'bird',type:'accessories',emoji:'🏠',price:64.99,orig:95.00,rating:4.7,reviews:89,badge:'sale',stock:14,description:'32" x 18" cage with powder-coat finish. 4 feeder cups, 2 perches. Rolling stand with storage shelf.',cjdSku:'CJD-BRD-CGE-001',bg:'#f0fff0'},
  {id:'bird002',name:'Natural Wood Bird Perch Set',category:'bird',type:'accessories',emoji:'🌿',price:18.99,orig:null,rating:4.5,reviews:167,badge:'new',stock:76,description:'Set of 3 natural wood perches. Varied diameters promote foot health. Non-toxic, chemical-free.',cjdSku:'CJD-BRD-PRC-002',bg:'#fff8f0'},
  {id:'bird003',name:'Bird Foraging Toy Bundle',category:'bird',type:'toys',emoji:'🎪',price:22.99,orig:32.99,rating:4.6,reviews:98,badge:'hot',stock:33,description:'5-piece enrichment bundle. Shreddable, puzzle, and swing toys. Stimulates natural foraging instincts.',cjdSku:'CJD-BRD-TOY-003',bg:'#fffbf0'},
  {id:'reptile001',name:'20-Gallon Glass Terrarium',category:'reptile',type:'accessories',emoji:'🪴',price:74.99,orig:110.00,rating:4.8,reviews:72,badge:'sale',stock:9,description:'Hinged front-opening doors. Waterproof base. Ventilated screen top. Compatible with all reptile lighting.',cjdSku:'CJD-REP-TER-001',bg:'#f0f8ff'},
  {id:'reptile002',name:'Reptile Ceramic Heat Lamp',category:'reptile',type:'health',emoji:'💡',price:24.99,orig:null,rating:4.6,reviews:134,badge:'new',stock:45,description:'100W ceramic heat emitter. No light emission — no disruption to night cycles. Lasts 10,000+ hours.',cjdSku:'CJD-REP-HET-002',bg:'#fff5f0'},
  {id:'reptile003',name:'Digital Reptile Thermometer',category:'reptile',type:'health',emoji:'🌡️',price:16.99,orig:22.00,rating:4.7,reviews:88,badge:'sale',stock:54,description:'Dual-zone thermometer with probe. LCD display. Min/max memory. Suction-cup mount included.',cjdSku:'CJD-REP-THM-003',bg:'#f0fff8'},
  {id:'fish001',name:'Planted Aquarium Starter Kit',category:'fish',type:'accessories',emoji:'🐟',price:54.99,orig:79.99,rating:4.7,reviews:93,badge:'sale',stock:17,description:'10-gallon glass tank with LED lighting, quiet filter, heater, and thermometer. Perfect for beginners.',cjdSku:'CJD-FSH-TNK-001',bg:'#f0f5ff'},
  {id:'fish002',name:'Aquarium LED Light Strip',category:'fish',type:'accessories',emoji:'💎',price:22.99,orig:34.99,rating:4.6,reviews:145,badge:'hot',stock:62,description:'Full-spectrum LED strip with timer and dimmer. 24-hour cycle mode. Waterproof. Up to 48" tanks.',cjdSku:'CJD-FSH-LED-002',bg:'#f8f0ff'},
  {id:'small001',name:'Hamster Wheel Silent Spinner',category:'small',type:'toys',emoji:'🌀',price:12.99,orig:18.99,rating:4.8,reviews:289,badge:'hot',stock:91,description:'Whisper-quiet ball-bearing wheel. 8.5" diameter — fits hamsters, gerbils, and mice. No loose parts.',cjdSku:'CJD-SML-WHL-001',bg:'#fff0fb'},
];

// ── STORAGE HELPERS ──
const STORAGE_KEYS = {
  products: 'crittrly_products',
  cart: 'crittrly_cart',
  wishlist: 'crittrly_wishlist',
  orders: 'crittrly_orders',
  customers: 'crittrly_customers',
  settings: 'crittrly_settings',
};

function getStorage(key, fallback = null) {
  try {
    const val = localStorage.getItem(STORAGE_KEYS[key] || key);
    return val ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(STORAGE_KEYS[key] || key, JSON.stringify(value));
  } catch(e) { console.warn('Storage error:', e); }
}

// ── INITIALIZE PRODUCTS ──
function initProducts() {
  let products = getStorage('products', null);
  if (!products || products.length === 0) {
    setStorage('products', DEFAULT_PRODUCTS);
    return DEFAULT_PRODUCTS;
  }
  return products;
}

function getProducts() { return getStorage('products', DEFAULT_PRODUCTS); }
function saveProducts(products) { setStorage('products', products); }

function getProductById(id) {
  return getProducts().find(p => p.id === id) || null;
}

// ── ORDERS ──
const DEFAULT_ORDERS = [
  {id:'ORD-1001',customer:'Jessica M.',email:'jessica@example.com',items:[{id:'dog001',name:'Interactive Puzzle Feeder',qty:1,price:22.99}],total:22.99,status:'delivered',date:'2025-05-02',tracking:'CJ123456789US'},
  {id:'ORD-1002',customer:'Rachel P.',email:'rachel@example.com',items:[{id:'cat001',name:'Cat Window Hammock',qty:2,price:28.99}],total:57.98,status:'shipped',date:'2025-05-05',tracking:'CJ987654321US'},
  {id:'ORD-1003',customer:'Dan K.',email:'dan@example.com',items:[{id:'dog004',name:'6-Meal Auto Pet Feeder',qty:1,price:28.99},{id:'dog001',name:'Interactive Puzzle Feeder',qty:1,price:22.99}],total:51.98,status:'processing',date:'2025-05-07',tracking:null},
  {id:'ORD-1004',customer:'Sam L.',email:'sam@example.com',items:[{id:'reptile002',name:'Reptile Ceramic Heat Lamp',qty:1,price:24.99}],total:24.99,status:'pending',date:'2025-05-08',tracking:null},
  {id:'ORD-1005',customer:'Amara T.',email:'amara@example.com',items:[{id:'bird001',name:'Spacious Bird Cage',qty:1,price:64.99}],total:64.99,status:'shipped',date:'2025-05-04',tracking:'CJ555555555US'},
];

function getOrders() { return getStorage('orders', DEFAULT_ORDERS); }
function saveOrders(orders) { setStorage('orders', orders); }

// ── SETTINGS ──
const DEFAULT_SETTINGS = {
  storeName: 'Crittrly',
  tagline: 'Premium Finds for Remarkable Pets',
  email: 'hello@crittrly.com',
  freeShipThreshold: 35,
  cjdApiKey: 'CJ5405524@api@1184c51994b8447889809d80e70464a6',
  stripeKey: '',
  taxRate: 0,
  currency: 'USD',
};
function getSettings() { return getStorage('settings', DEFAULT_SETTINGS); }
function saveSettings(s) { setStorage('settings', s); }

// ── GENERATE IDs ──
function genId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
}

// ── FORMAT CURRENCY ──
function formatPrice(n) {
  return '$' + parseFloat(n).toFixed(2);
}

// ── INIT ON LOAD ──
initProducts();

// Ensure CJD API key is seeded into settings on first load
(function initSettings() {
  const existing = getStorage('settings', null);
  if (!existing || !existing.cjdApiKey) {
    const merged = Object.assign({}, DEFAULT_SETTINGS, existing || {});
    setStorage('settings', merged);
  }
})();
