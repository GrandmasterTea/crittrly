/* CRITTRLY v3 — home.js — CJ live images with fallback */

const SERVER = window.location.port === '3000'
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

let _serverUp = null; // null=unknown, true/false
let _homeCache = {};
let _homeFilter = 'all';

async function checkServer() {
  if (_serverUp !== null) return _serverUp;
  try {
    const r = await fetch(`${SERVER}/api/status`, { signal: AbortSignal.timeout(2500) });
    const d = await r.json();
    _serverUp = d.result === true;
  } catch { _serverUp = false; }
  return _serverUp;
}

function filterHome(btn, cat) {
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _homeFilter = cat;
  renderHomeProducts();
}

function skeletonCards(n) {
  return Array(n).fill(0).map(() => `
    <div class="product-card product-skeleton">
      <div class="product-img-wrap" style="aspect-ratio:1"></div>
      <div class="product-body">
        <div class="sk-line w60"></div>
        <div class="sk-line w80"></div>
        <div class="sk-line w60"></div>
      </div>
    </div>`).join('');
}

async function renderHomeProducts() {
  const grid = document.getElementById('homeGrid');
  if (!grid) return;

  grid.innerHTML = skeletonCards(8);

  const up = await checkServer();

  if (up) {
    const cached = _homeCache[_homeFilter];
    let products = cached;
    if (!products) {
      try {
        const r = await fetch(`${SERVER}/api/pet-products?pet=${_homeFilter}&limit=8`);
        const d = await r.json();
        products = d.result ? d.products : null;
        if (products) _homeCache[_homeFilter] = products;
      } catch { products = null; }
    }
    if (products && products.length > 0) {
      const cat = _homeFilter === 'all' ? null : _homeFilter;
      grid.innerHTML = products.map((p, i) =>
        `<div style="animation:fadeUp .45s ${i * .055}s both">${renderCJCard({ ...p, category: cat || p.category || 'dog' })}</div>`
      ).join('');
      return;
    }
  }

  // fallback: local data
  let prods = getProducts();
  if (_homeFilter !== 'all') prods = prods.filter(p => p.category === _homeFilter);
  prods = prods.sort((a, b) => ({ hot: 0, top: 1, sale: 2, new: 3 }[a.badge] ?? 4) - ({ hot: 0, top: 1, sale: 2, new: 3 }[b.badge] ?? 4)).slice(0, 8);
  grid.innerHTML = prods.map((p, i) =>
    `<div style="animation:fadeUp .45s ${i * .055}s both">${renderProductCard(p)}</div>`
  ).join('');
}

// Add fadeUp animation
const _style = document.createElement('style');
_style.textContent = '@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}';
document.head.appendChild(_style);

document.addEventListener('DOMContentLoaded', renderHomeProducts);
