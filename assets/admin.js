// ============================================================
// Hawk's Eye Media — Admin panel (relational data model)
// Requires assets/config.js filled in with a Supabase project
// URL + anon key, and an admin user created in Supabase
// Authentication (see SETUP.md).
// ============================================================

let sb = null;
let data = { categories: [], albums: [], services: [], settings: {}, inquiries: [] };
let currentAlbumId = null;
let currentAlbumPhotos = [];
let inquiryFilter = 'all';

const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);

function initSupabase(){
  const cfg = window.HAWKS_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return true;
  }
  return false;
}

if (!initSupabase()) {
  document.getElementById('login').innerHTML = '<div><p class="eyebrow">HAWK\'S EYE MEDIA</p><h1>Setup<br><em>needed.</em></h1><small>assets/config.js is missing your Supabase URL and anon key. Follow SETUP.md, fill config.js, then reload this page.</small></div>';
}

// ---------- Auth ----------
async function login(){
  const email = $('#loginEmail').value.trim();
  const password = $('#password').value;
  const btn = $('#loginBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Enter Dashboard ↗';
  if (error) { alert('Login failed: ' + error.message); return; }
  await enterApp();
}

async function logout(){ await sb.auth.signOut(); location.reload(); }

async function enterApp(){
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadData();
}

async function checkSession(){
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enterApp();
}

// ---------- Storage helpers ----------
function publicUrl(path){
  if (!path) return '';
  const { data: d } = sb.storage.from('public-photos').getPublicUrl(path);
  return d ? d.publicUrl : '';
}

function slugify(text){
  return (text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'item';
}

// Resize an image file client-side via canvas before upload, so we
// never push huge originals straight to the public bucket.
function resizeImage(file, maxDim, quality = 0.85){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve({ blob, width, height }), 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadToPublicBucket(path, blob){
  const { error } = await sb.storage.from('public-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

function flashSaved(msg = 'Saved'){
  const el = $('#saveStatus');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- Load everything ----------
async function loadData(){
  const [{ data: cats }, { data: albs }, { data: svcs }, { data: st }, { data: inqs }] = await Promise.all([
    sb.from('categories').select('*').order('sort_order'),
    sb.from('albums').select('*, category:categories(name), photos(id)').order('created_at', { ascending: false }),
    sb.from('services').select('*').order('sort_order'),
    sb.from('site_settings').select('*').eq('id','main').single(),
    sb.from('inquiries').select('*').order('created_at', { ascending: false })
  ]);
  data.categories = cats || [];
  data.albums = albs || [];
  data.services = svcs || [];
  data.settings = st || {};
  data.inquiries = inqs || [];

  renderOverview();
  renderAlbums();
  renderCategories();
  renderServices();
  renderInquiries();
  populateSettingsForm();
}

function renderOverview(){
  $('#albumCount').textContent = data.albums.length;
  $('#featuredCount').textContent = data.albums.filter(a => a.is_featured).length;
  $('#photoCount').textContent = data.albums.reduce((n,a) => n + (a.photos ? a.photos.length : 0), 0);
  $('#privateCount').textContent = data.albums.filter(a => a.is_private).length;
  $('#serviceCount').textContent = data.services.length;
  const newCount = data.inquiries.filter(i => i.status === 'new').length;
  $('#newInquiryCount').textContent = newCount;
  const badge = $('#inqBadge');
  if (newCount) { badge.textContent = newCount; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

// ---------- Tabs ----------
$$('.tab-btn').forEach(b => b.onclick = () => {
  $$('.tab-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $$('.tab').forEach(t => t.classList.add('hidden'));
  $('#' + b.dataset.tab).classList.remove('hidden');
  $('#title').textContent = b.textContent.trim();
});

// ============================================================
// ALBUMS
// ============================================================
function renderAlbums(){
  $('#albumList').innerHTML = data.albums.map(a => `
    <div class="row-card">
      <div class="row-main">
        <b>${a.title}</b>
        <small>${a.category ? a.category.name : 'Uncategorized'} · ${(a.photos || []).length} photos</small>
        <div class="badges">
          <span class="badge ${a.is_published ? 'badge-on' : ''}">${a.is_published ? 'Published' : 'Draft'}</span>
          ${a.is_featured ? '<span class="badge badge-gold">Featured</span>' : ''}
          ${a.is_private ? '<span class="badge badge-warn">Private</span>' : ''}
        </div>
      </div>
      <div class="row-actions">
        <button onclick="openAlbumPanel('${a.id}')">Manage</button>
        <button class="danger" onclick="deleteAlbum('${a.id}')">Delete</button>
      </div>
    </div>`).join('') || '<p class="hint">No albums yet — click "New Album" to create your first one.</p>';
}

async function createAlbum(){
  const title = 'New Album';
  const slug = slugify(title) + '-' + Date.now().toString(36);
  const { data: row, error } = await sb.from('albums').insert({
    title, slug, category_id: data.categories[0]?.id || null, is_published: false
  }).select().single();
  if (error) { alert('Could not create album: ' + error.message); return; }
  data.albums.unshift({ ...row, category: data.categories[0] || null, photos: [] });
  renderAlbums(); renderOverview();
  openAlbumPanel(row.id);
}

async function deleteAlbum(id){
  if (!confirm('Delete this album and all its photos? This cannot be undone.')) return;
  const { data: photos } = await sb.from('photos').select('storage_path, thumbnail_path').eq('album_id', id);
  const paths = (photos || []).flatMap(p => [p.storage_path, p.thumbnail_path].filter(Boolean));
  if (paths.length) await sb.storage.from('public-photos').remove(paths);
  const { error } = await sb.from('albums').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  data.albums = data.albums.filter(a => a.id !== id);
  renderAlbums(); renderOverview();
}

async function openAlbumPanel(id){
  currentAlbumId = id;
  const album = data.albums.find(a => a.id === id);
  if (!album) return;

  $('#albumPanelTitle').textContent = album.title;
  $('#af_title').value = album.title || '';
  $('#af_location').value = album.location || '';
  $('#af_date').value = album.event_date || '';
  $('#af_description').value = album.description || '';
  $('#af_published').checked = !!album.is_published;
  $('#af_featured').checked = !!album.is_featured;
  $('#af_private').checked = !!album.is_private;
  $('#af_download').checked = !!album.allow_download;
  $('#af_selection').checked = !!album.allow_selection;
  $('#af_watermark').checked = album.watermark_enabled !== false;
  $('#privateAccessRow').classList.toggle('hidden', !album.is_private);
  $('#af_private').onchange = () => $('#privateAccessRow').classList.toggle('hidden', !$('#af_private').checked);

  $('#af_category').innerHTML = data.categories.map(c => `<option value="${c.id}" ${c.id === album.category_id ? 'selected' : ''}>${c.name}</option>`).join('');

  const { data: tagRows } = await sb.from('album_tags').select('tag:tags(name)').eq('album_id', id);
  $('#af_tags').value = (tagRows || []).map(t => t.tag?.name).filter(Boolean).join(', ');

  await loadAlbumPhotos(id);
  $('#albumPanel').classList.remove('hidden');
}

function closeAlbumPanel(){
  $('#albumPanel').classList.add('hidden');
  currentAlbumId = null;
  currentAlbumPhotos = [];
}

async function saveAlbumFields(){
  if (!currentAlbumId) return;
  const title = $('#af_title').value.trim();
  const update = {
    title,
    category_id: $('#af_category').value || null,
    location: $('#af_location').value.trim(),
    event_date: $('#af_date').value || null,
    description: $('#af_description').value.trim(),
    is_published: $('#af_published').checked,
    is_featured: $('#af_featured').checked,
    is_private: $('#af_private').checked,
    allow_download: $('#af_download').checked,
    allow_selection: $('#af_selection').checked,
    watermark_enabled: $('#af_watermark').checked,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('albums').update(update).eq('id', currentAlbumId);
  if (error) { alert('Save failed: ' + error.message); return; }

  // tags: replace the set
  const tagNames = $('#af_tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await sb.from('album_tags').delete().eq('album_id', currentAlbumId);
  for (const name of tagNames) {
    let { data: existing } = await sb.from('tags').select('id').eq('name', name).maybeSingle();
    let tagId = existing?.id;
    if (!tagId) {
      const { data: created, error: e } = await sb.from('tags').insert({ name }).select().single();
      if (e) continue;
      tagId = created.id;
    }
    await sb.from('album_tags').insert({ album_id: currentAlbumId, tag_id: tagId });
  }

  const idx = data.albums.findIndex(a => a.id === currentAlbumId);
  if (idx > -1) data.albums[idx] = { ...data.albums[idx], ...update, category: data.categories.find(c => c.id === update.category_id) };
  renderAlbums(); renderOverview();
  flashSaved('Album saved');
}

// ---------- Photos within the open album ----------
async function loadAlbumPhotos(albumId){
  const { data: photos, error } = await sb.from('photos').select('*').eq('album_id', albumId).order('sort_order');
  if (error) { console.warn(error); return; }
  currentAlbumPhotos = photos || [];
  renderPhotoGrid();
}

function renderPhotoGrid(){
  const album = data.albums.find(a => a.id === currentAlbumId);
  $('#photoGrid').innerHTML = currentAlbumPhotos.map((p, i) => `
    <div class="photo-card ${p.is_hidden ? 'is-hidden' : ''}">
      <img src="${publicUrl(p.thumbnail_path || p.storage_path)}" alt="${p.caption || ''}">
      ${album && album.cover_photo_id === p.id ? '<span class="cover-tag">Cover</span>' : ''}
      <input class="caption-input" placeholder="Caption…" value="${p.caption || ''}" onblur="updateCaption('${p.id}', this.value)">
      <div class="photo-actions">
        <button title="Move left" onclick="reorderPhoto('${p.id}', -1)" ${i === 0 ? 'disabled' : ''}>←</button>
        <button title="Move right" onclick="reorderPhoto('${p.id}', 1)" ${i === currentAlbumPhotos.length - 1 ? 'disabled' : ''}>→</button>
        <button title="Set as cover" onclick="setCoverPhoto('${p.id}')">★</button>
        <button title="Hide/show" onclick="toggleHidePhoto('${p.id}')">${p.is_hidden ? '👁' : '🚫'}</button>
        <button title="Delete" class="danger" onclick="deletePhoto('${p.id}')">✕</button>
      </div>
    </div>`).join('') || '<p class="hint">No photos yet — drag some in above.</p>';
}

async function updateCaption(photoId, value){
  await sb.from('photos').update({ caption: value }).eq('id', photoId);
  const p = currentAlbumPhotos.find(x => x.id === photoId);
  if (p) p.caption = value;
  flashSaved('Caption saved');
}

async function reorderPhoto(photoId, dir){
  const idx = currentAlbumPhotos.findIndex(p => p.id === photoId);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= currentAlbumPhotos.length) return;
  const a = currentAlbumPhotos[idx], b = currentAlbumPhotos[swapIdx];
  const aOrder = a.sort_order, bOrder = b.sort_order;
  await Promise.all([
    sb.from('photos').update({ sort_order: bOrder }).eq('id', a.id),
    sb.from('photos').update({ sort_order: aOrder }).eq('id', b.id)
  ]);
  [currentAlbumPhotos[idx], currentAlbumPhotos[swapIdx]] = [currentAlbumPhotos[swapIdx], currentAlbumPhotos[idx]];
  a.sort_order = bOrder; b.sort_order = aOrder;
  renderPhotoGrid();
}

async function setCoverPhoto(photoId){
  await sb.from('albums').update({ cover_photo_id: photoId }).eq('id', currentAlbumId);
  const album = data.albums.find(a => a.id === currentAlbumId);
  if (album) album.cover_photo_id = photoId;
  renderPhotoGrid();
  flashSaved('Cover updated');
}

async function toggleHidePhoto(photoId){
  const p = currentAlbumPhotos.find(x => x.id === photoId);
  if (!p) return;
  const next = !p.is_hidden;
  await sb.from('photos').update({ is_hidden: next }).eq('id', photoId);
  p.is_hidden = next;
  renderPhotoGrid();
}

async function deletePhoto(photoId){
  if (!confirm('Delete this photo?')) return;
  const p = currentAlbumPhotos.find(x => x.id === photoId);
  if (!p) return;
  const paths = [p.storage_path, p.thumbnail_path].filter(Boolean);
  if (paths.length) await sb.storage.from('public-photos').remove(paths);
  await sb.from('photos').delete().eq('id', photoId);
  currentAlbumPhotos = currentAlbumPhotos.filter(x => x.id !== photoId);
  const albumRow = data.albums.find(a => a.id === currentAlbumId);
  if (albumRow) albumRow.photos = currentAlbumPhotos.map(x => ({ id: x.id }));
  renderPhotoGrid(); renderOverview();
}

// ---------- Upload pipeline ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.onclick = () => fileInput.click();
fileInput.onchange = () => handleFiles(fileInput.files);
['dragover','dragenter'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag-over'); }));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); }));
dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

async function handleFiles(fileList){
  if (!currentAlbumId) return;
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  const progressEl = $('#uploadProgress');
  progressEl.classList.remove('hidden');
  let done = 0;
  let nextOrder = currentAlbumPhotos.length ? Math.max(...currentAlbumPhotos.map(p => p.sort_order)) + 1 : 0;

  for (const file of files) {
    progressEl.textContent = `Uploading ${done + 1} of ${files.length}…`;
    try {
      const id = crypto.randomUUID();
      const [display, thumb] = await Promise.all([
        resizeImage(file, 1920, 0.85),
        resizeImage(file, 400, 0.75)
      ]);
      const displayPath = `${currentAlbumId}/${id}-display.jpg`;
      const thumbPath = `${currentAlbumId}/${id}-thumb.jpg`;
      await uploadToPublicBucket(displayPath, display.blob);
      await uploadToPublicBucket(thumbPath, thumb.blob);

      const { data: row, error } = await sb.from('photos').insert({
        album_id: currentAlbumId,
        storage_path: displayPath,
        thumbnail_path: thumbPath,
        width: display.width,
        height: display.height,
        sort_order: nextOrder++
      }).select().single();
      if (error) throw error;
      currentAlbumPhotos.push(row);

      // If this album had no cover yet, make the first upload the cover.
      const album = data.albums.find(a => a.id === currentAlbumId);
      if (album && !album.cover_photo_id) {
        await sb.from('albums').update({ cover_photo_id: row.id }).eq('id', currentAlbumId);
        album.cover_photo_id = row.id;
      }
    } catch (e) {
      console.error('Upload failed for', file.name, e);
      alert(`Failed to upload ${file.name}: ${e.message || e}`);
    }
    done++;
  }

  progressEl.classList.add('hidden');
  fileInput.value = '';
  const albumRow = data.albums.find(a => a.id === currentAlbumId);
  if (albumRow) albumRow.photos = currentAlbumPhotos.map(x => ({ id: x.id }));
  renderPhotoGrid(); renderAlbums(); renderOverview();
}

// ============================================================
// CATEGORIES
// ============================================================
function renderCategories(){
  $('#categoryList').innerHTML = data.categories.map((c, i) => `
    <div class="row-card compact">
      <input value="${c.name}" onchange="renameCategory('${c.id}', this.value)">
      <div class="row-actions">
        <button onclick="moveCategory('${c.id}', -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button onclick="moveCategory('${c.id}', 1)" ${i === data.categories.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="danger" onclick="deleteCategory('${c.id}')">Delete</button>
      </div>
    </div>`).join('') || '<p class="hint">No categories yet.</p>';
}

async function createCategory(){
  const name = 'New Category';
  const slug = slugify(name) + '-' + Date.now().toString(36);
  const sort_order = data.categories.length;
  const { data: row, error } = await sb.from('categories').insert({ name, slug, sort_order }).select().single();
  if (error) { alert(error.message); return; }
  data.categories.push(row);
  renderCategories();
}

async function renameCategory(id, name){
  const slug = slugify(name);
  const { error } = await sb.from('categories').update({ name, slug }).eq('id', id);
  if (error) { alert(error.message); return; }
  const c = data.categories.find(x => x.id === id);
  if (c) { c.name = name; c.slug = slug; }
  flashSaved('Category saved');
}

async function moveCategory(id, dir){
  const idx = data.categories.findIndex(c => c.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= data.categories.length) return;
  const a = data.categories[idx], b = data.categories[swapIdx];
  await Promise.all([
    sb.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id),
    sb.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id)
  ]);
  [a.sort_order, b.sort_order] = [b.sort_order, a.sort_order];
  data.categories.sort((x,y) => x.sort_order - y.sort_order);
  renderCategories();
}

async function deleteCategory(id){
  if (!confirm('Delete this category? Albums using it will become Uncategorized.')) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  data.categories = data.categories.filter(c => c.id !== id);
  renderCategories();
}

// ============================================================
// SERVICES
// ============================================================
function renderServices(){
  $('#serviceList').innerHTML = data.services.map((s, i) => `
    <div class="row-card compact">
      <input value="${s.title}" onchange="renameService('${s.id}', this.value)">
      <label class="inline"><input type="checkbox" ${s.is_active ? 'checked' : ''} onchange="toggleServiceActive('${s.id}', this.checked)"> Active</label>
      <div class="row-actions">
        <button onclick="moveService('${s.id}', -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button onclick="moveService('${s.id}', 1)" ${i === data.services.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="danger" onclick="deleteService('${s.id}')">Delete</button>
      </div>
    </div>`).join('') || '<p class="hint">No services yet.</p>';
}

async function createService(){
  const title = 'New Service';
  const sort_order = data.services.length;
  const { data: row, error } = await sb.from('services').insert({ title, sort_order, is_active: true }).select().single();
  if (error) { alert(error.message); return; }
  data.services.push(row);
  renderServices();
}

async function renameService(id, title){
  await sb.from('services').update({ title }).eq('id', id);
  const s = data.services.find(x => x.id === id);
  if (s) s.title = title;
  flashSaved('Service saved');
}

async function toggleServiceActive(id, active){
  await sb.from('services').update({ is_active: active }).eq('id', id);
  const s = data.services.find(x => x.id === id);
  if (s) s.is_active = active;
}

async function moveService(id, dir){
  const idx = data.services.findIndex(s => s.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= data.services.length) return;
  const a = data.services[idx], b = data.services[swapIdx];
  await Promise.all([
    sb.from('services').update({ sort_order: b.sort_order }).eq('id', a.id),
    sb.from('services').update({ sort_order: a.sort_order }).eq('id', b.id)
  ]);
  [a.sort_order, b.sort_order] = [b.sort_order, a.sort_order];
  data.services.sort((x,y) => x.sort_order - y.sort_order);
  renderServices();
}

async function deleteService(id){
  if (!confirm('Delete this service?')) return;
  await sb.from('services').delete().eq('id', id);
  data.services = data.services.filter(s => s.id !== id);
  renderServices();
}

// ============================================================
// INQUIRIES
// ============================================================
$$('.chip').forEach(c => c.onclick = () => {
  $$('.chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  inquiryFilter = c.dataset.status;
  renderInquiries();
});

function renderInquiries(){
  const list = inquiryFilter === 'all' ? data.inquiries : data.inquiries.filter(i => i.status === inquiryFilter);
  $('#inquiryList').innerHTML = list.map(i => `
    <div class="row-card inquiry-card">
      <div class="row-main">
        <b>${i.name}</b> <span class="badge ${i.status === 'new' ? 'badge-gold' : ''}">${i.status}</span>
        <small>${i.service || ''} ${i.event_date ? '· ' + i.event_date : ''} ${i.location ? '· ' + i.location : ''}</small>
        <small>${i.phone || ''} ${i.email ? '· ' + i.email : ''}</small>
        ${i.message ? `<p class="inquiry-msg">${i.message}</p>` : ''}
        <small class="muted">${new Date(i.created_at).toLocaleString()}</small>
      </div>
      <div class="row-actions column">
        <button onclick="setInquiryStatus('${i.id}','read')">Mark Read</button>
        <button onclick="setInquiryStatus('${i.id}','contacted')">Mark Contacted</button>
        <button onclick="setInquiryStatus('${i.id}','archived')">Archive</button>
      </div>
    </div>`).join('') || '<p class="hint">No inquiries in this view.</p>';
}

async function setInquiryStatus(id, status){
  await sb.from('inquiries').update({ status }).eq('id', id);
  const i = data.inquiries.find(x => x.id === id);
  if (i) i.status = status;
  renderOverview(); renderInquiries();
}

// ============================================================
// SETTINGS
// ============================================================
function populateSettingsForm(){
  const s = data.settings || {};
  const form = $('#settingsForm');
  Object.keys(s).forEach(key => {
    const el = form.elements[key];
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!s[key];
    else el.value = s[key] ?? '';
  });
  if (s.hero_image_path) { $('#heroPreview').src = publicUrl(s.hero_image_path); $('#heroPreview').classList.remove('hidden'); }
  if (s.about_profile_image_path) { $('#aboutPreview').src = publicUrl(s.about_profile_image_path); $('#aboutPreview').classList.remove('hidden'); }
}

$('#heroImageInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const { blob } = await resizeImage(file, 2200, 0.85);
  const path = `site/hero-${Date.now()}.jpg`;
  await uploadToPublicBucket(path, blob);
  data.settings.hero_image_path = path;
  $('#heroPreview').src = publicUrl(path);
  $('#heroPreview').classList.remove('hidden');
  flashSaved('Hero image uploaded — click Save Settings to publish it');
};

$('#aboutImageInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const { blob } = await resizeImage(file, 1400, 0.85);
  const path = `site/about-${Date.now()}.jpg`;
  await uploadToPublicBucket(path, blob);
  data.settings.about_profile_image_path = path;
  $('#aboutPreview').src = publicUrl(path);
  $('#aboutPreview').classList.remove('hidden');
  flashSaved('Profile image uploaded — click Save Settings to publish it');
};

$('#settingsForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  const update = {
    brand_name: form.brand_name.value.trim(),
    tagline: form.tagline.value.trim(),
    hero_title: form.hero_title.value.trim(),
    hero_subtitle: form.hero_subtitle.value.trim(),
    hero_image_path: data.settings.hero_image_path || null,
    about_title: form.about_title.value.trim(),
    about_short_bio: form.about_short_bio.value.trim(),
    about_long_bio: form.about_long_bio.value.trim(),
    about_philosophy: form.about_philosophy.value.trim(),
    about_experience_years: form.about_experience_years.value ? Number(form.about_experience_years.value) : null,
    about_profile_image_path: data.settings.about_profile_image_path || null,
    whatsapp: form.whatsapp.value.replace(/[^0-9]/g,''),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    instagram_url: form.instagram_url.value.trim() || null,
    facebook_url: form.facebook_url.value.trim() || null,
    watermark_enabled_default: form.watermark_enabled_default.checked,
    watermark_opacity_default: form.watermark_opacity_default.value ? Number(form.watermark_opacity_default.value) : 0.35,
    seo_title: form.seo_title.value.trim(),
    seo_description: form.seo_description.value.trim(),
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('site_settings').update(update).eq('id','main');
  if (error) { alert('Save failed: ' + error.message); return; }
  data.settings = { ...data.settings, ...update };
  flashSaved('Settings saved — live on the site now');
};

// ============================================================
// BACKUP EXPORT (no secrets/passwords included)
// ============================================================
function exportBackup(){
  const payload = {
    exported_at: new Date().toISOString(),
    categories: data.categories,
    services: data.services,
    settings: data.settings,
    albums: data.albums.map(a => ({ ...a, photos: undefined }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hawks-eye-media-backup-${Date.now()}.json`;
  a.click();
}

checkSession();
