/* CRITTRLY v3 — main.js */
window.addEventListener('scroll',()=>{
  const nav=document.getElementById('mainNav');
  if(nav)nav.classList.toggle('scrolled',window.scrollY>40);
},{passive:true});

// AOS lite
(function(){
  const s=document.createElement('style');
  s.textContent='[data-aos]{opacity:0;transform:translateY(22px);transition:opacity .65s ease,transform .65s ease}[data-aos=fade]{transform:none}[data-aos].in{opacity:1;transform:none}';
  document.head.appendChild(s);
  const check=()=>document.querySelectorAll('[data-aos]:not(.in)').forEach(el=>{
    if(el.getBoundingClientRect().top<window.innerHeight-60)
      setTimeout(()=>el.classList.add('in'),parseInt(el.dataset.aosDelay||0));
  });
  window.addEventListener('scroll',check,{passive:true});
  setTimeout(check,100);
})();
