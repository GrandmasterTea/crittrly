/* ═══════════════════════════════════════
   CRITTRLY v3 — cart.js
   ═══════════════════════════════════════ */
let _toastTimer;
function showToast(msg,type){const t=document.getElementById('toast'),m=document.getElementById('toastMsg'),d=document.getElementById('toastDot');if(!t||!m)return;if(d)d.className='toast-dot'+(type==='error'?' err':'');m.textContent=msg;t.classList.add('show');clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>t.classList.remove('show'),3200);}

function getCart(){return getStorage('cart',[]);}
function saveCart(c){setStorage('cart',c);updateCartCount();}
function getCartTotal(){return getCart().reduce((s,x)=>s+x.price*x.qty,0);}
function getCartCount(){return getCart().reduce((s,x)=>s+x.qty,0);}

function addToCart(id,qty){
  qty=qty||1;
  const p=getProductById(id);if(!p)return;
  const cart=getCart(),ex=cart.find(x=>x.id===id);
  if(ex){ex.qty=Math.min(ex.qty+qty,99);}
  else{cart.push({id,name:p.name,emoji:p.emoji,image:p.image||null,price:p.price,qty});}
  saveCart(cart);showToast('Added to bag — '+p.name.substring(0,32));
}
function addToCartById(id){addToCart(id,1);}
function removeFromCart(id){saveCart(getCart().filter(x=>x.id!==id));renderCartBody();}
function changeQty(id,delta){
  const cart=getCart(),item=cart.find(x=>x.id===id);if(!item)return;
  item.qty+=delta;if(item.qty<=0){removeFromCart(id);return;}
  saveCart(cart);renderCartBody();
}
function updateCartCount(){
  const n=getCartCount();
  const el=document.getElementById('cartCount');if(el)el.textContent=n;
}

function openCart(){document.getElementById('cartOverlay')?.classList.add('open');document.getElementById('cartDrawer')?.classList.add('open');document.body.style.overflow='hidden';renderCartBody();}
function closeCart(){document.getElementById('cartOverlay')?.classList.remove('open');document.getElementById('cartDrawer')?.classList.remove('open');document.body.style.overflow='';}

function renderCartBody(){
  const body=document.getElementById('cartBody'),foot=document.getElementById('cartFoot');if(!body)return;
  const cart=getCart(),settings=getSettings();
  if(!cart.length){
    body.innerHTML=`<div class="cart-empty"><span class="cart-empty-icon">🛍️</span><h4>Your bag is empty</h4><p>Add something for your critters!</p></div>`;
    if(foot)foot.innerHTML='';return;
  }
  body.innerHTML=cart.map(item=>{
    const imgHtml=item.image?`<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:item.emoji;
    return `<div class="cart-item">
      <div class="cart-item-img">${imgHtml}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price*item.qty)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
          <button class="cart-remove" onclick="removeFromCart('${item.id}')">Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const total=getCartTotal(),threshold=settings.freeShipThreshold||35,remaining=threshold-total;
  if(foot)foot.innerHTML=`
    <div class="cart-subtotal"><span>Subtotal (${getCartCount()} items)</span><strong>${formatPrice(total)}</strong></div>
    <div class="cart-ship">${remaining<=0?'✓ Free shipping on this order!':'Add '+formatPrice(remaining)+' more for free shipping'}</div>
    <button class="btn-checkout" onclick="window.location.href='checkout.html'">Checkout →</button>
    <button class="btn-shop-more" onclick="closeCart()">Continue Shopping</button>`;
}

function getWishlist(){return getStorage('wishlist',[]);}
function saveWishlist(w){setStorage('wishlist',w);updateWishlistCount();}
function isWishlisted(id){return getWishlist().includes(id);}
function updateWishlistCount(){const el=document.getElementById('wishlistCount');if(el){const n=getWishlist().length;el.className='nav-dot'+(n>0?' has-items':'');}}
function toggleWishlist(id){
  const p=getProductById(id);if(!p)return;
  const w=getWishlist(),idx=w.indexOf(id);
  if(idx>=0){w.splice(idx,1);showToast('Removed from wishlist');}
  else{w.push(id);showToast('❤️ Saved to wishlist!');}
  saveWishlist(w);
  document.querySelectorAll(`[data-wishlist="${id}"]`).forEach(btn=>{btn.classList.toggle('active',w.includes(id));btn.textContent=w.includes(id)?'♥':'♡';});
}

let _searchOpen=false;
function toggleSearch(){_searchOpen=!_searchOpen;document.getElementById('searchBar')?.classList.toggle('open',_searchOpen);if(_searchOpen)setTimeout(()=>document.getElementById('siteSearch')?.focus(),50);}
function handleSearch(q){
  const res=document.getElementById('searchResults');if(!res)return;
  if(!q.trim()){res.innerHTML='';return;}
  const matches=getProducts().filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.category.toLowerCase().includes(q.toLowerCase())).slice(0,6);
  if(!matches.length){res.innerHTML=`<div style="padding:10px 4px;font-size:.82rem;color:var(--muted2)">No results for "${q}"</div>`;return;}
  res.innerHTML=matches.map(p=>{
    const imgHtml=p.image?`<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:p.emoji;
    return `<div class="search-item" onclick="window.location.href='product.html?id=${p.id}'">
      <div class="search-item-img">${imgHtml}</div>
      <div><div class="search-item-name">${p.name}</div><div class="search-item-price">${formatPrice(p.price)}</div></div>
    </div>`;
  }).join('');
}
function doSearch(){const q=document.getElementById('siteSearch')?.value;if(q)window.location.href=`shop.html?search=${encodeURIComponent(q)}`;}

function subscribeNewsletter(){
  const email=document.getElementById('nlEmail')?.value;
  if(!email||!email.includes('@')){showToast('Enter a valid email address','error');return;}
  showToast('🎉 Welcome! Check your inbox for 15% off.');
  if(document.getElementById('nlEmail'))document.getElementById('nlEmail').value='';
}

function productImg(p){
  if(p.image)return`<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="product-emoji-fallback" style="display:none">${p.emoji}</span>`;
  return`<span class="product-emoji-fallback">${p.emoji}</span>`;
}

function renderProductCard(p){
  const wishlisted=isWishlisted(p.id);
  const badgeLabels={hot:'Best Seller',new:'New',sale:'Sale',top:'Top Pick'};
  const imgBg=p.image?'':'background:var(--cream2)';
  return`<div class="product-card" data-id="${p.id}">
    <div class="product-img-wrap" style="${imgBg}">
      ${productImg(p)}
      ${p.badge?`<span class="product-badge ${p.badge}">${badgeLabels[p.badge]||p.badge}</span>`:''}
      <button class="product-wish${wishlisted?' active':''}" data-wishlist="${p.id}" onclick="event.stopPropagation();toggleWishlist('${p.id}')">${wishlisted?'♥':'♡'}</button>
      <button class="product-qv" onclick="openQuickView('${p.id}')">Quick View</button>
    </div>
    <div class="product-body">
      <div class="product-cat">${p.category}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-rating">
        <span class="stars">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5-Math.floor(p.rating))}</span>
        <span class="rating-count">${p.rating} (${p.reviews})</span>
      </div>
      <div class="product-footer">
        <div class="product-price">
          <span class="price-now">${formatPrice(p.price)}</span>
          ${p.orig?`<span class="price-was">${formatPrice(p.orig)}</span>`:''}
        </div>
        <button class="btn-add" onclick="addToCart('${p.id}')" ${p.stock===0?'disabled':''}>
          ${p.stock===0?'Sold Out':'+ Add'}
        </button>
      </div>
    </div>
  </div>`;
}

// CJ product card (from live API)
function renderCJCard(p){
  const cat=p.category||'dog';
  const PET_EMOJI={dog:'🐕',cat:'🐈',bird:'🦜',reptile:'🦎',fish:'🐠',small:'🐹'};
  const em=PET_EMOJI[cat]||'📦';
  const imgHtml=p.image?`<img src="${p.image}" alt="${p.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="product-emoji-fallback" style="display:none">${em}</span>`:`<span class="product-emoji-fallback">${em}</span>`;
  return`<div class="product-card" data-pid="${p.pid||p.id}">
    <div class="product-img-wrap" style="${p.image?'':'background:var(--cream2)'}">
      ${imgHtml}
      <button class="product-qv" onclick="openCJQuickView('${p.pid||p.id}')">Quick View</button>
    </div>
    <div class="product-body">
      <div class="product-cat">${cat}</div>
      <div class="product-name">${(p.name||'').substring(0,60)}</div>
      <div class="product-rating">
        <span class="stars">★★★★★</span>
        <span class="rating-count">${(p.rating||4.7).toFixed(1)} (${p.reviews||Math.floor(50+Math.random()*300)})</span>
      </div>
      <div class="product-footer">
        <div class="product-price"><span class="price-now">$${(p.price||0).toFixed(2)}</span></div>
        <button class="btn-add" onclick="addCJToCart('${p.pid||p.id}','${(p.name||'').replace(/'/g,'\\')}',${p.price||0},'${p.image||''}','${cat}')">+ Add</button>
      </div>
    </div>
  </div>`;
}

window.addCJToCart=function(pid,name,price,image,category){
  const cart=getCart(),existing=cart.find(x=>x.id===pid);
  const PET_EMOJI={dog:'🐕',cat:'🐈',bird:'🦜',reptile:'🦎',fish:'🐠',small:'🐹'};
  if(existing){existing.qty++;}
  else{cart.push({id:pid,name,emoji:PET_EMOJI[category]||'📦',image:image||null,price,qty:1});}
  saveCart(cart);showToast('Added to bag — '+name.substring(0,32));
};

function openQuickView(id){
  const p=getProductById(id);if(!p)return;
  const overlay=document.getElementById('qvOverlay'),modal=document.getElementById('qvModal');if(!modal)return;
  const wishlisted=isWishlisted(id);
  const savings=p.orig?((1-p.price/p.orig)*100).toFixed(0):null;
  const imgPanel=p.image?`<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:
    `<div class="emoji-fallback" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:8rem">${p.emoji}</div>`;
  modal.innerHTML=`<div class="qv-inner">
    <div class="qv-img-panel">${imgPanel}<button class="qv-close" onclick="closeQuickView()">✕</button></div>
    <div class="qv-body">
      <div class="pd-eyebrow">${p.category}</div>
      <h2 style="font-family:var(--serif);font-size:1.4rem;font-weight:700;margin-bottom:10px;line-height:1.2">${p.name}</h2>
      <div class="product-rating" style="margin-bottom:16px">
        <span class="stars">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5-Math.floor(p.rating))}</span>
        <span class="rating-count">${p.rating} (${p.reviews} reviews)</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px">
        <span style="font-family:var(--serif);font-size:1.6rem;font-weight:700">${formatPrice(p.price)}</span>
        ${p.orig?`<span style="font-size:.88rem;color:var(--muted2);text-decoration:line-through">${formatPrice(p.orig)}</span>`:''}
        ${savings?`<span style="background:var(--terra);color:#fff;border-radius:50px;padding:2px 10px;font-size:.7rem;font-weight:700">${savings}% off</span>`:''}
      </div>
      <p style="font-size:.88rem;color:var(--muted);line-height:1.7;margin-bottom:20px;font-weight:300">${p.description||''}</p>
      <div style="font-size:.82rem;font-weight:600;color:${p.stock>10?'var(--sage)':p.stock>0?'#b36200':'#e53e3e'};margin-bottom:20px">
        ${p.stock>10?'✓ In Stock':p.stock>0?'Only '+p.stock+' left':'✗ Out of Stock'}
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" style="flex:1;justify-content:center" onclick="addToCart('${id}');closeQuickView()" ${p.stock===0?'disabled':''}>
          ${p.stock===0?'Out of Stock':'Add to Bag →'}
        </button>
        <button class="product-wish${wishlisted?' active':''}" data-wishlist="${id}" onclick="toggleWishlist('${id}')"
          style="position:static;opacity:1;width:48px;height:48px;border:1.5px solid var(--border2);border-radius:50%;background:var(--parchment);font-size:1.1rem">
          ${wishlisted?'♥':'♡'}
        </button>
      </div>
      <a href="product.html?id=${id}" style="display:block;text-align:center;margin-top:14px;font-size:.8rem;color:var(--muted2)">View Full Details →</a>
    </div>
  </div>`;
  overlay?.classList.add('open');modal.classList.add('open');
}

window.openCJQuickView=async function(pid){
  const overlay=document.getElementById('qvOverlay'),modal=document.getElementById('qvModal');if(!modal)return;
  modal.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;min-height:360px;font-size:.88rem;color:var(--muted)">Loading…</div>`;
  overlay?.classList.add('open');modal.classList.add('open');
  // Try fetching from proxy, fall back to local
  const SERVER=window.location.port==='3000'?`http://${window.location.hostname}:3000`:window.location.origin;
  try{
    const r=await fetch(`${SERVER}/api/products/${pid}`,{signal:AbortSignal.timeout(4000)});
    const data=await r.json();
    if(data.result&&data.product){
      const p=data.product;
      const imgHtml=p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover">`:`<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:8rem">📦</div>`;
      modal.innerHTML=`<div class="qv-inner">
        <div class="qv-img-panel">${imgHtml}<button class="qv-close" onclick="closeQuickView()">✕</button></div>
        <div class="qv-body">
          <div class="pd-eyebrow">CJ Product</div>
          <h2 style="font-family:var(--serif);font-size:1.2rem;font-weight:700;margin-bottom:12px;line-height:1.2">${p.name}</h2>
          <div style="font-family:var(--serif);font-size:1.6rem;font-weight:700;margin-bottom:16px">$${p.price.toFixed(2)}</div>
          <p style="font-size:.85rem;color:var(--muted);line-height:1.7;margin-bottom:20px;font-weight:300">${(p.description||'').replace(/<[^>]*>/g,'').substring(0,200)}…</p>
          <button class="btn-primary" style="width:100%;justify-content:center" onclick="addCJToCart('${p.pid}','${(p.name||'').replace(/'/g,'\\')}',${p.price},'${p.image||''}','dog');closeQuickView()">Add to Bag →</button>
        </div>
      </div>`;
      return;
    }
  }catch(e){}
  modal.innerHTML=`<div style="padding:40px;text-align:center"><p style="color:var(--muted)">Could not load product. <button onclick="closeQuickView()" style="color:var(--terra);background:none;border:none;cursor:pointer">Close</button></p></div>`;
};

function closeQuickView(){document.getElementById('qvOverlay')?.classList.remove('open');document.getElementById('qvModal')?.classList.remove('open');}

document.addEventListener('DOMContentLoaded',()=>{
  updateCartCount();updateWishlistCount();
  document.addEventListener('click',e=>{
    if(_searchOpen&&!e.target.closest('.nav-search-wrap')){_searchOpen=false;document.getElementById('searchBar')?.classList.remove('open');}
  });
});
