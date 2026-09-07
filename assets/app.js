// ============================================================
// Hawk's Eye Media — Public site
// Reads from the relational Supabase schema (categories, albums,
// photos, services, site_settings). Falls back to built-in demo
// data when Supabase isn't configured yet (offline/demo mode).
// ============================================================

const demo = {
  categories: [{name:'Weddings'},{name:'Portraits'},{name:'Product'},{name:'Street'},{name:'Automotive'},{name:'Architecture'}],
  settings: {
    brand_name: "Hawk's Eye Media",
    whatsapp: '201064675155',
    phone: '+20 106 467 5155',
    email: 'islam.metwally@outlook.com',
    tagline: 'Cinematic photography that turns real moments, people and places into visual stories.',
    about_short_bio: "Seven years ago, photography started as a passion and a way of seeing the world differently. Today, that same curiosity shapes every frame created under Hawk's Eye Media."
  },
  albums: [
    {id:1,title:'After the Vows',category:{name:'Weddings'},location:'Cairo · 2026',is_featured:true,cover_url:'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=85',photos:[{url:'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85'},{url:'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1800&q=85'}]},
    {id:2,title:'Quiet Character',category:{name:'Portraits'},location:'Portrait Study',is_featured:true,cover_url:'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1200&q=85',photos:[{url:'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1800&q=85'},{url:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1800&q=85'}]},
    {id:3,title:'Motion & Machine',category:{name:'Automotive'},location:'Editorial Series',is_featured:true,cover_url:'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1400&q=85',photos:[{url:'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1800&q=85'},{url:'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1800&q=85'}]},
    {id:4,title:'Urban Frames',category:{name:'Street'},location:'Street Photography',is_featured:false,cover_url:'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1200&q=85',photos:[{url:'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1800&q=85'}]},
    {id:5,title:'The Still Life',category:{name:'Product'},location:'Commercial',is_featured:false,cover_url:'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=85',photos:[{url:'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1800&q=85'}]},
    {id:6,title:'Lines & Light',category:{name:'Architecture'},location:'Architectural Study',is_featured:false,cover_url:'https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&q=85',photos:[{url:'https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1800&q=85'}]}
  ],
  services: [{title:'Wedding Photography'},{title:'Portrait & Personal Sessions'},{title:'Commercial Photography'},{title:'Product Photography'},{title:'Fashion & Editorial'},{title:'Event Photography'},{title:'Real Estate & Architecture'},{title:'Automotive Photography'},{title:'Food Photography'},{title:'Travel & Street Photography'}]
};

let sb = null;
let usingDemo = true;
let categories = [];
let albums = [];
let services = [];
let settings = {};

const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);

function initSupabase(){
  const cfg = window.HAWKS_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    try { sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); return true; }
    catch(e){ console.warn('Supabase init failed', e); }
  }
  return false;
}

function publicUrl(path){
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path; // already a full URL (demo data)
  const { data } = sb.storage.from('public-photos').getPublicUrl(path);
  return data ? data.publicUrl : '';
}

async function loadData(){
  if (!initSupabase()) { loadDemo(); return; }
  try {
    const [{ data: cats, error: e1 }, { data: albs, error: e2 }, { data: svcs, error: e3 }, { data: st, error: e4 }] = await Promise.all([
      sb.from('categories').select('*').order('sort_order'),
      sb.from('albums').select('*, category:categories(name,slug), photos!album_id(*)').eq('is_published', true).eq('is_private', false).order('sort_order', { foreignTable: 'photos' }),
      sb.from('services').select('*').eq('is_active', true).order('sort_order'),
      sb.from('site_settings').select('*').eq('id','main').single()
    ]);
    if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4);

    categories = cats || [];
    services = svcs || [];
    settings = st || {};
    albums = (albs || []).map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      location: a.location,
      is_featured: a.is_featured,
      featured_order: a.featured_order,
      cover_url: publicUrl(a.cover_photo_id ? (a.photos.find(p => p.id === a.cover_photo_id) || {}).storage_path : (a.photos[0] || {}).storage_path),
      photos: (a.photos || []).filter(p => !p.is_hidden).map(p => ({ url: publicUrl(p.storage_path), caption: p.caption }))
    }));
    usingDemo = false;
  } catch (e) {
    console.warn('Supabase load failed, using demo data:', e.message || e);
    loadDemo();
    return;
  }
  render();
}

function loadDemo(){
  categories = demo.categories;
  albums = demo.albums;
  services = demo.services;
  settings = demo.settings;
  usingDemo = true;
  render();
}

function card(a){
  return `<article class="project-card" data-id="${a.id}"><img loading="lazy" src="${a.cover_url}" alt="${a.title}"><div class="project-info"><small>${a.category ? a.category.name : ''} · ${a.location || ''}</small><h3>${a.title}</h3></div></article>`;
}

function renderArchive(catName, query){
  let list = albums;
  if (catName && catName !== 'All') list = list.filter(a => a.category && a.category.name === catName);
  if (query) {
    const q = query.trim().toLowerCase();
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.category && a.category.name.toLowerCase().includes(q)) ||
      (a.location || '').toLowerCase().includes(q)
    );
  }
  $('#archiveGrid').innerHTML = list.length
    ? list.map(a => `<article class="archive-card" data-id="${a.id}"><img loading="lazy" src="${a.cover_url}" alt="${a.title}"><div class="project-info"><small>${a.category ? a.category.name : ''}</small><h3>${a.title}</h3></div></article>`).join('')
    : `<p class="empty-note">No projects match that search.</p>`;
}

function applySettings(){
  const s = settings || {};
  if (s.brand_name) document.title = `${s.brand_name} — Photography & Visual Storytelling`;
  if (s.tagline) { const el = $('.hero-copy'); if (el) el.textContent = s.tagline; }
  if (s.about_short_bio) { const el = $('#aboutText'); if (el) el.textContent = s.about_short_bio; }
  const wa = (s.whatsapp || '').replace(/[^0-9]/g,'');
  if (wa) $$('a[href^="https://wa.me/"]').forEach(a => a.href = `https://wa.me/${wa}`);
  if (s.phone) $$('a[href^="tel:"]').forEach(a => a.href = `tel:${s.phone.replace(/\s+/g,'')}`);
  if (s.email) $$('a[href^="mailto:"]').forEach(a => { a.href = `mailto:${s.email}`; if (a.id === 'emailLink') a.childNodes[0].nodeValue = s.email + ' '; });
}

function render(){
  const featured = albums.filter(a => a.is_featured).sort((x,y) => (x.featured_order||0)-(y.featured_order||0)).slice(0,6);
  $('#featuredGrid').innerHTML = featured.map(card).join('');
  renderArchive('All', '');

  const catNames = ['All', ...categories.map(c => c.name)];
  $('#filters').innerHTML = catNames.map((c,i) => `<button class="filter ${i?'':'active'}" data-cat="${c}">${c}</button>`).join('');

  $('#serviceGrid').innerHTML = services.map((s,i) => `<div class="service"><span>${String(i+1).padStart(2,'0')}</span><div>${s.title}</div><span>↗</span></div>`).join('');
  $('#serviceSelect').innerHTML = '<option value="">Select a service</option>' + services.map(s => `<option>${s.title}</option>`).join('');

  applySettings();
  bind();
}

function openProject(id){
  const p = albums.find(x => x.id == id);
  if (!p || !p.photos.length) return;
  let i = 0;
  const show = () => { $('#lbImg').src = p.photos[i].url || p.cover_url; $('.lb-caption').textContent = p.photos[i].caption ? `${p.photos[i].caption} · ${i+1}/${p.photos.length}` : `${p.title} · ${i+1}/${p.photos.length}`; };
  show();
  $('#lightbox').classList.add('open');
  $('#lightbox').dataset.project = id;
  $('#lightbox').dataset.i = i;
}

function bind(){
  if ($('#searchInput')) {
    $('#searchInput').oninput = () => {
      const activeCat = $('.filter.active') ? $('.filter.active').dataset.cat : 'All';
      renderArchive(activeCat, $('#searchInput').value);
    };
  }
  $$('.filter').forEach(b => b.onclick = () => {
    $$('.filter').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderArchive(b.dataset.cat, $('#searchInput') ? $('#searchInput').value : '');
  });
}

// Event delegation for project/archive cards so re-renders never need re-binding
document.addEventListener('click', e => {
  const card = e.target.closest('.project-card,.archive-card');
  if (card) openProject(card.dataset.id);
});

$('.lb-close').onclick = () => $('#lightbox').classList.remove('open');
$('.lb-next').onclick = () => move(1);
$('.lb-prev').onclick = () => move(-1);
function move(d){
  const lb = $('#lightbox'), p = albums.find(x => x.id == lb.dataset.project);
  if (!p) return;
  let i = (+lb.dataset.i + d + p.photos.length) % p.photos.length;
  lb.dataset.i = i;
  $('#lbImg').src = p.photos[i].url;
  $('.lb-caption').textContent = p.photos[i].caption ? `${p.photos[i].caption} · ${i+1}/${p.photos.length}` : `${p.title} · ${i+1}/${p.photos.length}`;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#lightbox').classList.remove('open');
  if ($('#lightbox').classList.contains('open') && e.key === 'ArrowRight') move(1);
  if ($('#lightbox').classList.contains('open') && e.key === 'ArrowLeft') move(-1);
});

$('.theme').onclick = () => { document.body.classList.toggle('light'); localStorage.setItem('hawksTheme', document.body.classList.contains('light') ? 'light' : 'dark'); };
if (localStorage.getItem('hawksTheme') === 'light') document.body.classList.add('light');

$('#contactForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button[type="submit"]');
  const payload = {
    name: f.get('name'), phone: f.get('phone'), email: f.get('email') || null,
    service: f.get('service') || null, event_date: f.get('date') || null,
    location: f.get('location') || null, message: f.get('message') || null
  };

  if (sb && !usingDemo) {
    btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Sending…';
    const { error } = await sb.from('inquiries').insert(payload);
    btn.disabled = false; btn.textContent = orig;
    if (error) console.warn('Could not save inquiry:', error.message);
  }

  const msg = `New Inquiry — ${settings.brand_name || "Hawk's Eye Media"}\n\nName: ${payload.name}\nPhone: ${payload.phone}\nEmail: ${payload.email || ''}\nService: ${payload.service || ''}\nDate: ${payload.event_date || ''}\nLocation: ${payload.location || ''}\nMessage: ${payload.message || ''}`;
  const wa = ((settings.whatsapp) || '201064675155').replace(/[^0-9]/g,'');
  window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(msg), '_blank');
  e.target.reset();
};

loadData();
