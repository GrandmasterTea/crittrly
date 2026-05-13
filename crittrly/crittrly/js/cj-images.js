/**
 * Crittrly — CJ Live Image Loader
 * Replaces emoji placeholders with real CJ product images
 * when the proxy server is running at localhost:3000
 */

const CJ = (function() {
  const SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:3000`
    : window.location.origin; // same-origin when deployed

  const PET_KEYWORDS = {
    dog:     'dog',
    cat:     'cat',
    bird:    'bird',
    reptile: 'reptile',
    fish:    'fish',
    small:   'small',
    all:     'all',
  };

  // In-memory image cache (pid → imageUrl)
  const imgCache = {};

  // ── FETCH REAL PRODUCTS FOR A PET CATEGORY ──────────────────────────────
  async function fetchPetProducts(pet = 'all', page = 1, limit = 12) {
    try {
      const r = await fetch(`${SERVER}/api/pet-products?pet=${pet}&page=${page}&limit=${limit}`);
      if (!r.ok) throw new Error('Server ' + r.status);
      const data = await r.json();
      if (!data.result) throw new Error(data.message);
      // Cache images
      (data.products || []).forEach(p => {
        if (p.pid && p.image) imgCache[p.pid] = p.image;
      });
      return data.products || [];
    } catch (e) {
      console.warn('[CJ] fetchPetProducts failed:', e.message, '— using local data');
      return null; // signals to caller: fall back to localStorage products
    }
  }

  // ── FETCH SEARCH RESULTS ─────────────────────────────────────────────────
  async function searchProducts(query, opts = {}) {
    const params = new URLSearchParams({
      q: query,
      page: opts.page || 1,
      limit: opts.limit || 20,
      ...(opts.min ? { min: opts.min } : {}),
      ...(opts.max ? { max: opts.max } : {}),
    });
    try {
      const r = await fetch(`${SERVER}/api/products/search?${params}`);
      if (!r.ok) throw new Error('Server ' + r.status);
      const data = await r.json();
      return data.products || [];
    } catch (e) {
      console.warn('[CJ] search failed:', e.message);
      return null;
    }
  }

  // ── GET SINGLE PRODUCT DETAIL ────────────────────────────────────────────
  async function getProduct(pid) {
    try {
      const r = await fetch(`${SERVER}/api/products/${pid}`);
      if (!r.ok) throw new Error('Server ' + r.status);
      const data = await r.json();
      return data.product || null;
    } catch (e) {
      console.warn('[CJ] getProduct failed:', e.message);
      return null;
    }
  }

  // ── CHECK IF SERVER IS REACHABLE ──────────────────────────────────────────
  async function isServerUp() {
    try {
      const r = await fetch(`${SERVER}/api/status`, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      return data.result === true;
    } catch { return false; }
  }

  // ── RENDER PRODUCT CARD WITH REAL IMAGE ──────────────────────────────────
  function renderCJCard(p) {
    const wishlisted = typeof isWishlisted === 'function' ? isWishlisted(p.pid) : false;
    const savings = p.origPrice && p.origPrice > p.price
      ? ((1 - p.price / p.origPrice) * 100).toFixed(0) : null;
    const imgHtml = p.image
      ? `<img src="${escHtml(p.image)}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const fallbackEmoji = PET_EMOJI[p.category] || '📦';

    return `
      <div class="product-card" data-pid="${p.pid}" data-cat="${p.category || ''}">
        <div class="product-img-wrap" style="background:#f7f4ef;padding:0;position:relative;">
          ${imgHtml}
          <span style="font-size:4rem;display:${p.image ? 'none' : 'flex'};align-items:center;justify-content:center;width:100%;height:100%;">${fallbackEmoji}</span>
          ${savings ? `<span class="p-badge sale">${savings}% off</span>` : ''}
          <button class="p-wishlist ${wishlisted ? 'active' : ''}" data-wishlist="${p.pid}" onclick="event.stopPropagation();toggleCJWishlist('${p.pid}','${escHtml(p.name)}',${p.price},'${escHtml(p.image||'')}','${p.category||''}')">
            ${wishlisted ? '♥' : '♡'}
          </button>
          <button class="p-quickview" onclick="openCJQuickView('${p.pid}')">Quick View</button>
        </div>
        <div class="product-body">
          <div class="product-category">${p.category || p.categoryName || 'Pet Supply'}</div>
          <div class="product-name">${escHtml(truncate(p.name, 55))}</div>
          <div class="product-rating">
            <span class="stars">${starStr(p.rating || 4.7)}</span>
            <span class="rating-count">${(p.rating || 4.7).toFixed(1)} (${p.reviews || Math.floor(50+Math.random()*300)})</span>
          </div>
          <div class="product-footer">
            <div class="product-price">
              <span class="price-main">$${p.price.toFixed(2)}</span>
              ${p.origPrice && p.origPrice > p.price ? `<span class="price-orig">$${p.origPrice.toFixed(2)}</span>` : ''}
            </div>
            <button class="btn-add" onclick="addCJToCart('${p.pid}','${escHtml(p.name)}',${p.price},'${escHtml(p.image||'')}','${p.category||''}')">
              + Add
            </button>
          </div>
        </div>
      </div>`;
  }

  // ── QUICK VIEW MODAL ─────────────────────────────────────────────────────
  async function openCJQuickView(pid) {
    const overlay = document.getElementById('quickViewOverlay');
    const modal = document.getElementById('quickViewModal');
    if (!modal) return;

    // Show loading state immediately
    modal.innerHTML = `
      <button class="qv-close" onclick="closeQuickView()">✕</button>
      <div style="display:flex;align-items:center;justify-content:center;min-height:300px;">
        <div style="text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:14px;animation:spin 1s linear infinite;">⏳</div>
          <div style="font-size:.85rem;color:var(--muted);">Loading product...</div>
        </div>
      </div>`;
    overlay?.classList.add('open');
    modal?.classList.add('open');

    const p = await getProduct(pid);
    if (!p) {
      modal.innerHTML = `<button class="qv-close" onclick="closeQuickView()">✕</button>
        <div style="padding:40px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:12px;">😕</div>
          <p>Couldn't load product details. <a href="#" onclick="closeQuickView()" style="color:var(--orange)">Close</a></p>
        </div>`;
      return;
    }

    const thumbs = (p.images && p.images.length > 0 ? p.images : [p.image]).filter(Boolean);
    modal.innerHTML = `
      <button class="qv-close" onclick="closeQuickView()">✕</button>
      <div class="qv-inner">
        <div>
          <div class="qv-img" style="padding:0;overflow:hidden;background:#f0f0f0;">
            ${thumbs[0] ? `<img id="qvMainImg" src="${escHtml(thumbs[0])}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:5rem;">${PET_EMOJI[p.category] || '📦'}</span>`}
          </div>
          ${thumbs.length > 1 ? `
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            ${thumbs.slice(0,5).map((img,i) => `
              <img src="${escHtml(img)}" alt="view ${i+1}" onclick="document.getElementById('qvMainImg').src='${escHtml(img)}'"
                style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:2px solid var(--border);cursor:pointer;transition:border-color .2s;"
                onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'">
            `).join('')}
          </div>` : ''}
        </div>
        <div class="qv-info">
          <div class="product-category">${p.categoryName || p.category || 'Pet Supply'}</div>
          <h2 style="font-family:'Unbounded',sans-serif;font-size:1rem;font-weight:900;margin-bottom:10px;line-height:1.3;">${escHtml(p.name)}</h2>
          <div class="product-rating" style="margin-bottom:14px;">
            <span class="stars">${starStr(4.7)}</span>
            <span class="rating-count">4.7 (${Math.floor(80 + Math.random()*300)} reviews)</span>
          </div>
          <div style="font-family:'Unbounded',sans-serif;font-size:1.5rem;font-weight:900;color:var(--ink);margin-bottom:16px;">$${p.price.toFixed(2)}</div>
          <div style="font-size:.82rem;color:var(--muted);line-height:1.7;margin-bottom:20px;max-height:100px;overflow:hidden;">${p.description ? p.description.replace(/<[^>]*>/g,'').substring(0,200) + '…' : p.name}</div>
          <div style="font-size:.72rem;color:${(p.stock||99)>10?'var(--green)':'var(--red)'};font-weight:700;margin-bottom:16px;">
            ${(p.stock||99)>10 ? '✓ In Stock' : (p.stock||99)===0 ? '✗ Out of Stock' : `⚠ Only ${p.stock} left`}
          </div>
          <button class="btn-primary" style="width:100%;justify-content:center;margin-bottom:10px;"
            onclick="addCJToCart('${p.pid}','${escHtml(p.name.replace(/'/g,"\\'"))}',${p.price},'${escHtml(p.image||'')}','${p.category||''}');closeQuickView();">
            Add to Cart →
          </button>
        </div>
      </div>`;
  }

  // ── CART HELPERS FOR CJ PRODUCTS ─────────────────────────────────────────
  window.addCJToCart = function(pid, name, price, image, category) {
    const cart = getCart ? getCart() : [];
    const existing = cart.find(x => x.id === pid);
    if (existing) { existing.qty++; }
    else { cart.push({ id: pid, name, emoji: PET_EMOJI[category] || '📦', image, price, category, qty: 1 }); }
    if (typeof saveCart === 'function') saveCart(cart);
    if (typeof showToast === 'function') showToast(`🐾 "${truncate(name,30)}" added to cart!`);
  };

  window.toggleCJWishlist = function(pid, name, price, image, category) {
    const w = getWishlist ? getWishlist() : [];
    const idx = w.indexOf(pid);
    if (idx >= 0) { w.splice(idx, 1); showToast && showToast('💔 Removed from wishlist'); }
    else { w.push(pid); showToast && showToast('❤️ Saved to wishlist!'); }
    if (typeof saveWishlist === 'function') saveWishlist(w);
    document.querySelectorAll(`[data-wishlist="${pid}"]`).forEach(b => {
      b.classList.toggle('active', w.includes(pid));
      b.textContent = w.includes(pid) ? '♥' : '♡';
    });
  };

  window.openCJQuickView = openCJQuickView;

  // ── UTILITIES ─────────────────────────────────────────────────────────────
  const PET_EMOJI = { dog:'🐕', cat:'🐈', bird:'🦜', reptile:'🦎', fish:'🐠', small:'🐹' };

  function escHtml(str) {
    return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function truncate(str, n) { return str && str.length > n ? str.substring(0, n) + '…' : (str||''); }
  function starStr(r) {
    const full = Math.floor(r); const half = r % 1 >= 0.5;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half?1:0));
  }

  // Public API
  return { fetchPetProducts, searchProducts, getProduct, isServerUp, renderCJCard, PET_EMOJI };
})();

// Add spin animation for loading state
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(spinStyle);
