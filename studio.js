import registry from './config.js';

const studioName = typeof registry.studioName === 'string' && registry.studioName.trim()
  ? registry.studioName.trim() : 'App Flow Studio';
const studioOptions = registry.studio || {};
const fixedStudioAppearance = ['light','dark'].includes(studioOptions.appearance) ? studioOptions.appearance : null;
const workspaceViews = [['overview','Overview'],['screens','Screens'],['map','Flow map'],['library','Design library']].filter(([id])=>(id !== 'overview' || studioOptions.showOverview === true) && (id !== 'library' || studioOptions.showDesignLibrary !== false));
const defaultView = workspaceViews.some(([id])=>id === studioOptions.defaultView) ? studioOptions.defaultView : 'screens';

// The studio owns presentation, navigation history and timer lifetime.
// An app owns its identity, state, renderers, actions, boards and notes.
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = $('#focus');
const phone = $('#live-phone');
const content = $('#view-content');
const params = new URLSearchParams(location.search);
const requestedView = params.get('view');
const initialView = workspaceViews.some(([id])=>id === requestedView) ? requestedView : (params.get('card') || location.hash.startsWith('#board-') ? 'screens' : defaultView);
let app, cards = [], selectedCard, state, history = [], currentView = initialView, appId, appVariant = null;
let search = '', kind = 'all', boardFilter = 'all', opener = null, overlayOpener = null, overlayViews = [], selectionVersion = 0;
const timers = new Map();
const advancedCards = new Set();
const heldCards = new Set();
let advancing = false, resetPoint = null;
let toastVersion = 0;
let reviewSequence = null, swipeAnimation = null;
function savedAppearance(key, fallback = 'light') {
  try { const value = localStorage.getItem(key); if (['light', 'dark'].includes(value)) return value; } catch {}
  return fallback;
}
let studioTheme = fixedStudioAppearance || savedAppearance('app-flow-studio:theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
let appTheme = 'light';
function saveAppearance(key, value) { try { localStorage.setItem(key, value); } catch {} }

function cancelTimers() { for (const timer of timers.keys()) clearTimeout(timer); timers.clear(); }
function cancelOverlayTimers(name) {
  if (!name) return;
  for (const [timer, scope] of timers) {
    if (scope.overlay === name) { clearTimeout(timer); timers.delete(timer); }
  }
}
function schedule(ms, callback) {
  const version = selectionVersion;
  const scope = { route: state.route, overlay: state.overlay || '' };
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (dialog.open && version === selectionVersion && scope.route === state.route
      && (!scope.overlay || scope.overlay === (state.overlay || ''))) callback();
  }, ms);
  timers.set(timer, scope);
  return timer;
}
const ctx = {
  get state() { return state; },
  set(patch) { Object.assign(state, patch); renderLive(); },
  go(route, patch = {}, { replace = false } = {}) {
    if (!app.SCREENS[route]) throw new Error(`Unknown route: ${route}`);
    cancelTimers();
    if (!advancing) {
      if (!replace && route !== state.route) history.push({ route: state.route });
      if (replace && history.at(-1)?.route === route) history.pop();
    }
    Object.assign(state, { route, overlay: null, toast: null }, patch);
    renderLive(); enter();
  },
  back() {
    if (state.overlay) { dismissOverlay(); return; }
    cancelTimers();
    if (history.length) {
      const previous = history.pop();
      if (previous.snapshot) state = structuredClone(previous.snapshot);
      else Object.assign(state, { route: previous.route, overlay: null, toast: null });
    }
    else {
      const target = app.backRoute?.[state.route] || app.freshState().route;
      if (target === state.route) return;
      Object.assign(state, { route: target, overlay: null, toast: null });
    }
    if (syncReviewStep(currentCard()?.id, true)) updateURL();
    holdAdvance(currentCard());
    renderLive(); enter();
  },
  overlay(name) { state.overlay = name; renderLive(); },
  toast(message, duration = 3500) {
    const version = ++toastVersion;
    state.toast = message; renderLive();
    schedule(duration, () => { if (version === toastVersion && state.toast === message) { state.toast = null; renderLive(); } });
  },
  later: schedule,
  advance(ms, callback) {
    const card = currentCard();
    if (!card) return null;
    const point = { cardId: card.id, snapshot: structuredClone(state), reviewIndex: reviewSequence?.index };
    resetPoint = point;
    if (advancedCards.has(card.id)) {
      heldCards.add(card.id);
      renderLive();
      return null;
    }
    advancedCards.add(card.id);
    // Feedback may temporarily supply a different context card. Match the
    // underlying source state while retaining the timer's overlay lifetime.
    const sourceState = () => ({ ...state, overlay: point.snapshot.overlay, toast: point.snapshot.toast });
    const stillAtSource = () => state.route === card.route
      && (card.match ? card.match(sourceState()) : currentCard()?.id === card.id);
    const timer = schedule(ms, () => {
      if (!stillAtSource()) return;
      const snapshot = structuredClone(sourceState());
      point.snapshot = snapshot;
      // A completion may use both set() and go({ replace: true }). Treat that
      // as one transition so Back restores the exact state before completion.
      advancing = true;
      try { callback(); }
      finally { advancing = false; }
      if (!stillAtSource()) {
        history.push({ route: snapshot.route, snapshot });
        renderLive();
      }
    });
    renderLive();
    return timer;
  },
  action(name, payload = {}) { dispatch(name, payload); },
};
function holdAdvance(card) {
  if (!card) return;
  advancedCards.add(card.id);
  heldCards.add(card.id);
}
function enter() { app.onEnter?.(ctx); }
function dismissOverlay() {
  if (state.overlay && app.dismissOverlay?.(ctx) === true) return;
  ctx.overlay(null);
}
function dispatch(name, payload = {}) {
  if (name === 'back') ctx.back();
  else if (name === 'dismiss-overlay') dismissOverlay();
  else if (name === 'dismiss-toast') ctx.set({ toast: null });
  else if (app.handlers[name]) app.handlers[name](ctx, payload);
  else throw new Error(`Missing action handler: ${name}`);
}
function makeState(card) {
  const next = app.freshState();
  next.route = card.route;
  card.setup?.(next);
  return next;
}
function currentCard() {
  return cards.find(card => card.route === state.route && card.match?.(state))
    || cards.find(card => card.route === state.route && card.kind === 'ready')
    || cards.find(card => card.route === state.route);
}
function tokensStyle() {
  return Object.entries(app.tokens[appTheme]).map(([key, value]) => `--app-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}:${value}`).join(';') + `;color-scheme:${appTheme}`;
}
function screenHTML(s) {
  const overlay = s.overlay ? app.OVERLAYS[s.overlay]?.(s) : '';
  const toast = s.toast ? `<div class="phone-toast" role="status"><span>${esc(s.toast)}</span><button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>` : '';
  if (app.presentation?.edgeToEdge) return app.SCREENS[s.route](s) + toast;
  return `<div class="statusbar" aria-hidden="true"><span>9:41</span><span class="island"></span><span class="status-icons">▴▴▴ &nbsp;◔ ▰</span></div><div class="phone-content" ${overlay ? 'inert' : ''}>${app.SCREENS[s.route](s)}</div>${overlay ? `<div class="phone-overlay"><button class="overlay-backdrop" data-action="dismiss-overlay" aria-label="Dismiss overlay" tabindex="-1"></button>${overlay}</div>` : ''}${toast}<div class="home-ind" aria-hidden="true"></div>`;
}
function applyStudioTheme() {
  if (fixedStudioAppearance) studioTheme = fixedStudioAppearance;
  document.documentElement.dataset.theme = studioTheme;
  const button = $('#studio-theme');
  button.hidden = Boolean(fixedStudioAppearance);
  button.closest('.sidebar-bottom').hidden = Boolean(fixedStudioAppearance);
  if (fixedStudioAppearance) return;
  button.setAttribute('aria-label', `Switch studio to ${studioTheme === 'dark' ? 'light' : 'dark'} appearance`);
  button.title = `Studio appearance: ${studioTheme}`;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg><span>Studio appearance</span>`;
}
function applyAppTheme() {
  $('#app-theme').value = appTheme;
  if (!app) return;
  for (const node of document.querySelectorAll('.phone')) node.setAttribute('style', tokensStyle());
  if (currentView === 'library') renderView();
}

function updateURL() {
  const url = new URL(location.href);
  url.searchParams.set('app', appId);
  url.searchParams.set('view', currentView);
  if (appVariant) url.searchParams.set('state', appVariant);
  else url.searchParams.delete('state');
  if (dialog.open && selectedCard) {
    url.searchParams.set('card', reviewSequence?.cardIds[reviewSequence.index] || selectedCard.id);
    if (reviewSequence?.source === 'flow') {
      url.searchParams.set('flow', String(reviewSequence.flowIndex));
      url.searchParams.set('step', String(reviewSequence.index));
    } else {
      url.searchParams.delete('flow');
      url.searchParams.delete('step');
    }
  } else {
    for (const key of ['card', 'flow', 'step']) url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', url);
}
async function loadApp(id, requestedVariant) {
  const registered = registry.apps.find(item => item.id === id) || registry.apps[0];
  const variants = registered.variants || [];
  let savedVariant;
  try { savedVariant = localStorage.getItem(`app-flow-studio:app:${registered.id}:state`); } catch {}
  const preferred = requestedVariant ?? savedVariant ?? registered.defaultVariant;
  const variant = variants.find(item => item.id === preferred)
    || variants.find(item => item.id === registered.defaultVariant)
    || variants[0];
  const entry = { ...registered, ...variant, id: registered.id, name: registered.name };
  cancelTimers();
  if (dialog.open) closeFocus();
  const version = ++selectionVersion;
  const module = await import(entry.module);
  if (version !== selectionVersion) return;
  const stylesheet = $('#app-stylesheet');
  stylesheet.disabled = !entry.stylesheet;
  if (entry.stylesheet) stylesheet.setAttribute('href', entry.stylesheet);
  else stylesheet.removeAttribute('href');
  app = { ...module.default, identity: { ...module.default.identity, name: entry.name || module.default.identity.name } };
  appId = entry.id;
  appVariant = variant?.id || null;
  if (appVariant) {
    try { localStorage.setItem(`app-flow-studio:app:${appId}:state`, appVariant); } catch {}
  }
  cards = app.NAV.flatMap(board => board.cards.map(card => ({ ...card, boardId: board.id, boardTitle: board.title })));
  selectedCard = null; reviewSequence = null; state = app.freshState(); history = []; search = ''; kind = 'all'; boardFilter = 'all';
  $('#app-picker').value = appId;
  $('#breadcrumb-app').textContent = app.identity.name;
  const stateToggle = $('#app-variant');
  stateToggle.hidden = variants.length < 2;
  stateToggle.innerHTML = variants.map(item => `<button type="button" data-app-variant="${esc(item.id)}" aria-pressed="${item.id === appVariant}">${esc(item.name)}</button>`).join('');
  document.title = studioOptions.headerTitle || `${app.identity.name}${variant ? ` · ${variant.name}` : ''} · ${studioName}`;
  $('#board-nav').innerHTML = app.NAV.map((board,index) => `<a href="#board-${esc(board.id)}" data-board="${esc(board.id)}" aria-label="${esc(board.title)} · ${board.cards.length} ${board.cards.length === 1 ? 'screen' : 'screens'}" title="${esc(board.title)} · ${board.cards.length} ${board.cards.length === 1 ? 'screen' : 'screens'}"><span class="board-short" aria-hidden="true">${index + 1}</span><span class="board-nav-label">${esc(board.title)}</span><span class="board-nav-count" aria-hidden="true">${board.cards.length}</span></a>`).join('');
  const appearances = app.appearances || ['light', 'dark'];
  const savedTheme = savedAppearance(`app-flow-studio:app:${appId}:theme`);
  appTheme = appearances.includes(savedTheme) ? savedTheme : appearances[0];
  $('#app-theme').innerHTML = appearances.map(mode => `<option value="${mode}">${mode[0].toUpperCase() + mode.slice(1)}</option>`).join('');
  $('#app-theme').hidden = appearances.length === 1;
  $('#app-theme-label').hidden = appearances.length === 1;
  const width = app.presentation?.width || 360;
  const height = app.presentation?.height || 740;
  document.documentElement.style.setProperty('--preview-width', `${width}px`);
  document.documentElement.style.setProperty('--preview-height', `${height}px`);
  document.documentElement.style.setProperty('--preview-aspect', `${width} / ${height}`);
  document.documentElement.dataset.previewFrame = app.presentation?.edgeToEdge ? 'edge-to-edge' : 'device';
  $('#preview-caption').textContent = app.previewLabel || 'Prototype';
  applyStudioTheme();
  $('#app-theme').value = appTheme;
  renderView(); updateURL();
}
function mobileTabs() {
  return `<div class="mobile-navigation"><nav class="mobile-tabs" aria-label="Workspace views">${workspaceViews.map(([id,label])=>`<button data-view="${id}" aria-label="${label}" class="${currentView === id ? 'active' : ''}" ${currentView === id ? 'aria-current="page"' : ''}>${$(`.view-nav [data-view="${id}"] svg`)?.outerHTML || ''}<span>${id === 'library' ? 'Library' : label}</span></button>`).join('')}</nav></div>`;
}
function renderOverview() {
  const overview = app.overview || {};
  const strategies = Array.isArray(overview.strategies) ? overview.strategies.filter(item=>typeof item === 'string' && item.trim()) : [];
  const strategyHTML = item => esc(item).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const approachTitle = typeof overview.approachTitle === 'string' && overview.approachTitle.trim() ? overview.approachTitle.trim() : 'Testable ideas';
  let referenceURL;
  try {
    const url = new URL(overview.reference?.url);
    if (['http:','https:'].includes(url.protocol)) referenceURL = url.href;
  } catch {}
  return `<article class="studio-overview" aria-labelledby="overview-title"><header><p class="overview-label">${esc(overview.eyebrow || 'Overview')}</p><h1 id="overview-title">${esc(overview.title || 'Project overview')}</h1>${overview.description ? `<p class="overview-description">${esc(overview.description)}</p>` : ''}</header>${overview.rationale ? `<p class="overview-rationale">${esc(overview.rationale)}</p>` : ''}${strategies.length ? `<section class="overview-approach" aria-labelledby="overview-approach-title"><h2 id="overview-approach-title">${esc(approachTitle)}</h2><ul>${strategies.map(item=>`<li>${strategyHTML(item)}</li>`).join('')}</ul></section>` : ''}${referenceURL ? `<footer class="overview-reference"><a href="${esc(referenceURL)}" target="_blank" rel="noopener noreferrer">${esc(overview.reference.label || 'Read the reference')}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h11v11M19 5 5 19"/></svg></a></footer>` : ''}</article>`;
}
function cardHTML(card) {
  const s = makeState(card);
  const preview = screenHTML(s).replace(/\s(?:id|for|aria-labelledby|aria-describedby)="[^"]*"/g, '');
  return `<article class="screen-card" data-card-id="${esc(card.id)}">
    <div role="button" tabindex="0" class="card-open" data-open-card="${esc(card.id)}" aria-label="Open ${esc(card.title)}">
      <div class="thumb" aria-hidden="true" inert><div class="phone" style="${tokensStyle()}">${preview}</div></div>
    </div>
    <div class="card-details"><div class="card-name"><h3>${esc(card.title)}</h3><span class="status status-${esc(card.status.toLowerCase())}">${esc(card.status)}</span></div><div class="card-route">/${esc(card.route)} · ${esc(card.kind)}</div></div>
  </article>`;
}
function galleryCards() {
  return cards.filter(card => (kind === 'all' || card.kind === kind) && (boardFilter === 'all' || card.boardId === boardFilter) && [card.title,card.boardTitle,card.route,card.kind,card.status,card.how].join(' ').toLowerCase().includes(search.toLowerCase()));
}
function drawBoards() {
  const visible = galleryCards();
  const count = visible.length;
  $('#visible-count').textContent = `${count} of ${cards.length} ${cards.length === 1 ? 'state' : 'states'}`;
  $('#boards').innerHTML = app.NAV.map(board => {
    const entries = visible.filter(card => card.boardId === board.id);
    if (!entries.length) return '';
    return `<section class="board" id="board-${esc(board.id)}"><header class="board-heading"><div><h2>${esc(board.title)}</h2><p>${esc(board.description)}</p></div><span class="board-count">${entries.length} ${entries.length === 1 ? 'state' : 'states'}</span></header><div class="board-grid">${entries.map(card => cardHTML(card)).join('')}</div></section>`;
  }).join('') || `<div class="no-results">No states match. Try another search, board, or state type.</div>`;
  resizeGallery();
}
function resizeGallery() {
  if (!app) return;
  for (const thumb of content.querySelectorAll('.thumb')) {
    thumb.style.setProperty('--card-scale', String(thumb.clientWidth / (app.presentation?.width || 360)));
  }
}
function renderLibrary() {
  const library = app.library || {};
  const colorTokens = Object.entries(app.tokens[appTheme]);
  const palette = colorTokens.map(([name, value]) => `<article class="token-card">
    <div class="token-swatch" style="background:${esc(value)}"></div>
    <div class="token-info"><b>${esc(name)}</b><code>${esc(value)}</code></div>
  </article>`).join('');
  const typography = (library.typography || []).map(type => `<article class="type-spec">
    ${type.render ? type.render(app.freshState()) : `<div class="type-sample" style="font-family:${esc(type.fontFamily)};font-size:${esc(typeof type.fontSize === 'number' ? `${type.fontSize}px` : type.fontSize)};font-weight:${esc(type.fontWeight || 400)};font-style:${esc(type.fontStyle || 'normal')};color:${esc(app.tokens[appTheme].ink)};background:${esc(app.tokens[appTheme].background)}">${esc(type.sample)}</div>`}
    <h3>${esc(type.name)}</h3><p>${type.description ? esc(type.description) : `${esc(typeof type.fontSize === 'number' ? `${type.fontSize}px` : type.fontSize)} · ${esc(type.fontWeight || 400)}`}</p>
  </article>`).join('');
  const components = (library.components || []).map(component => {
    const preview = component.render(app.freshState()).replace(/\s(?:id|for|aria-labelledby|aria-describedby)="[^"]*"/g, '');
    return `<article class="component-card"><h3>${esc(component.name)}</h3>${component.description ? `<p>${esc(component.description)}</p>` : ''}<div class="phone library-sample" style="${tokensStyle()}" inert>${preview}</div></article>`;
  }).join('');
  return `<div class="section-toolbar"><h1 class="section-title">Design library <span>${esc(app.identity.name)}</span></h1></div>
    <section class="library-section"><h2>Colors <span>${esc(library.paletteNote || appTheme)}</span></h2><div class="token-grid">${palette}</div></section>
    ${typography ? `<section class="library-section"><h2>Typography</h2><div class="type-grid">${typography}</div></section>` : ''}
    ${components ? `<section class="library-section"><h2>Components <span>Static previews</span></h2><div class="component-grid">${components}</div></section>` : ''}`;
}
function renderMap() {
  return `<div class="section-toolbar"><h1 class="section-title">Flow map <span>${app.FLOWS.length} flows</span></h1></div>
    ${app.FLOWS.map((flow, flowIndex) => `<section class="flow-lane${flow.description ? ' has-description' : ''}"><h2>${esc(flow.title)}</h2>${flow.description ? `<p class="flow-description">${esc(flow.description)}</p>` : ''}<div class="flow-track">
      ${flow.steps.map((step, index) => {
        const card = cards.find(item => item.id === step.card);
        return `<button class="flow-node" data-open-card="${esc(card.id)}" data-flow-index="${flowIndex}" data-step-index="${index}"><b>${esc(card.title)}</b><span class="status">${esc(card.kind)}</span><small>/${esc(card.route)}</small></button>
          ${index < flow.steps.length - 1 ? `<div class="flow-edge">${esc(step.label || 'Continue')}</div>` : ''}`;
      }).join('')}
    </div></section>`).join('')}`;
}
function renderView() {
  $('#board-subnav').hidden = currentView !== 'screens';
  for (const button of document.querySelectorAll('.view-nav [data-view]')) {
    button.hidden = !workspaceViews.some(([id])=>id === button.dataset.view);
    const active = button.dataset.view === currentView;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  let html;
  if (currentView === 'overview') html = renderOverview();
  else if (currentView === 'screens') {
    html = `<div class="section-toolbar"><h1 class="section-title">Screens <span id="visible-count" aria-live="polite"></span></h1><div class="filters"><div class="search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="search" type="search" aria-label="Search screens" placeholder="Search screens" value="${esc(search)}"></div><select id="board-filter" aria-label="Filter by board"><option value="all">All boards</option>${app.NAV.map(board => `<option value="${esc(board.id)}" ${boardFilter === board.id ? 'selected' : ''}>${esc(board.title)}</option>`).join('')}</select><select id="kind-filter" aria-label="Filter by state type"><option value="all">All states</option>${[...new Set(cards.map(card => card.kind))].map(value => `<option value="${esc(value)}" ${kind === value ? 'selected' : ''}>${esc(value[0].toUpperCase()+value.slice(1))}</option>`).join('')}</select></div></div><div id="boards"></div>`;
  } else if (currentView === 'map') html = renderMap();
  else html = renderLibrary();
  content.innerHTML = mobileTabs() + html;
  if (currentView === 'screens') drawBoards();
}

function setView(view) {
  if (!workspaceViews.some(([id])=>id === view)) return;
  const restoreMobileFocus = content.contains(document.activeElement) && document.activeElement?.matches('[data-view]');
  currentView = view;
  renderView(); updateURL();
  if (restoreMobileFocus) $(`.mobile-tabs [data-view="${view}"]`,content)?.focus({preventScroll:true});
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function sequenceIndex(value) {
  return /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : -1;
}
function flowSequence(flowValue, stepValue, cardId) {
  const flowIndex = sequenceIndex(flowValue), index = sequenceIndex(stepValue);
  const flow = app.FLOWS[flowIndex];
  if (!flow || index < 0 || index >= flow.steps.length || (cardId && flow.steps[index].card !== cardId)) return null;
  const cardIds = flow.steps.map(step => step.card);
  if (cardIds.some(id => !cards.some(card => card.id === id))) return null;
  return { source: 'flow', label: flow.title, flowIndex, cardIds, index };
}
function gallerySequence(cardId) {
  const cardIds = galleryCards().map(card => card.id);
  const index = cardIds.indexOf(cardId);
  return { source: 'screens', label: search || kind !== 'all' || boardFilter !== 'all' ? 'Filtered screens' : 'Screens',
    cardIds: index < 0 ? [cardId] : cardIds, index: Math.max(0, index) };
}
function syncReviewStep(cardId, preferPrevious = false) {
  if (!reviewSequence || reviewSequence.cardIds[reviewSequence.index] === cardId) return false;
  const { cardIds, index } = reviewSequence;
  const next = cardIds.indexOf(cardId, index + 1), previous = index > 0 ? cardIds.lastIndexOf(cardId, index - 1) : -1;
  const match = preferPrevious && previous >= 0 ? previous : next >= 0 ? next : previous;
  if (match < 0) return false;
  reviewSequence.index = match;
  return true;
}
function renderStepControls(cardId) {
  if (!reviewSequence) return;
  const { cardIds, index, label, source } = reviewSequence;
  const outside = cardIds[index] !== cardId;
  $('#focus-position').textContent = `${label} · ${source === 'flow' ? 'Step' : 'Screen'} ${index + 1} of ${cardIds.length}${outside ? ' · Outside this ' + (source === 'flow' ? 'flow' : 'selection') : ''}`;
  const mobile = $('#mobile-step-position');
  if (mobile) {
    mobile.textContent = `${index + 1} / ${cardIds.length}${outside ? ' · Outside' : ''}`;
    mobile.setAttribute('aria-label', $('#focus-position').textContent);
  }
  for (const id of ['previous-card', 'mobile-previous']) {
    const button = document.getElementById(id);
    if (button) button.disabled = index <= 0;
  }
  for (const id of ['next-card', 'mobile-next']) {
    const button = document.getElementById(id);
    if (button) button.disabled = index >= cardIds.length - 1;
  }
}
function openCardFromElement(element) {
  const id = element.dataset.openCard;
  openCard(id, { sequence: flowSequence(element.dataset.flowIndex, element.dataset.stepIndex, id) || gallerySequence(id) });
}
function openCard(id, { hold = false, snapshot, sequence } = {}) {
  const card = cards.find(c=>c.id===id);
  if (!card) return;
  if (!dialog.open) {
    opener = document.activeElement;
    advancedCards.clear();
    heldCards.clear();
  }
  if (sequence || !dialog.open || !reviewSequence) reviewSequence = sequence || gallerySequence(id);
  reviewSequence.openedIndex = reviewSequence.index;
  swipeAnimation?.cancel(); swipeAnimation = null;
  cancelTimers(); selectionVersion++;
  selectedCard = card; state = snapshot ? structuredClone(snapshot) : makeState(card); history = []; resetPoint = null;
  if (hold) holdAdvance(card);
  const closeLabel = `Back to ${workspaceViews.find(([id])=>id === currentView)?.[1].toLowerCase() || 'screens'}`;
  $('#close-focus').textContent = `← ${closeLabel}`;
  $('#close-focus').setAttribute('aria-label', closeLabel);
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
  renderLive(); updateURL(); resizePhone();
  if (!state.overlay) $(dialog.dataset.immersive === 'true' ? '#exit-immersive' : '#close-focus')?.focus();
  if (state.toast) ctx.toast(state.toast);
  enter();
}
function resetCard() {
  const point = resetPoint;
  const cardId = point?.cardId || selectedCard.id;
  const index = point?.reviewIndex ?? reviewSequence?.openedIndex;
  if (reviewSequence?.cardIds[index] === cardId) reviewSequence.index = index;
  else syncReviewStep(cardId, true);
  openCard(cardId, { hold: true, snapshot: point?.snapshot });
}
function closeFocus() {
  swipeAnimation?.cancel(); swipeAnimation = null;
  cancelTimers(); selectionVersion++;
  dialog.close(); document.body.style.overflow = '';
  updateURL();
  const cardOpener = [...content.querySelectorAll('[data-open-card]')].find(element => element.dataset.openCard === selectedCard?.id);
  const returnFocus = opener?.isConnected && ![document.body,document.documentElement].includes(opener) ? opener
    : cardOpener || [...document.querySelectorAll('[data-view]')].find(element => element.dataset.view === currentView && available(element));
  returnFocus?.focus({preventScroll:true});
}
function menuItems(menu) {
  return [...menu.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].filter(element => element.closest('[role="menu"]') === menu && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && !element.closest('[inert],[hidden]') && element.getClientRects().length);
}
function menuTrigger(id) {
  return id && [...phone.querySelectorAll('[aria-haspopup="menu"][aria-controls]')].find(element => element.getAttribute('aria-controls').split(/\s+/).includes(id) && !element.closest('[inert],[hidden]') && element.getClientRects().length);
}
const inOverlay = element => Boolean(element.closest('.phone-overlay, .app-sheet, .app-dialog, [role="dialog"]'));
const available = element => !element.disabled && !element.closest('[inert],[hidden]') && element.getClientRects().length;
function controlKey(element, overlay) {
  const name = element.id || element.name;
  const form = element.form;
  if (!name || !form?.dataset.submit) return null;
  return JSON.stringify([inOverlay(element) ? overlay : '', form.id || form.dataset.submit, name, element.type,
    ['radio','checkbox'].includes(element.type) ? element.value : '']);
}
function renderContextSummary(card) {
  const approach = typeof card.approach === 'string' ? card.approach.trim() : '';
  const rationale = card.rationale ?? card.notes ?? [];
  const label = card.rationale !== undefined ? 'Rationale' : 'Design notes';
  const rationaleHTML = typeof rationale === 'string'
    ? (rationale.trim() ? `<p><strong class="context-summary-label">${label}:</strong> ${esc(rationale)}</p>` : '')
    : (rationale.length ? `<div><h3>${label}</h3><ul class="notes-list">${rationale.map(note=>`<li>${esc(note)}</li>`).join('')}</ul></div>` : '');
  if (!approach && !rationaleHTML) return '';
  return `<section class="context-summary" aria-label="Screen summary">${approach ? `<p><strong class="context-summary-label">Approach:</strong> ${esc(approach)}</p>` : ''}${rationaleHTML}</section>`;
}
function renderLive() {
  if (!dialog.open) return;
  const active = document.activeElement;
  const previousOverlay = phone.dataset.overlay || '';
  const previousOverlayView = phone.dataset.overlayView || '';
  const sameSelection = phone.dataset.selection === String(selectionVersion);
  const sameRoute = sameSelection && phone.dataset.route === state.route;
  const previousMenus = sameRoute ? [...phone.querySelectorAll('[role="menu"][id]')].filter(element=>!element.closest('[inert],[hidden]') && element.getClientRects().length).map(element=>element.id) : [];
  const activeMenuID = phone.contains(active) ? active?.closest('[role="menu"]')?.id : null;
  const activeAction = phone.contains(active) && active?.dataset?.action ? {...active.dataset} : null;
  const activeField = phone.contains(active) ? active?.dataset?.field : null;
  const activeSubmit = phone.contains(active) && active?.type === 'submit' ? active.form?.dataset.submit : null;
  const activeControl = phone.contains(active) ? controlKey(active, previousOverlay) : null;
  const priorSelection = phone.contains(active) && typeof active.selectionStart === 'number'
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  const scrollKey = (element, route, overlay, elements) => {
    const overlayScroll = inOverlay(element);
    const siblings = elements.filter(item => inOverlay(item) === overlayScroll);
    const key = element.dataset.scrollKey || element.id || `position-${siblings.indexOf(element)}`;
    return JSON.stringify([route, overlayScroll ? overlay : '', key]);
  };
  const oldScrollers = [...phone.querySelectorAll('.app-scroll')];
  const scrollPositions = new Map(sameSelection ? oldScrollers.map(element => [scrollKey(element,phone.dataset.route,previousOverlay,oldScrollers),{top:element.scrollTop,left:element.scrollLeft}]) : []);
  // data-field controls are driven by app state. Preserve ordinary form drafts
  // across a timer/toast render without overwriting state-driven field updates.
  const formDrafts = new Map(sameRoute ? [...phone.querySelectorAll('input,textarea,select')]
    .filter(element => !element.dataset.field && !['file','hidden','submit','button','reset'].includes(element.type))
    .map(element => [controlKey(element,previousOverlay), {
      value: element.value, checked: element.checked,
      selected: element.multiple ? [...element.selectedOptions].map(option => option.value) : null,
    }]).filter(([key])=>key) : []);
  if (previousOverlay && (!sameRoute || previousOverlay !== (state.overlay || ''))) cancelOverlayTimers(previousOverlay);
  if (!sameRoute) overlayOpener = null;
  else if (!previousOverlay && state.overlay) overlayOpener = activeAction;
  if (!sameRoute || previousOverlay !== (state.overlay || '')) overlayViews = [];
  phone.setAttribute('style',tokensStyle());
  phone.innerHTML = screenHTML(state);
  phone.dataset.route = state.route;
  phone.dataset.overlay = state.overlay || '';
  phone.dataset.selection = selectionVersion;
  for (const element of phone.querySelectorAll('input,textarea,select')) {
    if (element.dataset.field) continue;
    const draft = formDrafts.get(controlKey(element,state.overlay || ''));
    if (!draft) continue;
    if (draft.selected) for (const option of element.options) option.selected = draft.selected.includes(option.value);
    else element.value = draft.value;
    if (['checkbox','radio'].includes(element.type)) element.checked = draft.checked;
  }
  const modal = [...phone.querySelectorAll('[role="dialog"], .app-sheet, .app-dialog')].find(element => !element.closest('[inert],[hidden]') && element.getClientRects().length);
  const overlayView = modal?.dataset.overlayView || '';
  const changedOverlayView = sameRoute && previousOverlay === state.overlay && previousOverlayView !== overlayView;
  let viewOpener = null;
  if (state.overlay && overlayView) {
    const previousIndex = overlayViews.findIndex(entry => entry.view === overlayView);
    if (changedOverlayView && previousIndex >= 0) {
      viewOpener = overlayViews[previousIndex + 1]?.opener;
      overlayViews.length = previousIndex + 1;
    } else if (previousIndex < 0) overlayViews.push({view:overlayView,opener:activeAction});
  }
  phone.dataset.overlayView = overlayView;
  const baseCard = currentCard();
  if (!baseCard) throw new Error(`No card context for route ${state.route}`);
  const overlayContext = state.overlay && app.overlayContext?.[state.overlay];
  const card = { ...baseCard };
  for (const context of [overlayContext, overlayContext?.resolve?.(state)].filter(Boolean)) {
    // A panel supplies its own summary. Do not mix a new rationale or legacy
    // notes with an approach inherited from the underlying screen or panel.
    const summaryKeys = ['approach', 'rationale', 'notes'];
    if (summaryKeys.some(key => Object.hasOwn(context, key))) {
      for (const key of summaryKeys) delete card[key];
    }
    Object.assign(card, context);
  }
  phone.dataset.card = card.id;
  $('#focus-title').textContent = card.title;
  if (syncReviewStep(baseCard.id)) updateURL();
  renderStepControls(baseCard.id);
  const backRoute = app.backRoute?.[state.route] || app.freshState().route;
  $('#prototype-back').disabled = !history.length && !state.overlay && state.route === backRoute;
  const builtins = {back:{label:'Go back',description:'Return to the previous app screen.'},'dismiss-overlay':{label:'Dismiss',description:'Close this overlay and return to the screen underneath.'},'dismiss-toast':{label:'Dismiss message',description:'Hide the feedback message.'}};
  const actionIds = [...(card.actions || [])];
  if (state.toast && !actionIds.includes('dismiss-toast')) actionIds.push('dismiss-toast');
  const actions = actionIds.map(id=>app.ACTIONS[id] || builtins[id]).filter(Boolean);
  const simulationNote = card.kind === 'loading' && advancedCards.has(baseCard.id)
    ? (heldCards.has(baseCard.id)
      ? 'Held for inspection. Auto-advance is paused. Close and reopen the prototype to replay the transition.'
      : 'Advances once on this first view. Reset or Back returns to loading and holds it for inspection.')
    : 'Local simulation. Reset restores the latest loading step, or the card you opened, and cancels pending transitions.';
  $('#context').innerHTML = `<div class="context-top"><span class="status status-${esc(card.status.toLowerCase())}">${esc(card.status)}</span><span class="status">${esc(card.kind)}</span></div><h2>${esc(card.title)}</h2><div class="context-route">/${esc(state.route)}${state.overlay ? ` · ${esc(state.overlay)}` : ''}</div>${renderContextSummary(card)}<section class="context-box"><h3>How you get here</h3><p>${esc(card.how)}</p></section><section class="context-box"><h3>Available interactions</h3><ul>${actions.map(action=>`<li class="interaction-item"><strong>${esc(action.label)}</strong><span>${esc(action.description)}</span></li>`).join('') || '<li>No actions are documented for this state.</li>'}</ul></section><div class="simulation-note">${simulationNote}</div>`;
  const scrollers = [...phone.querySelectorAll('.app-scroll')];
  for (const element of scrollers) {
    const position = scrollPositions.get(scrollKey(element,state.route,state.overlay || '',scrollers));
    if (position) { element.scrollTop = position.top; element.scrollLeft = position.left; }
  }
  const findAction = data => data && [...phone.querySelectorAll('[data-action]')].find(element => available(element) && Object.entries(data).every(([key,value])=>element.dataset[key]===value));
  const menus = [...phone.querySelectorAll('[role="menu"][id]')].filter(element=>!element.closest('[inert],[hidden]') && element.getClientRects().length);
  const openedMenu = menus.find(element=>!previousMenus.includes(element.id));
  const closedMenuID = [activeMenuID,...previousMenus].find(id=>id && !menus.some(element=>element.id===id));
  const closedMenuTrigger = sameRoute && previousOverlay === (state.overlay || '') ? menuTrigger(closedMenuID) : null;
  for (const menu of menus) {
    const items = menuItems(menu);
    const activeItem = items.find(element=>activeAction && Object.entries(activeAction).every(([key,value])=>element.dataset[key]===value));
    const selected = activeItem || items.find(element=>element.getAttribute('aria-checked') === 'true') || items[0];
    for (const item of items) item.tabIndex = item === selected ? 0 : -1;
  }
  const focusModal = () => {
    const target = modal && [...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].find(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[inert],[hidden]') && element.getClientRects().length);
    if (target) target.focus({preventScroll:true});
    else if (modal) { modal.tabIndex = -1; modal.focus({preventScroll:true}); }
  };
  const focusFallback = () => {
    if (state.overlay && modal) focusModal();
    else ($('#prototype-back').disabled ? $('#reset') : $('#prototype-back')).focus({preventScroll:true});
  };
  if (openedMenu) {
    const items = menuItems(openedMenu);
    (items.find(element=>element.getAttribute('aria-checked') === 'true') || items[0])?.focus({preventScroll:true});
  }
  else if (closedMenuTrigger) closedMenuTrigger.focus({preventScroll:true});
  else if (state.overlay && (!sameRoute || previousOverlay !== state.overlay)) focusModal();
  else if (state.overlay && changedOverlayView) {
    const replacement = findAction(viewOpener);
    if (replacement) replacement.focus({preventScroll:true});
    else focusModal();
  }
  else if (sameRoute && previousOverlay && !state.overlay) {
    const replacement = findAction(overlayOpener);
    if (replacement) replacement.focus({preventScroll:true});
    else focusFallback();
    overlayOpener = null;
  }
  else if (sameRoute && (activeField || activeControl)) {
    const replacement = activeField
      ? [...phone.querySelectorAll('[data-field]')].find(el=>el.dataset.field===activeField && available(el))
      : [...phone.querySelectorAll('input,textarea,select')].find(el=>controlKey(el,state.overlay || '')===activeControl && available(el));
    if (replacement) {
      replacement.focus({preventScroll:true});
      if (priorSelection) {
        try { replacement.setSelectionRange?.(priorSelection.start,priorSelection.end,priorSelection.direction); } catch {}
      }
    } else focusFallback();
  } else if (sameRoute && activeSubmit) {
    const form = [...phone.querySelectorAll('form[data-submit]')].find(element => element.dataset.submit === activeSubmit && !element.closest('[inert],[hidden]'));
    const replacement = form && [...form.elements].find(element => element.type === 'submit' && !element.disabled && element.getClientRects().length);
    if (replacement) replacement.focus({preventScroll:true});
    else focusFallback();
  } else if (activeAction || activeField || activeControl || activeSubmit) {
    const replacement = sameRoute && findAction(activeAction);
    if (replacement) replacement.focus({preventScroll:true});
    else focusFallback();
  }
  $('#studio-announcement').textContent = card.title;
}
const mobileReview = matchMedia('(max-width: 760px), (max-width: 960px) and (pointer: coarse)');
function syncReviewPanels() {
  const details = mobileReview.matches && dialog.dataset.details === 'true';
  const immersive = dialog.dataset.immersive === 'true';
  const sheet = $('#context-sheet');
  sheet.inert = immersive || (mobileReview.matches && !details);
  $('#details-backdrop').hidden = !details;
  $('#toggle-details').setAttribute('aria-expanded', String(details));
  if (details) {
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
  } else {
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
  }
  for (const element of [$('.focus-toolbar'), $('.live-preview'), $('.focus-footer')]) element.inert = details;
  $('#exit-immersive').hidden = !immersive;
}
function setDetails(open, restoreFocus = true) {
  dialog.dataset.details = String(open && mobileReview.matches);
  syncReviewPanels();
  if (open && mobileReview.matches) $('#close-details').focus({preventScroll: true});
  else if (restoreFocus && mobileReview.matches && dialog.open) $('#toggle-details').focus({preventScroll: true});
}
function setImmersive(open, restoreFocus = true) {
  setDetails(false, false);
  dialog.dataset.immersive = String(open);
  syncReviewPanels();
  resizePhone();
  if (restoreFocus && dialog.open) (open ? $('#exit-immersive') : $('#toggle-immersive')).focus({preventScroll: true});
}
function resizePhone() {
  resizeGallery();
  if (!app || !dialog.open) return;
  const viewport = window.visualViewport;
  // Ignore pinch zoom. Follow the usable viewport when Safari's keyboard or
  // browser bars change size, without disabling the user's zoom controls.
  if (viewport && viewport.scale === 1) {
    dialog.style.setProperty('--focus-viewport-height', `${viewport.height}px`);
    dialog.style.setProperty('--focus-viewport-top', `${viewport.offsetTop}px`);
  } else {
    dialog.style.removeProperty('--focus-viewport-height');
    dialog.style.removeProperty('--focus-viewport-top');
  }
  syncReviewPanels();
  const nativeCanvas = dialog.dataset.immersive === 'true' && mobileReview.matches && matchMedia('(orientation: portrait)').matches && !app.presentation?.edgeToEdge;
  dialog.dataset.nativeCanvas = String(nativeCanvas);
  const layout = $('.focus-layout', dialog);
  const caption = $('.live-caption', dialog);
  const controls = $('.device-controls', dialog);
  const context = $('#context-sheet');
  const style = getComputedStyle(layout);
  const pixels = value => Number.parseFloat(value) || 0;
  const outerHeight = element => {
    if (!element.getClientRects().length) return 0;
    const box = getComputedStyle(element);
    if (box.position === 'absolute' || box.position === 'fixed') return 0;
    return element.getBoundingClientRect().height + pixels(box.marginTop) + pixels(box.marginBottom);
  };
  const immersive = dialog.dataset.immersive === 'true';
  const frame = app.presentation?.edgeToEdge || nativeCanvas ? 0 : 14;
  const width = (app.presentation?.width || 360) + frame;
  const height = (app.presentation?.height || 740) + frame;
  const horizontalSpace = layout.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight)
    - (!immersive && style.flexDirection === 'row' ? context.getBoundingClientRect().width + pixels(style.columnGap) : 0);
  const verticalSpace = layout.clientHeight - pixels(style.paddingTop) - pixels(style.paddingBottom)
    - outerHeight(caption) - outerHeight(controls) - (immersive ? 0 : 8);
  const minimum = immersive || (mobileReview.matches && matchMedia('(orientation: landscape)').matches) ? .1 : .55;
  const scale = nativeCanvas ? 1 : Math.max(.1, Math.min(1, horizontalSpace / width, Math.max(minimum, verticalSpace / height)));
  document.documentElement.style.setProperty('--focus-scale', String(scale));
  if (!resizePhone.observer && typeof ResizeObserver === 'function') {
    resizePhone.observer = new ResizeObserver(resizePhone);
    for (const element of [layout, caption, controls, $('.focus-toolbar', dialog), $('.focus-footer', dialog)]) resizePhone.observer.observe(element);
  }
}

function moveCard(direction) {
  if (!dialog.open || !reviewSequence || ![-1, 1].includes(direction)) return false;
  const index = reviewSequence.index + direction;
  if (index < 0 || index >= reviewSequence.cardIds.length) return false;
  reviewSequence.index = index;
  openCard(reviewSequence.cardIds[index], { hold: direction < 0 });
  return true;
}
const swipeInputSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const swipeControlSelector = `${swipeInputSelector},button,a,label,summary,video,audio,iframe,[tabindex],[data-action],[data-submit],[role="button"],[role="link"],[role="slider"],[role="switch"],[role="tab"],[role="menu"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[data-studio-swipe="ignore"]`;
let swipeGesture = null, suppressSwipeClickUntil = 0;
const swipePointers = new Set();
function swipeBlocked() {
  const selection = window.getSelection?.();
  return !dialog.open || !reviewSequence || state.overlay || dialog.dataset.details === 'true'
    || document.activeElement?.matches(swipeInputSelector)
    || (selection && !selection.isCollapsed && (dialog.contains(selection.anchorNode) || dialog.contains(selection.focusNode)));
}
function swipeSurface(target) {
  if (!target?.closest || target.closest(swipeControlSelector)) return null;
  const surface = target.closest('#live-phone, #step-gesture');
  if (!surface || !dialog.contains(surface)) return null;
  // Horizontal carousels and app-specific gesture surfaces keep their native
  // interactions. Vertical scrolling is allowed until horizontal intent wins.
  for (let element = target; element && dialog.contains(element); element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1 && /^(auto|scroll)$/.test(getComputedStyle(element).overflowX)) return null;
    if (element === surface) break;
  }
  return surface;
}
function beginSwipe(target, x, y, type, pointerId) {
  swipeGesture = null;
  if (swipeBlocked() || x <= 28 || x >= window.innerWidth - 28) return;
  const surface = swipeSurface(target);
  if (!surface) return;
  swipeGesture = { x, y, type, pointerId, started: performance.now(), horizontal: false,
    version: selectionVersion, route: state.route, cardId: currentCard()?.id, surface,
    threshold: Math.max(48, Math.min(80, surface.getBoundingClientRect().width * .18)) };
}
function swipeStillCurrent(gesture) {
  return !swipeBlocked() && gesture.version === selectionVersion && gesture.route === state.route
    && gesture.cardId === currentCard()?.id && gesture.surface.isConnected;
}
function trackSwipe(x, y, event) {
  const gesture = swipeGesture;
  if (!gesture) return;
  if (!swipeStillCurrent(gesture)) { swipeGesture = null; return; }
  const dx = x - gesture.x, dy = y - gesture.y;
  if (!gesture.horizontal) {
    if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { swipeGesture = null; return; }
    if (Math.abs(dx) < 16 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    gesture.horizontal = true;
  }
  // A passive or already claimed browser gesture must not change screens.
  if (!event.cancelable) { swipeGesture = null; return; }
  event.preventDefault();
}
function finishSwipe(x, y, event) {
  const gesture = swipeGesture;
  swipeGesture = null;
  if (!gesture || !gesture.horizontal || !swipeStillCurrent(gesture)) return;
  const dx = x - gesture.x, dy = y - gesture.y;
  if (Math.abs(dx) < gesture.threshold || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - gesture.started > 1200) return;
  if (moveCard(dx < 0 ? 1 : -1)) {
    suppressSwipeClickUntil = performance.now() + 700;
    if (event.cancelable) event.preventDefault();
    if (phone.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swipeAnimation = phone.animate([
        { transform: `translateX(${dx < 0 ? 10 : -10}px)`, opacity: .85 },
        { transform: 'translateX(0)', opacity: 1 },
      ], { duration: 160, easing: 'ease-out' });
    }
  }
}
function installSwipeNavigation() {
  dialog.addEventListener('touchstart', event => {
    suppressSwipeClickUntil = 0;
    if (event.touches.length !== 1 || swipePointers.size > 1) { swipeGesture = null; return; }
    const touch = event.touches[0];
    beginSwipe(event.target, touch.clientX, touch.clientY, 'touch', touch.identifier);
  }, { passive: true });
  dialog.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) { swipeGesture = null; return; }
    if (swipeGesture?.type !== 'touch') return;
    const touch = [...event.touches].find(item => item.identifier === swipeGesture.pointerId);
    if (!touch) { swipeGesture = null; return; }
    trackSwipe(touch.clientX, touch.clientY, event);
  }, { passive: false });
  dialog.addEventListener('touchend', event => {
    if (event.touches.length) { swipeGesture = null; return; }
    if (swipeGesture?.type !== 'touch') return;
    const touch = [...event.changedTouches].find(item => item.identifier === swipeGesture.pointerId);
    if (touch) finishSwipe(touch.clientX, touch.clientY, event);
    else swipeGesture = null;
  }, { passive: false });
  dialog.addEventListener('touchcancel', () => { swipeGesture = null; }, { passive: true });
  dialog.addEventListener('pointerdown', event => {
    suppressSwipeClickUntil = 0;
    if (!['touch', 'pen'].includes(event.pointerType)) return;
    swipePointers.add(event.pointerId);
    if (swipePointers.size > 1) { swipeGesture = null; return; }
    if (event.pointerType === 'pen' && event.isPrimary && event.button === 0) {
      beginSwipe(event.target, event.clientX, event.clientY, 'pen', event.pointerId);
    }
  });
  document.addEventListener('pointermove', event => {
    if (swipeGesture?.type === 'pen' && swipeGesture.pointerId === event.pointerId) trackSwipe(event.clientX, event.clientY, event);
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    swipePointers.delete(event.pointerId);
    if (swipeGesture?.type === 'pen' && swipeGesture.pointerId === event.pointerId) finishSwipe(event.clientX, event.clientY, event);
  });
  document.addEventListener('pointercancel', event => {
    swipePointers.delete(event.pointerId);
    swipeGesture = null;
  });
  dialog.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < suppressSwipeClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressSwipeClickUntil = 0;
    }
  }, true);
  const cancelSwipe = () => { swipeGesture = null; swipePointers.clear(); };
  window.addEventListener('blur', cancelSwipe);
  dialog.addEventListener('close', cancelSwipe);
}
function setupSidebar() {
  const options = studioOptions.sidebar || {};
  const scope = typeof options.scope === 'string' ? options.scope.trim() : '';
  if (!scope && !options.collapsible) return;
  const sidebar = $('.sidebar');
  sidebar.id = 'workspace-sidebar';
  if (scope) sidebar.setAttribute('aria-label', `${scope} workspace navigation`);
  const header = document.createElement('div');
  header.className = 'sidebar-header';
  const identity = document.createElement('div');
  identity.className = 'sidebar-identity';
  identity.append($('#studio-brand'));
  if (scope) {
    const label = document.createElement('p');
    label.className = 'sidebar-scope'; label.textContent = scope;
    identity.append(label);
  }
  header.append(identity); sidebar.prepend(header);
  if (!options.collapsible) return;
  const workspace = $('#workspace');
  workspace.dataset.sidebarCollapsible = 'true';
  const storageKey = `app-flow-studio:sidebar:${studioName}`;
  let collapsed = false;
  try { collapsed = localStorage.getItem(storageKey) === 'collapsed'; } catch {}
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.id = 'sidebar-toggle'; toggle.className = 'sidebar-toggle icon-button';
  toggle.setAttribute('aria-controls',sidebar.id);
  const apply = () => {
    workspace.dataset.sidebarCollapsed = String(collapsed);
    toggle.setAttribute('aria-expanded',String(!collapsed));
    toggle.setAttribute('aria-label',collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16${collapsed ? 'm5-11 3 3-3 3' : 'm8-11-3 3 3 3'}"/></svg>`;
  };
  toggle.addEventListener('click',() => {
    collapsed = !collapsed; apply();
    try { localStorage.setItem(storageKey,collapsed ? 'collapsed' : 'expanded'); } catch {}
  });
  header.append(toggle);
  for (const button of sidebar.querySelectorAll('.view-nav button')) {
    const label = button.textContent.trim();
    button.setAttribute('aria-label',label); button.title = label;
    button.innerHTML = `${button.querySelector('svg')?.outerHTML || ''}<span class="sidebar-nav-label">${esc(label)}</span>`;
  }
  apply();
}
const brand = $('#studio-brand');
brand.textContent = '';
const brandLabel = document.createElement('span');
brandLabel.className = 'studio-brand-label'; brandLabel.textContent = studioName;
brand.append(brandLabel);
if (typeof studioOptions.icon === 'string' && /^(?:\.\/)?apps\/[A-Za-z0-9._/-]+$/.test(studioOptions.icon) && !studioOptions.icon.split('/').includes('..')) {
  const mark = document.createElement('span'); mark.className = 'studio-brand-icon'; mark.setAttribute('aria-hidden','true');
  const image = document.createElement('img'); image.src = studioOptions.icon; image.alt = ''; image.width = 28; image.height = 28;
  mark.append(image); brand.prepend(mark);
  $('#workspace').dataset.brandIcon = 'true';
}
$('#studio-brand').dataset.view = defaultView;
const headerTitle = typeof studioOptions.headerTitle === 'string' && studioOptions.headerTitle.trim() ? studioOptions.headerTitle.trim() : null;
const headerSubtitle = typeof studioOptions.headerSubtitle === 'string' ? studioOptions.headerSubtitle.trim() : '';
$('#workspace-studio-name').textContent = headerTitle || studioName;
$('#workspace-subtitle').textContent = headerSubtitle;
$('#workspace-subtitle').hidden = !headerSubtitle;
document.title = studioName;
setupSidebar();
installSwipeNavigation();
const singleApp = registry.apps.length === 1;
$('#workspace').dataset.singleApp = String(singleApp);
const titleOnly = Boolean(headerTitle);
$('#workspace').dataset.titleOnly = String(titleOnly);
$('#breadcrumb-separator').hidden = titleOnly;
$('#breadcrumb-app').hidden = titleOnly;
$('#app-picker').hidden = singleApp;
$('#app-picker-label').hidden = singleApp;
$('#app-picker').innerHTML = registry.apps.map(entry=>`<option value="${esc(entry.id)}">${esc(entry.name)}</option>`).join('');
$('#app-picker').addEventListener('change',e=>loadApp(e.target.value).catch(showError));
$('#app-variant').addEventListener('click', async event => {
  const button = event.target.closest('[data-app-variant]');
  if (!button) return;
  try {
    await loadApp(appId, button.dataset.appVariant);
    $('#app-variant [aria-pressed="true"]')?.focus();
  } catch (error) { showError(error); }
});
$('#studio-theme').addEventListener('click', () => {
  if (fixedStudioAppearance) return;
  studioTheme = studioTheme === 'dark' ? 'light' : 'dark';
  saveAppearance('app-flow-studio:theme', studioTheme);
  applyStudioTheme();
});
$('#app-theme').addEventListener('change', event => {
  appTheme = event.target.value;
  saveAppearance(`app-flow-studio:app:${appId}:theme`, appTheme);
  applyAppTheme();
});
$('#close-focus').addEventListener('click',closeFocus);
$('#previous-card').addEventListener('click',()=>moveCard(-1));
$('#next-card').addEventListener('click',()=>moveCard(1));
$('#mobile-previous')?.addEventListener('click',()=>moveCard(-1));
$('#mobile-next')?.addEventListener('click',()=>moveCard(1));
$('#reset').addEventListener('click',resetCard);
$('#prototype-back').addEventListener('click',()=>ctx.back());
document.addEventListener('keydown',event=>{
  const card = event.target.closest('.card-open');
  if (card && ['Enter',' '].includes(event.key)) { event.preventDefault(); openCardFromElement(card); }
});
document.addEventListener('click',event=>{
  const target = event.target.closest('[data-open-card],[data-view],[data-board]');
  if (!target) return;
  if (target.dataset.openCard) openCardFromElement(target);
  else if (target.dataset.view) setView(target.dataset.view);
  else if (target.dataset.board) {
    event.preventDefault();
    const refresh = currentView !== 'screens' || search || kind !== 'all' || boardFilter !== 'all';
    currentView='screens'; search=''; kind='all'; boardFilter='all';
    if (refresh) renderView();
    updateURL();
    const board = document.getElementById(`board-${target.dataset.board}`);
    if (board) {
      board.tabIndex = -1;
      board.focus({preventScroll:true});
      board.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
});
content.addEventListener('input',event=>{ if(event.target.id==='search'){search=event.target.value;drawBoards();} });
content.addEventListener('change',event=>{
  if(event.target.id==='kind-filter') {
    kind=event.target.value; drawBoards();
  } else if(event.target.id==='board-filter'){
    boardFilter=app.NAV.some(board=>board.id===event.target.value)?event.target.value:'all';
    drawBoards();
  }
});
phone.addEventListener('click',event=>{
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) dispatch(button.dataset.action,{...button.dataset});
});
phone.addEventListener('submit',event=>{
  const form = event.target.closest('[data-submit]');
  if (!form) return;
  event.preventDefault(); dispatch(form.dataset.submit,Object.fromEntries(new FormData(form)));
});
phone.addEventListener('input',event=>{
  if(event.target.dataset.field) state[event.target.dataset.field] = event.target.type==='checkbox' ? event.target.checked : event.target.value;
});
phone.addEventListener('change',event=>{
  if(event.target.dataset.field) state[event.target.dataset.field] = event.target.type==='checkbox' ? event.target.checked : event.target.value;
});
dialog.addEventListener('cancel',event=>{
  event.preventDefault();
  if(state.overlay) dismissOverlay();
  else closeFocus();
});
dialog.addEventListener('keydown',event=>{
  if (event.defaultPrevented || event.isComposing || (mobileReview.matches && dialog.dataset.details === 'true')) return;
  const menu = event.target.closest('[role="menu"]');
  if (event.key === 'Escape' && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) {
      const trigger = menuTrigger(menu?.id);
      if (trigger?.dataset.action && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
      else if (state.overlay) dismissOverlay();
      else closeFocus();
    }
    return;
  }
  const menuButton = event.target.closest('[aria-haspopup="menu"][aria-controls]');
  if (menuButton && ['ArrowDown','ArrowUp'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); event.stopPropagation();
    if (menuButton.getAttribute('aria-expanded') !== 'true') menuButton.click();
    else {
      const controlled = [...phone.querySelectorAll('[role="menu"][id]')].find(element=>menuButton.getAttribute('aria-controls').split(/\s+/).includes(element.id));
      const items = controlled ? menuItems(controlled) : [];
      (items.find(element=>element.getAttribute('aria-checked') === 'true') || items[0])?.focus({preventScroll:true});
    }
    return;
  }
  if (menu && ['ArrowDown','ArrowUp','Home','End'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const items = menuItems(menu);
    const index = items.indexOf(event.target.closest('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'));
    if (items.length) {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      event.preventDefault(); event.stopPropagation();
      for (const [position,item] of items.entries()) item.tabIndex = position === next ? 0 : -1;
      items[next].focus({preventScroll:true});
    }
    return;
  }
  const tab = event.target.closest('[role="tab"]');
  const tablist = tab?.closest('[role="tablist"]');
  if (tablist && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].filter(element => element.closest('[role="tablist"]') === tablist && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && !element.closest('[inert],[hidden]') && element.getClientRects().length);
    const index = tabs.indexOf(tab);
    if (index >= 0 && tabs.length) {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      event.stopPropagation();
      tabs[next].focus({preventScroll:true});
      tabs[next].click();
      return;
    }
  }
  if (event.key === 'Tab' && state.overlay) {
    const modal = [...phone.querySelectorAll('[role="dialog"], .app-sheet, .app-dialog')].find(element => !element.closest('[inert],[hidden]') && element.getClientRects().length);
    if (modal) {
      const controls = [...modal.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[inert],[hidden]') && element.getClientRects().length);
      const index = controls.indexOf(document.activeElement);
      if (!controls.length) {
        event.preventDefault(); modal.tabIndex = -1; modal.focus({preventScroll:true});
      } else if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus({preventScroll:true});
      }
      return;
    }
  }
  if (menu) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if(event.key==='ArrowLeft'){event.preventDefault();moveCard(-1);}
  if(event.key==='ArrowRight'){event.preventDefault();moveCard(1);}
  if(event.key.toLowerCase()==='r'){event.preventDefault();resetCard();}
});
$('#toggle-immersive').addEventListener('click', () => setImmersive(true));
$('#exit-immersive').addEventListener('click', () => setImmersive(false));
$('#toggle-details').addEventListener('click', () => setDetails(true));
$('#close-details').addEventListener('click', () => setDetails(false));
$('#details-backdrop').addEventListener('click', () => setDetails(false));
dialog.addEventListener('close', () => setImmersive(false, false));
dialog.addEventListener('keydown', event => {
  if (dialog.dataset.details === 'true' && mobileReview.matches) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); setDetails(false);
    } else if (event.key === 'Tab') {
      const controls = [...$('#context-sheet').querySelectorAll('button,a[href],[tabindex]')].filter(available);
      const index = controls.indexOf(document.activeElement);
      if (controls.length && (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1))) {
        event.preventDefault(); event.stopImmediatePropagation();
        controls[event.shiftKey ? controls.length - 1 : 0].focus();
      }
    }
  } else if (event.key === 'Escape' && dialog.dataset.immersive === 'true' && !state.overlay && !event.target.closest('[role="menu"]')) {
    event.preventDefault(); event.stopImmediatePropagation(); setImmersive(false);
  }
}, true);
dialog.addEventListener('cancel', event => {
  if (dialog.dataset.details === 'true') {
    event.preventDefault(); event.stopImmediatePropagation(); setDetails(false);
  } else if (dialog.dataset.immersive === 'true' && !state.overlay) {
    event.preventDefault(); event.stopImmediatePropagation(); setImmersive(false);
  }
}, true);
mobileReview.addEventListener('change', () => {
  setDetails(false, false);
  resizePhone();
});
window.visualViewport?.addEventListener('resize', resizePhone);
window.visualViewport?.addEventListener('scroll', resizePhone);
window.addEventListener('resize',resizePhone);
if (typeof ResizeObserver === 'function') new ResizeObserver(resizeGallery).observe(content);
function showError(error) {
  console.error(error);
  content.innerHTML = `<div class="no-results"><strong>Could not load this app.</strong><p>${esc(error.message)}</p><p>Check the app configuration and run npm run check.</p></div>`;
}
try {
  const requestedCard = params.get('card');
  const requestedApp = params.get('app') || registry.defaultApp;
  const registered = registry.apps.find(item => item.id === requestedApp) || registry.apps[0];
  // Older card links predate design states and point at the original module.
  const legacyVariant = requestedCard && !params.has('state')
    ? registered.variants?.find(item => item.module === registered.module)?.id
    : undefined;
  await loadApp(requestedApp, params.get('state') || legacyVariant);
  const requestedSequence = flowSequence(params.get('flow'), params.get('step'), requestedCard);
  if (requestedSequence) openCard(requestedSequence.cardIds[requestedSequence.index], { sequence: requestedSequence });
  else if(requestedCard && cards.some(card=>card.id===requestedCard)) openCard(requestedCard);
  else if (currentView === 'screens' && location.hash.startsWith('#board-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});
} catch(error) { showError(error); }
