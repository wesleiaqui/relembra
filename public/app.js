import { MOTIVATION_MOMENTS, selectMotivationTips } from './motivation.js';
import { embeddedMediaLink } from './media-links.js';
import { setupFinance, loadFinance, resetFinance } from './finance.js';
const $ = id => document.getElementById(id);
const state = { thoughts: [], thoughtEditId: null, thoughtSuggestion: '', view: 'home', tips: [], tipsContext: 'all', tipsSearch: '', tipsKind: 'all', tipsFavoritesOnly: false, tipEditId: null, categories: [], videos: [], total: 0, offset: 0, editId: null, category: 'all', search: '', sort: 'recent', busy: false };
let toastTimer;
let listRequest = 0;
let playerVideoId = null;
let imagePreviewItems = [];
let imagePreviewIndex = 0;
function savedViewMode() { try { const mode = localStorage.getItem('relembra-view-mode'); return ['standard','gallery','focus'].includes(mode) ? mode : 'standard'; } catch { return 'standard'; } }
function setViewMode(mode) {
  if (!['standard','gallery','focus'].includes(mode)) return;
  $('libraryGrid').dataset.mode = mode;
  document.querySelectorAll('[data-view-mode]').forEach(btn => {
    const on = btn.dataset.viewMode === mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  try { localStorage.setItem('relembra-view-mode', mode); } catch {}
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = d => { try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); } catch { return ''; } };
const catOf = id => state.categories.find(c => c.id === id) || { id: 'outros', name: 'Outros', emoji: '📚', color: '#63738d' };
const platform = url => { try { const h = new URL(url).hostname.toLowerCase(); if (h.includes('instagram.com')) return 'Instagram'; if (h.includes('tiktok.com')) return 'TikTok'; if (h.includes('youtu.be') || h.includes('youtube.com')) return 'YouTube'; if (h.includes('pinterest.')) return 'Pinterest'; return 'Link salvo'; } catch { return 'Vídeo'; } };
function toast(message, fail = false) { const t = $('toast'); t.textContent = message; t.className = 'toast show' + (fail ? ' fail' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3600); }
async function api(path, opts = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...opts, headers: { ...(opts.body && typeof opts.body === 'string' ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') $('loginOverlay').hidden = false;
    throw new Error(data.error || `Erro ${response.status}`);
  }
  return data;
}
async function syncCategories() {
  const res = await api('/api/categories');
  state.categories = res.categories;
  $('categoryNav').innerHTML = state.categories.map(c => `<div class="category-wrap"><button class="category-item ${state.view === 'library' && state.category === c.id ? 'active' : ''}" data-cat="${esc(c.id)}"><span class="category-emoji">${esc(c.emoji)}</span>${esc(c.name)}</button></div>`).join('');
  const choices = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  $('videoCategory').innerHTML = choices;
  $('categoryFilter').innerHTML = '<option value="all">Todas as categorias</option>' + choices;
  $('categoryFilter').value = state.category;
}
function skeletonEmpty(title, description, icon = '📚', action = true) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? '<button class="button button-primary" data-add="1">+ Adicionar vídeo</button>' : ''}</div>`;
}
function card(video) {
  const c = catOf(video.category);
  const accent = { apartamento: ['#404a8f', '#1b254e'], culinaria: ['#8c4f45', '#332339'], turismo: ['#287b81', '#16384c'], cs2: ['#475e83', '#1f283e'], outros: ['#465979', '#242b42'] }[video.category] || ['#455785', '#1f2e4b'];
  const imageUrl = video.has_image ? '/api/videos/' + encodeURIComponent(video.id) + '/image' : video.cover_url;
  const image = imageUrl ? '<img src="' + esc(imageUrl) + '" alt="Imagem salva do vídeo" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.card-art\').classList.add(\'image-failed\');this.remove()">' : '';
  const zoom = imageUrl ? '<button type="button" class="card-image-hit" data-preview="' + esc(video.id) + '" title="Ampliar imagem" aria-label="Ampliar imagem de ' + esc(video.title) + '"><span aria-hidden="true">⤢ Ampliar</span></button>' : '';
  const watched = video.watched ? '<span class="badge-watched">✓ Assistido</span>' : '<span class="card-date">' + esc(date(video.created_at)) + '</span>';
  const embed = embeddedMediaLink(video.url);
  const play = embed ? '<button type="button" class="card-action card-watch" data-watch="' + esc(video.id) + '" title="Assistir ao vídeo dentro do Relembra">▶ Assistir</button>' : '';
  const open = '<a href="' + esc(video.url) + '" class="card-action" target="_blank" rel="noopener noreferrer" title="Abrir no site original">↗ Original</a>';
  return '<article class="video-card" data-video="' + esc(video.id) + '">' +
    '<div class="card-art" style="--cover1:' + accent[0] + ';--cover2:' + accent[1] + '"><span class="card-emoji">' + esc(c.emoji) + '</span>' + image + zoom +
    '<span class="card-platform">▣ ' + esc(platform(video.url)) + '</span><button class="card-favorite ' + (video.favorite ? 'favorited' : '') + '" data-fav="' + esc(video.id) + '" aria-label="Favoritar" title="' + (video.favorite ? 'Remover favorito' : 'Favoritar') + '">' + (video.favorite ? '♥' : '♡') + '</button></div>' +
    '<div class="card-body"><div class="card-topline"><i></i>' + esc(c.name) + (video.related_count > 1 ? '<span class="related-count">' + Number(video.related_count) + ' fichas deste link</span>' : '') + '</div>' +
    '<h3 class="card-title" data-edit="' + esc(video.id) + '" title="Abrir vídeo salvo">' + esc(video.title) + '</h3><p class="card-summary">' + esc(video.summary || video.visual_description || video.tags || 'Adicione um resumo, transcrição ou análise visual.') + '</p>' +
    '<div class="card-bottom">' + watched + '<div class="card-actions">' + play + open + '<button class="card-action" data-newinfo="' + esc(video.id) + '" title="Criar outra ficha">+ Info</button><button class="card-action" data-edit="' + esc(video.id) + '">Editar</button></div></div></div></article>';
}

async function loadStats() {
  try { const { stats } = await api('/api/stats'); $('statTotal').textContent = Number(stats.total || 0).toLocaleString('pt-BR'); $('statFavorites').textContent = stats.favorites || 0; $('statUnwatched').textContent = stats.unwatched || 0; $('statCategories').textContent = stats.categories || 0; } catch (e) { toast(e.message, true); }
}
async function loadHome() {
  try { const res = await api('/api/videos?limit=6'); state.homeVideos = res.videos; $('homeGrid').innerHTML = res.videos.length ? res.videos.map(card).join('') : skeletonEmpty('Seu espaço começa aqui', 'Salve seu primeiro vídeo e crie uma biblioteca de ideias para consultar quando quiser.'); await loadStats(); }
  catch (e) { $('homeGrid').innerHTML = skeletonEmpty('Não foi possível carregar', e.message, '⚠️', false); }
}
function listFilters() { return { q: state.search, category: state.category, favorite: state.view === 'favorites', unwatched: state.view === 'unwatched', sort: state.sort }; }
async function loadList(append = false) {
  if (append && state.busy) return;
  const requestNumber = ++listRequest;
  state.busy = true;
  if (!append) state.offset = 0;
  const params = new URLSearchParams({ ...listFilters(), limit: '48', offset: String(state.offset) });
  const box = $('libraryGrid');
  if (!append) box.innerHTML = '<div class="empty">Buscando suas descobertas...</div>';
  try {
    const res = await api('/api/videos?' + params);
    if (requestNumber !== listRequest) return;
    state.total = res.total;
    state.videos = append ? state.videos.concat(res.videos) : res.videos;
    box.innerHTML = state.videos.length ? state.videos.map(card).join('') : skeletonEmpty('Nada por aqui ainda', state.search ? 'Tente buscar com outras palavras ou confira se o conteúdo foi salvo na transcrição.' : 'Essa coleção está vazia. Comece a guardar suas ideias.','🔎', !state.search);
    $('resultsCount').textContent = `${res.total} vídeo${res.total === 1 ? '' : 's'} encontrado${res.total === 1 ? '' : 's'}`;
    $('loadMore').hidden = state.videos.length >= res.total;
    $('clearFilters').hidden = !state.search && state.category === 'all';
    state.offset = state.videos.length;
  } catch(e) { if (requestNumber === listRequest) { box.innerHTML = skeletonEmpty('Erro ao carregar vídeos', e.message, '⚠️', false); toast(e.message, true); } }
  finally { if (requestNumber === listRequest) state.busy = false; }
}
const viewNames = { home: 'Visão geral', library: 'Minha biblioteca', favorites: 'Favoritos', unwatched: 'Para assistir', chat: 'Chat inteligente', thoughts: 'Diário de pensamentos', tips: 'Dicas para o momento', finance: 'Minhas finanças', backup: 'Backup e dados' };
async function navigate(view, category = 'all') {
  const known = viewNames[view] ? view : 'home';
  state.view = known;
  if (known === 'library') state.category = category;
  else state.category = 'all';
  state.search = ''; state.sort = 'recent'; state.videos = [];
  document.querySelectorAll('.view').forEach(el => el.hidden = true);
  $(known === 'home' ? 'homeView' : known === 'chat' ? 'chatView' : known === 'thoughts' ? 'thoughtsView' : known === 'tips' ? 'tipsView' : known === 'finance' ? 'financeView' : known === 'backup' ? 'backupView' : 'libraryView').hidden = false;
  $('addVideoBtn').hidden = known === 'finance';
  $('breadcrumbActive').textContent = known === 'library' && state.category !== 'all' ? catOf(state.category).name : viewNames[known];
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === known && (known !== 'library' || state.category === 'all')));
  document.querySelectorAll('[data-cat]').forEach(el => el.classList.toggle('active', known === 'library' && el.dataset.cat === category));
  $('sidebar').classList.remove('open'); $('sidebarBackdrop').hidden = true;
  if (known === 'home') await loadHome();
  if (known === 'thoughts') await loadThoughts();
  if (known === 'tips') await loadTips();
  if (known === 'finance') await loadFinance();
  if (['library', 'favorites', 'unwatched'].includes(known)) {
    $('libraryTitle').textContent = known === 'favorites' ? 'Meus favoritos' : known === 'unwatched' ? 'Para assistir depois' : state.category !== 'all' ? catOf(state.category).name : 'Minha biblioteca';
    $('librarySubtitle').textContent = known === 'favorites' ? 'Tudo que você mais gostou, num só lugar.' : known === 'unwatched' ? 'Vídeos que ainda merecem sua atenção.' : 'Encontre qualquer ideia pelo assunto, resumo ou transcrição.';
    $('categoryFilter').value = state.category; $('searchInput').value = ''; $('sortFilter').value = 'recent';
    await loadList();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function openEditor(video = null, related = []) {
  const form = $('videoForm'); form.reset(); state.editId = video?.id || null;
  $('editorTitle').textContent = video ? 'Editar vídeo salvo' : 'Adicionar novo vídeo';
  $('deleteVideoBtn').hidden = !video;
  $('newInfoBtn').hidden = !video;
  const relatedBox = $('relatedInfoPanel');
  relatedBox.hidden = !related.length;
  relatedBox.innerHTML = related.length ? `<strong>Outras informações deste mesmo link</strong><div class="related-links">${related.map(v => `<button type="button" class="related-link" data-edit="${esc(v.id)}">↗ ${esc(v.title)}</button>`).join('')}</div>` : ''; 
  $('videoCategory').value = video?.category || (state.category !== 'all' ? state.category : 'outros');
  for (const key of ['url', 'title', 'summary', 'transcript', 'notes', 'tags', 'cover_url', 'visual_description']) form.elements.namedItem(key).value = video?.[key] || '';
  form.elements.namedItem('favorite').checked = Boolean(video?.favorite);
  form.elements.namedItem('watched').checked = Boolean(video?.watched);
  $('visualFile').value = ''; $('visualUrl').value = '';
  refreshVisualPreview(video);
  $('videoModal').hidden = false;
  form.elements.namedItem('url').focus();
}
function closeEditor() { $('videoModal').hidden = true; state.editId = null; $('visualFile').value = ''; $('visualUrl').value = ''; }
async function editVideo(id) {
  try { const { video, related } = await api('/api/videos/' + encodeURIComponent(id)); openEditor(video, related || []); }
  catch (e) { toast(e.message, true); }
}
async function newInformation(id) {
  try {
    const { video } = await api('/api/videos/' + encodeURIComponent(id));
    if (!video) throw new Error('Vídeo original não encontrado.');
    if (!$('videoModal').hidden && state.editId && !confirm('Abrir outra ficha? Alterações ainda não salvas serão descartadas.')) return;
    openEditor();
    const form = $('videoForm');
    form.elements.namedItem('url').value = video.url;
    form.elements.namedItem('category').value = video.category;
    form.elements.namedItem('tags').value = video.tags || '';
    $('editorTitle').textContent = 'Nova informação deste vídeo';
    form.elements.namedItem('title').focus();
    toast('Adicione um novo título e informação; o link pode se repetir.');
  } catch(e) { toast(e.message, true); }
}
let previewBlobUrl = null;
function refreshVisualPreview(video = null) {
  if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
  const existing = Boolean(video?.has_image);
  $('visualPreview').hidden = !existing;
  if (existing) $('visualPreviewImg').src = `/api/videos/${encodeURIComponent(video.id)}/image?v=${Date.now()}`;
  else $('visualPreviewImg').removeAttribute('src');
  $('visualStatus').textContent = existing ? 'Screenshot salvo em seu banco D1' : '';
  $('visualAnalyzeBtn').hidden = !existing;
  $('visualRemoveBtn').hidden = !existing;
}
async function compactImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG ou WebP.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Imagem não pôde ser aberta.'); }
  try {
    const maxSide = 1500;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const makeBlob = q => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', q));
    let blob;
    for (let attempt = 0; attempt < 8; attempt++) {
      blob = await makeBlob(Math.max(0.58, 0.89 - attempt * 0.055));
      if (blob && blob.size <= 450000) return blob;
      const factor = 0.87;
      const width = Math.round(canvas.width * factor), height = Math.round(canvas.height * factor);
      if (width < 320 || height < 180) break;
      const copy = document.createElement('canvas'); copy.width = width; copy.height = height;
      copy.getContext('2d').drawImage(canvas, 0, 0, width, height);
      canvas.width = width; canvas.height = height;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(copy, 0, 0);
    }
    throw new Error('A captura tem muitos detalhes para o limite gratuito. Recorte uma parte e tente novamente.');
  } finally { bitmap.close?.(); }
}
async function uploadOrImportImage(id) {
  const file = $('visualFile').files[0];
  const link = $('visualUrl').value.trim();
  if (file) {
    $('visualStatus').textContent = 'Compactando e salvando captura...';
    const blob = await compactImage(file);
    await api(`/api/videos/${id}/image`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
  } else if (link) {
    await api(`/api/videos/${id}/import-image`, { method: 'POST', body: JSON.stringify({ url: link }) });
  }
  $('visualFile').value = ''; $('visualUrl').value = '';
  refreshVisualPreview({ id, has_image: true });
  $('videoForm').elements.namedItem('visual_description').value = '';
}
async function analyzeCurrentImage() {
  if (!state.editId) return;
  const btn = $('visualAnalyzeBtn'); btn.disabled = true;
  const previous = btn.textContent; btn.textContent = 'Analisando screenshot…';
  try {
    const data = await api(`/api/videos/${state.editId}/analyze-image`, { method: 'POST' });
    $('videoForm').elements.namedItem('visual_description').value = data.visual_description;
    toast('Imagem analisada! Agora ela pode ser encontrada no chat.');
    await refreshCurrent();
  } catch(e) { toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = previous; }
}
async function removeCurrentImage() {
  if (!state.editId || !confirm('Apagar o screenshot e a descrição visual gerada?')) return;
  try {
    await api(`/api/videos/${state.editId}/image`, { method: 'DELETE' });
    refreshVisualPreview(null);
    $('videoForm').elements.namedItem('visual_description').value = '';
    toast('Imagem removida.'); await refreshCurrent();
  } catch(e) { toast(e.message, true); }
}
async function saveVideo(e) {
  e.preventDefault(); const form = e.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  body.favorite = form.elements.namedItem('favorite').checked;
  body.watched = form.elements.namedItem('watched').checked;
  $('saveVideoBtn').disabled = true;
  try {
    const wasEditing = Boolean(state.editId);
    const { video } = await api(state.editId ? '/api/videos/' + state.editId : '/api/videos', { method: state.editId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    state.editId = video.id;
    if ($('visualFile').files[0] || $('visualUrl').value.trim()) {
      try {
        await uploadOrImportImage(video.id);
        video.has_image = 1;
      } catch (imgError) {
        $('editorTitle').textContent = 'Editar vídeo salvo';
        toast('O vídeo foi salvo, mas a imagem falhou: ' + imgError.message, true);
        await refreshCurrent();
        return;
      }
    }
    closeEditor(); toast(wasEditing ? 'Vídeo atualizado!' : 'Vídeo salvo!');
    await refreshCurrent();
  } catch (err) { toast(err.message, true); }
  finally { $('saveVideoBtn').disabled = false; }
}
async function deleteVideo() {
  if (!state.editId) return;
  if (!confirm('Excluir este vídeo e todas as suas transcrições/anotações? Essa ação não pode ser desfeita.')) return;
  try { await api('/api/videos/' + state.editId, { method: 'DELETE' }); closeEditor(); toast('Vídeo excluído.'); await refreshCurrent(); }
  catch (e) { toast(e.message, true); }
}
async function toggleFavorite(id) {
  try {
    const { video } = await api('/api/videos/' + id);
    video.favorite = !video.favorite;
    await api('/api/videos/' + id, { method: 'PUT', body: JSON.stringify(video) });
    toast(video.favorite ? 'Adicionado aos favoritos ♡' : 'Removido dos favoritos');
    await refreshCurrent();
  } catch (e) { toast(e.message, true); }
}
async function refreshCurrent() { if (state.view === 'home') await loadHome(); else if (['library', 'favorites', 'unwatched'].includes(state.view)) await loadList(); }
function savedChatImageUrl(source) {
  if (source.has_image && /^[0-9a-f-]{36}$/i.test(String(source.id || ''))) {
    return '/api/videos/' + encodeURIComponent(source.id) + '/image';
  }
  // URLs de páginas HTML (como prnt.sc/abc) NÃO são imagens diretas.
  try {
    const url = new URL(source.cover_url || '');
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const trusted = ['i.imgur.com', 'image.prntscr.com', 'images.prntscr.com',
      'cdn.discordapp.com', 'media.discordapp.net', 'pbs.twimg.com',
      'raw.githubusercontent.com'];
    if (trusted.includes(url.hostname.toLowerCase()) || /\.(png|jpe?g|webp)$/i.test(url.pathname)) return url.toString();
  } catch {}
  return '';
}
function chatSourceCard(source, index) {
  const card = document.createElement('article');
  card.className = 'chat-source-card';
  const preview = document.createElement('div');
  preview.className = 'chat-source-preview';
  const body = document.createElement('div');
  body.className = 'chat-source-body';
  const heading = document.createElement('strong');
  heading.textContent = '[' + (index + 1) + '] ' + source.title;
  body.append(heading);
  const summary = String(source.summary || '').trim();
  if (summary && summary !== source.title && !/^https?:\/\/\S+$/.test(summary)) {
    const description = document.createElement('p');
    description.textContent = summary.slice(0, 210);
    body.append(description);
  }
  const actions = document.createElement('div');
  actions.className = 'chat-source-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'source-button';
  edit.textContent = 'Abrir ficha';
  edit.addEventListener('click', () => editVideo(source.id));
  actions.append(edit);

  function drawPreview() {
    preview.replaceChildren();
    const imageSrc = savedChatImageUrl(source);
    if (!imageSrc) {
      const placeholder = document.createElement('div');
      placeholder.className = 'chat-source-placeholder';
      placeholder.textContent = source.screenshot_link ? 'Imagem ainda não importada' : 'Sem imagem anexada';
      preview.append(placeholder);
      return;
    }
    const link = document.createElement('a');
    link.href = imageSrc;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Abrir imagem em tamanho original';
    link.setAttribute('aria-label', 'Ampliar imagem da ficha ' + source.title);
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = 'Captura salva: ' + source.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      preview.replaceChildren();
      const placeholder = document.createElement('div');
      placeholder.className = 'chat-source-placeholder';
      placeholder.textContent = 'Prévia indisponível — abra a ficha';
      preview.append(placeholder);
    }, { once: true });
    link.append(img);
    preview.append(link);
  }
  drawPreview();
  try {
    const capture = new URL(source.screenshot_link || '');
    if (capture.protocol === 'https:' && capture.hostname === 'prnt.sc') {
      const open = document.createElement('a');
      open.className = 'source-button';
      open.textContent = 'Ver no Lightshot ↗';
      open.href = capture.toString();
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      actions.append(open);
      if (!source.has_image) {
        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.className = 'source-button';
        importButton.textContent = 'Importar captura';
        importButton.addEventListener('click', async () => {
          importButton.disabled = true;
          importButton.textContent = 'Importando...';
          try {
            await api('/api/videos/' + encodeURIComponent(source.id) + '/import-image', {
              method: 'POST', body: JSON.stringify({ url: capture.toString() })
            });
            source.has_image = true;
            drawPreview();
            importButton.remove();
            toast('Imagem salva! Agora aparece no chat e na ficha.');
          } catch (e) {
            toast(e.message + ' Se necessário, envie a imagem pela edição da ficha.', true);
            importButton.disabled = false;
            importButton.textContent = 'Importar captura';
          }
        });
        actions.append(importButton);
      }
    }
  } catch {}
  body.append(actions);
  card.append(preview, body);
  return card;
}
function closeMediaPlayer() {
  $('mediaPlayerFrame').replaceChildren(); // desmonta iframe e interrompe áudio
  $('mediaPlayerModal').hidden = true;
  playerVideoId = null;
}
function openMediaPlayer(id) {
  const video = [...state.videos, ...(state.homeVideos || [])].find(v => v.id === id);
  if (!video) { toast('Não encontrei a ficha. Atualize a biblioteca.', true); return; }
  const embed = embeddedMediaLink(video.url);
  if (!embed) { toast('Este site não oferece um player incorporado aqui. Use Abrir original.', true); return; }
  closeImageViewer();
  playerVideoId = id;
  $('mediaPlayerTitle').textContent = video.title;
  $('mediaPlayerProvider').textContent = embed.provider + ' · Reprodução incorporada, sem baixar';
  $('mediaPlayerOriginal').href = embed.originalUrl;
  const frame = document.createElement('iframe');
  frame.src = embed.embedUrl;
  frame.title = 'Vídeo do ' + embed.provider + ': ' + video.title;
  frame.loading = 'eager';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.setAttribute('allowfullscreen','');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms');
  $('mediaPlayerFrame').className = 'media-player-frame media-frame-' + embed.format;
  $('mediaPlayerFrame').replaceChildren(frame);
  $('mediaPlayerModal').hidden = false;
  $('mediaPlayerClose').focus();
}
function collectPreviewItems(id) {
  const selector = ['library','favorites','unwatched'].includes(state.view) ? '#libraryGrid' : '#homeGrid';
  const items = [...document.querySelectorAll(selector + ' .video-card')]
    .filter(card => !card.querySelector('.card-art.image-failed'))
    .map(card => ({
      id: card.dataset.video,
      url: card.querySelector('.card-art img')?.getAttribute('src') || '',
      title: card.querySelector('.card-title')?.textContent || 'Imagem salva'
    })).filter(item => item.url);
  const idx = items.findIndex(item => item.id === id);
  return { items, index: idx };
}
function closeImageViewer() {
  $('imageViewerModal').hidden = true;
  $('imageViewerImage').removeAttribute('src');
  imagePreviewItems = [];
  imagePreviewIndex = 0;
}
function showImagePreview(index) {
  if (!imagePreviewItems.length) return;
  imagePreviewIndex = (index + imagePreviewItems.length) % imagePreviewItems.length;
  const item = imagePreviewItems[imagePreviewIndex];
  $('imageViewerTitle').textContent = item.title;
  $('imageViewerImage').alt = 'Imagem ampliada: ' + item.title;
  $('imageViewerImage').src = item.url;
  $('imageViewerCount').textContent = (imagePreviewIndex + 1) + ' de ' + imagePreviewItems.length;
  $('imageViewerPrevious').disabled = imagePreviewItems.length < 2;
  $('imageViewerNext').disabled = imagePreviewItems.length < 2;
}
function openImageViewer(id) {
  const {items, index} = collectPreviewItems(id);
  if (index < 0) { toast('Imagem indisponível. Abra a ficha para conferir o anexo.', true); return; }
  closeMediaPlayer();
  imagePreviewItems = items;
  $('imageViewerModal').hidden = false;
  showImagePreview(index);
  $('imageViewerClose').focus();
}

function appendMessage(kind, content, sources = [], aiUnavailable = false) {
  $('chatMessages').querySelector('.chat-welcome')?.remove();
  const block = document.createElement('div');
  block.className = 'message ' + kind;
  if (kind === 'bot') {
    const ico = document.createElement('span');
    ico.className = 'bot-avatar';
    ico.textContent = '✧';
    block.append(ico);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const answer = document.createElement('div');
  answer.textContent = content;
  bubble.append(answer);
  if (sources.length) {
    const cards = document.createElement('div');
    cards.className = 'chat-sources';
    sources.forEach((source, index) => cards.append(chatSourceCard(source, index)));
    bubble.append(cards);
  }
  if (aiUnavailable) {
    const note = document.createElement('small');
    note.className = 'chat-ai-unavailable';
    note.textContent = 'A busca textual continua ativa mesmo quando a IA está indisponível.';
    bubble.append(note);
  }
  block.append(bubble);
  $('chatMessages').append(block);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  return block;
}

async function submitChat(message) {
  if (!message || message.trim().length < 3) return;
  $('chatInput').value = ''; appendMessage('user', message);
  $('sendChatBtn').disabled = true;
  const loading = appendMessage('bot', 'Consultando seus vídeos...');
  try {
    const res = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
    loading.remove(); appendMessage('bot', res.answer, res.sources || [], res.aiUnavailable);
  } catch(e) { loading.remove(); appendMessage('bot', 'Não consegui buscar agora: ' + e.message); }
  finally { $('sendChatBtn').disabled = false; $('chatInput').focus(); }
}


/* Motivação contextual — só usa dicas salvas na conta autenticada. */
let motivationMoment = null;
let motivationRequest = 0;
function closeMotivation() {
  ++motivationRequest;
  $('motivationModal').hidden = true;
  motivationMoment = null;
  $('motivationResult').replaceChildren();
  document.querySelectorAll('[data-motivation-moment]').forEach(button=>button.setAttribute('aria-pressed','false'));
}
function renderMotivation() {
  const container=$('motivationResult');
  container.replaceChildren();
  for(const button of document.querySelectorAll('[data-motivation-moment]'))
    button.setAttribute('aria-pressed',String(button.dataset.motivationMoment === motivationMoment));
  const picks=motivationMoment?selectMotivationTips(state.tips,motivationMoment,3):[];
  const heading=document.createElement('h3');
  heading.textContent=motivationMoment ? 'Lembretes que você guardou' : 'Escolha o momento';
  container.append(heading);
  if(!motivationMoment){
    const p=document.createElement('p');p.textContent='Escolha uma das opções acima para consultar sua biblioteca.';container.append(p);
    return;
  }
  if(!picks.length){
    const p=document.createElement('p');
    p.textContent='Ainda não encontrei lembretes para esta situação. Você pode adicionar um na categoria Motivação e mentalidade.';
    container.append(p);
    return;
  }
  for(const tip of picks){
    const article=document.createElement('article');article.className='motivation-advice';
    const title=document.createElement('strong');title.textContent=tip.title;
    const content=document.createElement('p');content.textContent=tip.content;
    const footer=document.createElement('div');footer.className='motivation-advice-foot';
    const category=document.createElement('small');category.textContent=tip.situation;
    const open=document.createElement('button');open.type='button';open.textContent='Editar lembrete ↗';
    open.addEventListener('click',async()=>{
      closeMotivation();
      await navigate('tips');
      openTipEditor(tip.id);
    });
    footer.append(category,open);article.append(title,content,footer);
    container.append(article);
  }
}
async function openMotivation() {
  if(!$('loginOverlay').hidden) return;
  const request=++motivationRequest;
  $('motivationModal').hidden=false;
  motivationMoment=null;
  const box=$('motivationResult');
  box.replaceChildren();
  const status=document.createElement('p');status.textContent='Procurando seus lembretes...';box.append(status);
  $('motivationCloseBtn').focus();
  try{
    const result=await api('/api/tips');
    if(request!==motivationRequest || !$('loginOverlay').hidden)return;
    state.tips=result.tips||[];
    renderMotivation();
  }catch(e){
    if(request===motivationRequest){box.replaceChildren();const p=document.createElement('p');p.textContent='Não consegui buscar suas dicas: '+e.message;box.append(p);}
  }
}

/* Dicas para o momento: cartões práticos filtrados por situação, independentes do diário. */
const standardTipContexts = ['Conversar','Sair de casa','Na rua','Segurança','Para mim','Foco e produtividade','Motivação e mentalidade'];
const tipLabel = situation => ({
  'Conversar':'Vou conversar','Sair de casa':'Vou sair','Na rua':'Na rua',
  'Segurança':'Segurança','Para mim':'Para mim','Foco e produtividade':'Foco e produtividade','Motivação e mentalidade':'Motivação e mentalidade','Geral':'Geral'
})[situation] || situation;
function normalizeTipText(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
async function loadTips() {
  try {
    const result = await api('/api/tips');
    state.tips = result.tips || [];
    renderTips();
  } catch(e) {
    $('tipsGrid').replaceChildren();
    const msg = document.createElement('p');
    msg.className = 'tips-empty';
    msg.textContent = 'Não consegui carregar suas dicas: ' + e.message;
    $('tipsGrid').append(msg);
  }
}
function renderTips() {
  const contexts = [...new Set(state.tips.map(t => t.situation || 'Geral'))];
  const extra = contexts.filter(c => !standardTipContexts.includes(c));
  const extraBox = $('tipsCustomContexts');
  extraBox.replaceChildren();
  extraBox.hidden = extra.length === 0;
  extra.forEach(context => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tips-extra-button';
    button.dataset.tipContext = context;
    button.textContent = '# ' + context;
    extraBox.append(button);
  });
  document.querySelectorAll('[data-tip-context]').forEach(button => {
    const selected = button.dataset.tipContext === state.tipsContext;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const q = normalizeTipText(state.tipsSearch.trim());
  const tips = state.tips.filter(t =>
    (state.tipsContext === 'all' || t.situation === state.tipsContext) &&
    (state.tipsKind === 'all' || t.kind === state.tipsKind) &&
    (!state.tipsFavoritesOnly || Boolean(t.favorite)) &&
    (!q || normalizeTipText([t.title,t.content,t.situation].join(' ')).includes(q))
  );
  $('tipsCurrentHeading').textContent = state.tipsContext === 'all' ? 'Minhas dicas' : tipLabel(state.tipsContext);
  $('tipsResultCount').textContent = tips.length + (tips.length === 1 ? ' lembrete disponível' : ' lembretes disponíveis');
  const box = $('tipsGrid');
  box.innerHTML = tips.length ? tips.map(t => {
    const icon = t.kind === 'frase' ? '❝' : '✦';
    const tag = t.kind === 'frase' ? 'FRASE PRÁTICA' : 'DICA ÚTIL';
    const url = t.source_url && /^https?:\/\//i.test(t.source_url) ? t.source_url : '';
    return '<article class="tip-card">' +
      '<div class="tip-card-top"><span class="tip-kind"><i aria-hidden="true">'+icon+'</i>'+tag+'</span>' +
      '<button class="tip-star '+(t.favorite?'is-favorite':'')+'" type="button" data-tip-fav="'+esc(t.id)+'" aria-label="'+(t.favorite?'Remover favorito':'Favoritar dica')+'" title="Destacar">'+(t.favorite?'★':'☆')+'</button></div>' +
      '<h3>'+esc(t.title)+'</h3><p class="tip-content">'+esc(t.content)+'</p>' +
      '<div class="tip-card-foot"><span class="tip-context-tag">'+esc(tipLabel(t.situation))+'</span>' +
      '<div class="tip-card-actions">'+(url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">Ver origem ↗</a>':'')+
      '<button type="button" data-tip-edit="'+esc(t.id)+'">Editar</button></div></div></article>';
  }).join('') : '<div class="tips-empty"><span aria-hidden="true">✧</span><strong>Nenhuma dica por aqui ainda.</strong><p>Você pode adicionar uma dica para esta situação, ou mudar os filtros.</p><button type="button" class="button button-primary" id="tipsEmptyAdd">＋ Criar dica</button></div>';
}
function setTipContext(context) {
  state.tipsContext = context;
  renderTips();
}
function closeTipEditor() {
  $('tipModal').hidden = true;
  state.tipEditId = null;
}
function openTipEditor(id = null) {
  const existing = id ? state.tips.find(x => x.id === id) : null;
  if (id && !existing) { toast('Dica não encontrada, atualize a página.', true); return; }
  state.tipEditId = existing?.id || null;
  const form = $('tipForm');
  form.reset();
  for (const key of ['title','content','situation','kind','source_url']) {
    form.elements.namedItem(key).value = existing?.[key] || (key === 'situation' ? (state.tipsContext === 'all' ? 'Conversar' : state.tipsContext) : key === 'kind' ? 'dica' : '');
  }
  form.elements.namedItem('favorite').checked = Boolean(existing?.favorite);
  $('tipModalTitle').textContent = existing ? 'Editar dica' : 'Nova dica';
  $('tipSaveBtn').textContent = existing ? 'Salvar alterações' : 'Salvar dica';
  $('tipDeleteBtn').hidden = !existing;
  $('tipModal').hidden = false;
  form.elements.namedItem('title').focus();
}
async function saveTip(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form).entries());
  input.favorite = form.elements.namedItem('favorite').checked;
  const button = $('tipSaveBtn');
  button.disabled = true;
  try {
    await api(state.tipEditId ? '/api/tips/' + state.tipEditId : '/api/tips', {
      method: state.tipEditId ? 'PUT' : 'POST', body: JSON.stringify(input)
    });
    closeTipEditor();
    await loadTips();
    toast('Dica salva para consultar quando precisar.');
  } catch(e) { toast(e.message,true); }
  finally { button.disabled = false; }
}
async function deleteTip() {
  if (!state.tipEditId || !confirm('Excluir esta dica? Esta ação não pode ser desfeita.')) return;
  const id = state.tipEditId;
  try {
    await api('/api/tips/' + id, { method: 'DELETE' });
    closeTipEditor(); await loadTips(); toast('Dica excluída.');
  } catch(e) { toast(e.message,true); }
}
async function toggleTipFavorite(id) {
  const tip = state.tips.find(t=>t.id === id);
  if (!tip) return;
  try {
    const res = await api('/api/tips/' + id, { method: 'PATCH', body: JSON.stringify({favorite:!Boolean(tip.favorite)}) });
    Object.assign(tip,res.tip);
    renderTips();
  } catch(e) { toast(e.message,true); }
}

// Diário de pensamentos. Sem inferir emoções nem avaliar os registros automaticamente.
function updateThoughtProgress() {
  const form = $('thoughtForm');
  const required = ['situation', 'automatic_thought'];
  const completed = required.filter(name => form.elements.namedItem(name).value.trim().length > 0).length;
  $('thoughtProgressText').textContent = completed + ' de 2 preenchidos';
  $('thoughtProgressFill').style.width = (completed / required.length * 100) + '%';
  $('thoughtProgressTrack').setAttribute('aria-valuenow', String(completed));
}
async function loadThoughts() {
  try {
    const { thoughts } = await api('/api/thoughts?limit=250');
    state.thoughts = thoughts;
    $('thoughtCount').textContent = String(thoughts.length);
    $('thoughtList').innerHTML = thoughts.length ? thoughts.map(t => {
      const feeling = t.emotion ? '<span class="thought-entry-emotion">' + esc(t.emotion) + '</span>' : '';
      const after = t.intensity_after === null || t.intensity_after === undefined ? '' :
        '<span>Depois: ' + esc(t.intensity_after) + '/10</span>';
      return `
        <div class="thought-entry">
          <div class="thought-entry-date">${esc(date(t.created_at))}${feeling}</div>
          <strong>${esc(t.situation)}</strong>
          <p>“${esc(t.automatic_thought)}”</p>
          ${t.balanced_thought ? `<div class="thought-anchor">✧ ${esc(t.balanced_thought)}</div>` : ''}
          <div class="thought-entry-foot">
            <div class="thought-entry-intensity"><span>Antes: ${esc(t.intensity_before)}/10</span>${after}</div>
            <div>
              <button type="button" data-thought-edit="${esc(t.id)}" aria-label="Editar reflexão">Editar</button>
              <button type="button" data-thought-delete="${esc(t.id)}" aria-label="Excluir reflexão">Excluir</button>
            </div>
          </div>
        </div>`;
    }).join('') : '<div class="thought-empty"><span class="thought-empty-icon" aria-hidden="true">✍</span><strong>Sua primeira página começa aqui.</strong><p>Quando você salvar uma reflexão, ela aparecerá neste espaço.</p></div>';
  } catch(e) { toast('Não consegui carregar o diário: ' + e.message, true); }
}
function resetThoughtForm() {
  const form = $('thoughtForm'); form.reset();
  form.elements.namedItem('intensity_before').value = '5';
  state.thoughtEditId = null;
  state.thoughtSuggestion = '';
  $('thoughtSuggestion').hidden = true;
  $('thoughtFormTitle').textContent = 'Registrar um pensamento';
  $('thoughtSaveBtn').textContent = 'Salvar reflexão →';
  updateThoughtProgress();
  $('thoughtCancelBtn').hidden = true;
}
async function editThought(id) {
  try {
    const { thought } = await api('/api/thoughts/' + encodeURIComponent(id));
    resetThoughtForm(); state.thoughtEditId = id;
    const form = $('thoughtForm');
    for (const key of ['situation','emotion','intensity_before','automatic_thought','evidence_for','evidence_against','balanced_thought','next_step','intensity_after','source_url']) {
      form.elements.namedItem(key).value = thought[key] ?? '';
    }
    $('thoughtFormTitle').textContent = 'Editar reflexão';
    $('thoughtSaveBtn').textContent = 'Salvar alterações';
    $('thoughtCancelBtn').hidden = false;
    updateThoughtProgress();
    $('thoughtForm').scrollIntoView({behavior:'smooth',block:'start'});
  } catch (e) { toast(e.message, true); }
}
async function saveThought(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  $('thoughtSaveBtn').disabled = true;
  try {
    await api(state.thoughtEditId ? '/api/thoughts/' + state.thoughtEditId : '/api/thoughts', {
      method: state.thoughtEditId ? 'PUT' : 'POST', body: JSON.stringify(body)
    });
    resetThoughtForm(); await loadThoughts(); toast('Reflexão salva no diário.');
  } catch(err) { toast(err.message,true); }
  finally { $('thoughtSaveBtn').disabled = false; }
}
async function deleteThought(id) {
  if (!confirm('Excluir este registro de pensamento? Esta ação não pode ser desfeita.')) return;
  try { await api('/api/thoughts/' + encodeURIComponent(id), {method:'DELETE'});
    if (state.thoughtEditId === id) resetThoughtForm();
    await loadThoughts(); toast('Registro excluído.');
  } catch(e) { toast(e.message,true); }
}
async function suggestThought() {
  const form = $('thoughtForm');
  const body = Object.fromEntries(new FormData(form).entries());
  if (!body.situation.trim() || !body.automatic_thought.trim()) { toast('Preencha a situação e o pensamento antes de usar a IA.',true); return; }
  const btn = $('suggestThoughtBtn'); const previous = btn.textContent; btn.disabled=true; btn.textContent='Pensando em uma alternativa…';
  try {
    const {suggestion} = await api('/api/thoughts/suggest',{method:'POST',body:JSON.stringify(body)});
    state.thoughtSuggestion = suggestion;
    $('thoughtSuggestionText').textContent = suggestion;
    $('thoughtSuggestion').hidden = false;
  } catch(e) { toast(e.message,true); }
  finally { btn.disabled=false; btn.textContent=previous; }
}

async function exportData() {
  try {
    const result = await api('/api/export');
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `relembra-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
    toast('Backup baixado! Guarde-o em um local seguro.');
  } catch(e) { toast(e.message, true); }
}
async function importData(file) {
  if (!file) return;
  if (file.size > 25_000_000) { toast('Arquivo muito grande. Limite: 25 MB.', true); return; }
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.videos) && !Array.isArray(data.thoughts) && !Array.isArray(data.tips) && !data.finances) throw new Error('Esse arquivo não contém um backup válido.');
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const thoughts = Array.isArray(data.thoughts) ? data.thoughts : [];
    const tips = Array.isArray(data.tips) ? data.tips : [];
    let imported = 0, skipped = 0, thoughtsImported = 0, thoughtsSkipped = 0, tipsImported = 0, tipsSkipped = 0, financeImported = 0, financeSkipped = 0;
    const videoGroups = []; let group = [], groupBytes = 0;
    for (const video of videos) {
      const size = new TextEncoder().encode(JSON.stringify(video)).length + 50;
      if (group.length && (group.length >= 200 || groupBytes + size > 2_000_000)) { videoGroups.push(group); group = []; groupBytes = 0; }
      group.push(video); groupBytes += size;
    }
    if (group.length) videoGroups.push(group);
    const thoughtGroups = []; group = []; groupBytes = 0;
    for (const thought of thoughts) {
      const size = new TextEncoder().encode(JSON.stringify(thought)).length + 50;
      if (group.length && (group.length >= 200 || groupBytes + size > 2_000_000)) { thoughtGroups.push(group); group = []; groupBytes = 0; }
      group.push(thought); groupBytes += size;
    }
    if (group.length) thoughtGroups.push(group);
    const tipGroups = []; group = []; groupBytes = 0;
    for (const tip of tips) {
      const size = new TextEncoder().encode(JSON.stringify(tip)).length + 50;
      if (group.length && (group.length >= 200 || groupBytes + size > 2_000_000)) { tipGroups.push(group); group = []; groupBytes = 0; }
      group.push(tip); groupBytes += size;
    }
    if (group.length) tipGroups.push(group);
    const finances = data.finances || {};
    const financeGroups = {};
    for (const kind of ['entries','bills','goals']) {
      const rows = Array.isArray(finances[kind]) ? finances[kind] : [];
      financeGroups[kind] = [];
      for (let i = 0; i < rows.length; i += 200) financeGroups[kind].push(rows.slice(i, i + 200));
    }
    const total = Math.max(videoGroups.length, thoughtGroups.length, tipGroups.length, ...Object.values(financeGroups).map(g => g.length), 1);
    for (let index = 0; index < total; index++) {
      toast(`Restaurando backup: lote ${index + 1} de ${total}...`);
      const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ categories: data.categories || [], videos: videoGroups[index] || [], thoughts: thoughtGroups[index] || [], tips: tipGroups[index] || [], finances: { entries:financeGroups.entries[index] || [], bills:financeGroups.bills[index] || [], goals:financeGroups.goals[index] || [] } }) });
      imported += res.imported; skipped += res.skipped;
      thoughtsImported += res.thoughtsImported || 0; thoughtsSkipped += res.thoughtsSkipped || 0;
      tipsImported += res.tipsImported || 0; tipsSkipped += res.tipsSkipped || 0;
      financeImported += res.financeImported || 0; financeSkipped += res.financeSkipped || 0;
    }
    await syncCategories();
    if (state.view === 'thoughts') await loadThoughts();
    if (state.view === 'tips') await loadTips();
    if (state.view === 'finance') await loadFinance();
    toast(`${imported} vídeos, ${thoughtsImported} reflexões e ${tipsImported} dicas e ${financeImported} registros financeiros importados; ${skipped + thoughtsSkipped + tipsSkipped + financeSkipped} já existentes/ignorados.`);
  } catch (e) { toast(e.message, true); }
  finally { $('importFile').value = ''; }
}
async function createCategory(e) {
  e.preventDefault();
  // currentTarget é esvaziado pelo navegador após o dispatch do evento.
  // Guardar o formulário ANTES do await evita 'Cannot read properties of null (reading reset)'.
  const form = e.currentTarget;
  const button = form.querySelector('button[type=submit]');
  const body = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  try { await api('/api/categories', { method: 'POST', body: JSON.stringify(body) }); $('categoryModal').hidden = true; form.reset(); await syncCategories(); toast('Categoria pronta para usar!'); }
  catch (err) { toast(err.message, true); }
  finally { button.disabled = false; }
}
function bindEvents() {
  document.querySelectorAll('[data-open-motivation]').forEach(button=>button.addEventListener('click',openMotivation));
  $('motivationCloseBtn').addEventListener('click',closeMotivation);
  $('motivationModal').addEventListener('click',event=>{if(event.target===$('motivationModal'))closeMotivation();});
  document.querySelectorAll('[data-motivation-moment]').forEach(button=>button.addEventListener('click',()=>{motivationMoment=button.dataset.motivationMoment;renderMotivation();}));
  $('motivationSeeAll').addEventListener('click',async()=>{closeMotivation();await navigate('tips');setTipContext('Motivação e mentalidade');});
  $('motivationAddTip').addEventListener('click',async()=>{closeMotivation();await navigate('tips');setTipContext('Motivação e mentalidade');openTipEditor();});

  setViewMode(savedViewMode());
  document.querySelectorAll('[data-view-mode]').forEach(btn => btn.addEventListener('click', () => setViewMode(btn.dataset.viewMode)));
  $('mediaPlayerClose').addEventListener('click', closeMediaPlayer);
  $('mediaPlayerModal').addEventListener('click', e => { if (e.target === $('mediaPlayerModal')) closeMediaPlayer(); });
  $('mediaPlayerEdit').addEventListener('click', () => { const id = playerVideoId; closeMediaPlayer(); if(id) editVideo(id); });
  $('imageViewerClose').addEventListener('click', closeImageViewer);
  $('imageViewerModal').addEventListener('click', e => { if (e.target === $('imageViewerModal')) closeImageViewer(); });
  $('imageViewerPrevious').addEventListener('click', () => showImagePreview(imagePreviewIndex - 1));
  $('imageViewerNext').addEventListener('click', () => showImagePreview(imagePreviewIndex + 1));
  $('imageViewerEdit').addEventListener('click', () => { const item = imagePreviewItems[imagePreviewIndex]; closeImageViewer(); if(item) editVideo(item.id); });
  $('imageViewerImage').addEventListener('error', () => { if (!$('imageViewerModal').hidden) toast('Não foi possível carregar a imagem. Confira o anexo no editor.', true); });
  $('todayText').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());
  $('addVideoBtn').addEventListener('click', () => openEditor()); $('newFromLibrary').addEventListener('click', () => openEditor());
  $('newInfoBtn').addEventListener('click', () => { if (state.editId) newInformation(state.editId); });
  $('closeVideoBtn').addEventListener('click', closeEditor); $('cancelVideoBtn').addEventListener('click', closeEditor);
  $('videoModal').addEventListener('click', e => { if (e.target === $('videoModal')) closeEditor(); });
  $('videoForm').addEventListener('submit', saveVideo); $('deleteVideoBtn').addEventListener('click', deleteVideo);
  $('visualFile').addEventListener('change', e => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    if (e.target.files[0]) {
      previewBlobUrl = URL.createObjectURL(e.target.files[0]);
      $('visualPreviewImg').src = previewBlobUrl;
      $('visualPreview').hidden = false;
      $('visualStatus').textContent = 'Prévia local; salve o vídeo para armazenar esta imagem.';
      $('visualRemoveBtn').hidden = true;
      $('visualAnalyzeBtn').hidden = true;
      $('visualUrl').value = '';
    } else refreshVisualPreview(null);
  });
  $('visualUrl').addEventListener('input', () => { if ($('visualUrl').value) $('visualFile').value = ''; });
  $('visualAnalyzeBtn').addEventListener('click', analyzeCurrentImage);
  $('visualRemoveBtn').addEventListener('click', removeCurrentImage);
  $('addCategoryBtn').addEventListener('click', () => { $('categoryModal').hidden = false; $('categoryForm').elements.namedItem('name').focus(); });
  $('closeCategoryBtn').addEventListener('click', () => $('categoryModal').hidden = true);
  $('cancelCategoryBtn').addEventListener('click', () => $('categoryModal').hidden = true);
  $('categoryModal').addEventListener('click', e => { if (e.target === $('categoryModal')) $('categoryModal').hidden = true; });
  $('categoryForm').addEventListener('submit', createCategory);
  $('logoutBtn').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); wipePreviousAccount(); $('loginOverlay').hidden = false; showAccountMode('login'); toast('Você saiu da biblioteca.'); } catch (e) { toast(e.message, true); } });
  $('menuBtn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sidebarBackdrop').hidden = false; });
  $('sidebarBackdrop').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebarBackdrop').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMotivation(); closeMediaPlayer(); closeImageViewer(); closeTipEditor(); closeEditor(); $('categoryModal').hidden = true; $('sidebar').classList.remove('open'); $('sidebarBackdrop').hidden = true; } });
  document.addEventListener('keydown', e => { if (!$('imageViewerModal').hidden && e.key === 'ArrowLeft') showImagePreview(imagePreviewIndex - 1); if (!$('imageViewerModal').hidden && e.key === 'ArrowRight') showImagePreview(imagePreviewIndex + 1); });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-view]'); if (a) { navigate(a.dataset.view); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { navigate('library', cat.dataset.cat); return; }
    const go = e.target.closest('[data-go]'); if (go) { navigate(go.dataset.go); return; }
    if (e.target.closest('[data-add]')) { openEditor(); return; }
    const view = e.target.closest('[data-preview]'); if (view) { openImageViewer(view.dataset.preview); return; }
    const watch = e.target.closest('[data-watch]'); if (watch) { openMediaPlayer(watch.dataset.watch); return; }
    const favorite = e.target.closest('[data-fav]'); if (favorite) { toggleFavorite(favorite.dataset.fav); return; }
    const edit = e.target.closest('[data-edit]'); if (edit) { editVideo(edit.dataset.edit); return; }
    const moreInfo = e.target.closest('[data-newinfo]'); if (moreInfo) { newInformation(moreInfo.dataset.newinfo); return; }
    const ctx = e.target.closest('[data-tip-context]'); if (ctx) { setTipContext(ctx.dataset.tipContext); return; }
    const tipEdit = e.target.closest('[data-tip-edit]'); if (tipEdit) { openTipEditor(tipEdit.dataset.tipEdit); return; }
    const tipFav = e.target.closest('[data-tip-fav]'); if (tipFav) { toggleTipFavorite(tipFav.dataset.tipFav); return; }
    if (e.target.closest('#tipsEmptyAdd')) { openTipEditor(); return; }
    const thoughtEdit = e.target.closest('[data-thought-edit]'); if (thoughtEdit) { editThought(thoughtEdit.dataset.thoughtEdit); return; }
    const thoughtDelete = e.target.closest('[data-thought-delete]'); if (thoughtDelete) { deleteThought(thoughtDelete.dataset.thoughtDelete); return; }
    const prompt = e.target.closest('[data-prompt]'); if (prompt) { submitChat(prompt.dataset.prompt); return; }
  });
  let searchTimer;
  $('searchInput').addEventListener('input', e => { state.search = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => loadList(), 320); });
  $('categoryFilter').addEventListener('change', e => { state.category = e.target.value; loadList(); });
  $('sortFilter').addEventListener('change', e => { state.sort = e.target.value; loadList(); });
  $('clearFilters').addEventListener('click', () => { state.search = ''; state.category = 'all'; $('searchInput').value = ''; $('categoryFilter').value = 'all'; loadList(); });
  $('loadMore').addEventListener('click', () => loadList(true));
  $('chatForm').addEventListener('submit', e => { e.preventDefault(); submitChat($('chatInput').value); });
  $('tipsAddBtn').addEventListener('click', () => openTipEditor());
  $('tipsSearch').addEventListener('input', e => { state.tipsSearch = e.target.value; renderTips(); });
  $('tipsKind').addEventListener('change', e => { state.tipsKind = e.target.value; renderTips(); });
  $('tipsFavoritesOnly').addEventListener('change', e => { state.tipsFavoritesOnly = e.target.checked; renderTips(); });
  $('tipCloseBtn').addEventListener('click', closeTipEditor);
  $('tipCancelBtn').addEventListener('click', closeTipEditor);
  $('tipModal').addEventListener('click', e => { if (e.target === $('tipModal')) closeTipEditor(); });
  $('tipForm').addEventListener('submit', saveTip);
  $('tipDeleteBtn').addEventListener('click', deleteTip);
  $('thoughtForm').addEventListener('submit', saveThought);
  $('thoughtForm').addEventListener('input', updateThoughtProgress);
  $('thoughtNewBtn').addEventListener('click', resetThoughtForm);
  $('thoughtCancelBtn').addEventListener('click', resetThoughtForm);
  $('suggestThoughtBtn').addEventListener('click', suggestThought);
  $('useThoughtSuggestion').addEventListener('click', () => {
    if (!state.thoughtSuggestion) return;
    const field = $('thoughtForm').elements.namedItem('balanced_thought');
    if (field.value.trim() && !confirm('Substituir a âncora que você escreveu pela sugestão da IA?')) return;
    field.value = state.thoughtSuggestion;
    $('thoughtSuggestion').hidden = true;
    toast('Sugestão inserida. Revise o texto antes de salvar.');
  });
  $('exportBtn').addEventListener('click', exportData); $('importFile').addEventListener('change', e => importData(e.target.files[0]));
  $('loginForm').addEventListener('submit',e=>submitAccountForm(e,'/api/login'));
  $('ownerSetupForm').addEventListener('submit',e=>submitAccountForm(e,'/api/setup-owner'));
  $('inviteRegisterForm').addEventListener('submit',e=>submitAccountForm(e,'/api/register'));
  $('ownerRecoverForm').addEventListener('submit',e=>submitAccountForm(e,'/api/recover-owner'));
  $('showLoginBtn').addEventListener('click',()=>showAccountMode('login'));
  $('showRegisterBtn').addEventListener('click',()=>showAccountMode('register'));
  $('showRecoverBtn').addEventListener('click',()=>showAccountMode('recover'));
  $('inviteBtn').addEventListener('click',()=>{$('inviteResult').hidden=true;$('inviteModal').hidden=false;});
  $('inviteCloseBtn').addEventListener('click',()=>{$('inviteModal').hidden=true;$('inviteCode').value='';});
  $('inviteModal').addEventListener('click',e=>{if(e.target===$('inviteModal'))$('inviteCloseBtn').click();});
  $('generateInviteBtn').addEventListener('click',async()=>{
    const button=$('generateInviteBtn');button.disabled=true;
    try{
      const result=await api('/api/invites',{method:'POST',body:'{}'});
      $('inviteCode').value=result.invitation;$('inviteResult').hidden=false;
    }catch(e){toast(e.message,true);}finally{button.disabled=false;}
  });
  $('copyInviteBtn').addEventListener('click',async()=>{
    const code=$('inviteCode').value;if(!code)return;
    try{
      await navigator.clipboard.writeText('Abra https://relembra-videos.wesleybrsales2018.workers.dev/ e clique em "Tenho um convite". Código: '+code);
      toast('Instruções copiadas. Envie somente para quem você convidar.');
    }catch(e){toast('Copie o código manualmente.');}
  });
}
function showAccountMode(mode) {
  const forms = { login:'loginForm', setup:'ownerSetupForm', register:'inviteRegisterForm', recover:'ownerRecoverForm' };
  for(const [name,id] of Object.entries(forms)) $(id).hidden=name!==mode;
  const labels={
    login:['Bem-vindo de volta.','Use seu usuário e senha para entrar na sua biblioteca.'],
    setup:['Criar a conta principal.','Ative a nova proteção sem perder seus vídeos, dicas e pensamentos anteriores.'],
    register:['Sua própria biblioteca.','Insira o convite recebido. Seus dados ficarão separados das outras contas.'],
    recover:['Recuperar conta principal.','A chave administrativa da Cloudflare permite redefinir a senha do proprietário.']
  };
  $('loginModeTitle').textContent=labels[mode][0];
  $('loginModeDescription').textContent=labels[mode][1];
  $('loginLinks').hidden=mode==='setup';
  $('loginError').textContent='';
}
function wipePreviousAccount() {
  resetFinance();
  closeMotivation();
  state.videos=[];state.homeVideos=[];state.categories=[];
  state.thoughts=[];state.tips=[];state.total=0;state.offset=0;
  state.editId=null;state.tipEditId=null;state.thoughtEditId=null;
  for(const id of ['homeGrid','libraryGrid','categoryNav','chatMessages','thoughtList','tipsGrid']) $(id).replaceChildren();
  $('accountLabel').textContent='Sua conta';
  $('inviteBtn').hidden=true;
  closeMediaPlayer();closeImageViewer();closeTipEditor();closeEditor();
  resetThoughtForm();
  $('tipForm').reset();
  $('inviteModal').hidden=true;
  $('inviteCode').value='';
  $('thoughtSuggestion').hidden=true;
}
async function finishAccountLogin(result) {
  wipePreviousAccount();
  $('loginOverlay').hidden=true;
  $('accountLabel').textContent='👤 '+result.user.username+(result.user.role==='owner'?' · Administrador':'');
  $('inviteBtn').hidden=result.user.role!=='owner';
  for(const id of ['loginForm','ownerSetupForm','inviteRegisterForm','ownerRecoverForm']) $(id).reset();
  await syncCategories();
  await navigate('home');
}
async function submitAccountForm(event,endpoint) {
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type=submit]');
  button.disabled=true;
  try {
    const result=await api(endpoint,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
    await finishAccountLogin(result);
  }catch(e){$('loginError').textContent=e.message;}finally{button.disabled=false;}
}

async function start() {
  bindEvents();
  setupFinance({ api, toast });
  try {
    const session=await api('/api/session');
    if(!session.configured){$('loginError').textContent='Configure a senha administrativa e o D1 na Cloudflare.';return;}
    if(session.setupRequired){showAccountMode('setup');return;}
    if(session.authenticated){await finishAccountLogin({user:session.user});return;}
    showAccountMode('login');
  }catch(e){$('loginError').textContent='Servidor indisponível: '+e.message;}
}
start();
