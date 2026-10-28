import registry from './config.js';

const studioName = typeof registry.studioName === 'string' && registry.studioName.trim()
  ? registry.studioName.trim() : 'App Flow Studio';
const studioOptions = registry.studio || {};
const fixedStudioAppearance = ['light','dark'].includes(studioOptions.appearance) ? studioOptions.appearance : null;
const allViews = [['overview','Overview'],['findings','Findings'],['screens','Screens'],['map','Flow map'],['library','Design library']];
// Findings come from the app's registry entry, so their view is known only after loading.
let findings = null;
let designSystem = null, designSystemPath = null, designSystemPoll = null;
const viewEnabled = id => (id !== 'overview' || studioOptions.showOverview === true)
  && (id !== 'library' || studioOptions.showDesignLibrary !== false)
  && (id !== 'findings' || Boolean(findings?.items?.length));
const workspaceViews = () => allViews.filter(([id])=>viewEnabled(id));
const fallbackView = () => viewEnabled(studioOptions.defaultView) ? studioOptions.defaultView : 'screens';
const defaultView = allViews.some(([id])=>id === studioOptions.defaultView) ? studioOptions.defaultView : 'screens';

// The studio owns presentation, navigation history and timer lifetime.
// An app owns its identity, state, renderers, actions, boards and notes.
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = $('#focus');
const phone = $('#live-phone');
const content = $('#view-content');
const params = new URLSearchParams(location.search);
const requestedView = params.get('view');
const initialView = allViews.some(([id])=>id === requestedView) ? requestedView : (params.get('card') || location.hash.startsWith('#board-') ? 'screens' : defaultView);
let app, cards = [], selectedCard, state, history = [], currentView = initialView, appId, appVariant = null;
// Every design state of the current app, so findings and comparisons can reach across them.
let stateApps = new Map(), stateEntries = [];
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
function makeState(card, mod = app) {
  const next = mod.freshState();
  next.route = card.route;
  card.setup?.(next);
  return next;
}
function currentCard() {
  return cards.find(card => card.route === state.route && card.match?.(state))
    || cards.find(card => card.route === state.route && card.kind === 'ready')
    || cards.find(card => card.route === state.route);
}
function tokensStyle(mod = app) {
  // Another design state may support fewer appearances than the active one.
  const theme = mod.tokens[appTheme] ? appTheme : (mod.appearances || ['light'])[0];
  return Object.entries(mod.tokens[theme]).map(([key, value]) => `--app-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}:${value}`).join(';') + `;color-scheme:${theme}`;
}
function screenHTML(s, mod = app) {
  const overlay = s.overlay ? mod.OVERLAYS[s.overlay]?.(s) : '';
  const toast = s.toast ? `<div class="phone-toast" role="status"><span>${esc(s.toast)}</span><button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>` : '';
  if (mod.presentation?.edgeToEdge) return mod.SCREENS[s.route](s) + toast;
  return `<div class="statusbar" aria-hidden="true"><span>9:41</span><span class="island"></span><span class="status-icons">▴▴▴ &nbsp;◔ ▰</span></div><div class="phone-content" ${overlay ? 'inert' : ''}>${mod.SCREENS[s.route](s)}</div>${overlay ? `<div class="phone-overlay"><button class="overlay-backdrop" data-action="dismiss-overlay" aria-label="Dismiss overlay" tabindex="-1"></button>${overlay}</div>` : ''}${toast}<div class="home-ind" aria-hidden="true"></div>`;
}
const staticMarkup = html => html.replace(/\s(?:id|for|aria-labelledby|aria-describedby)="[^"]*"/g, '');
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
  const [module, findingsModule, designModule, ...stateModules] = await Promise.all([
    import(entry.module),
    registered.findings ? import(registered.findings) : null,
    registered.designSystem ? import(registered.designSystem) : null,
    ...variants.map(item => import(item.module)),
  ]);
  if (version !== selectionVersion) return;
  findings = findingsModule?.default || null;
  designSystem = designModule?.default || null; designSystemPath = registered.designSystem || null;
  applyDesignFonts();
  stateEntries = variants;
  stateApps = new Map(variants.map((item, index) => [item.id, stateModules[index].default]));
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
  selectedCard = null; reviewSequence = null; mapFlow = -1; state = app.freshState(); history = []; search = ''; kind = 'all'; boardFilter = 'all';
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
  if (!viewEnabled(currentView)) currentView = fallbackView();
  renderView(); updateURL();
}
function mobileTabs() {
  return `<div class="mobile-navigation"><nav class="mobile-tabs" aria-label="Workspace views">${workspaceViews().map(([id,label])=>`<button data-view="${id}" aria-label="${label}" class="${currentView === id ? 'active' : ''}" ${currentView === id ? 'aria-current="page"' : ''}>${$(`.view-nav [data-view="${id}"] svg`)?.outerHTML || ''}<span>${id === 'library' ? 'Library' : label}</span></button>`).join('')}</nav></div>`;
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
  const items = findingItems();
  const findingsLink = items.length ? `<section class="overview-findings"><h2>${items.length} ${items.length === 1 ? 'finding' : 'findings'}</h2><p>${esc(severitySummary(items))}</p><div class="overview-findings-actions"><button type="button" class="text-button" data-view="findings">View findings</button><button type="button" class="text-button" data-present="0">Present</button></div></section>` : '';
  return `<article class="studio-overview" aria-labelledby="overview-title">${renderAbout()}<header><p class="overview-label">${esc(overview.eyebrow || 'Overview')}</p><h1 id="overview-title">${esc(overview.title || 'Project overview')}</h1>${overview.description ? `<p class="overview-description">${esc(overview.description)}</p>` : ''}</header>${overview.rationale ? `<p class="overview-rationale">${esc(overview.rationale)}</p>` : ''}${strategies.length ? `<section class="overview-approach" aria-labelledby="overview-approach-title"><h2 id="overview-approach-title">${esc(approachTitle)}</h2><ul>${strategies.map(item=>`<li>${strategyHTML(item)}</li>`).join('')}</ul></section>` : ''}${referenceURL ? `<footer class="overview-reference"><a href="${esc(referenceURL)}" target="_blank" rel="noopener noreferrer">${esc(overview.reference.label || 'Read the reference')}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h11v11M19 5 5 19"/></svg></a></footer>` : ''}${findingsLink}</article>`;
}
// Review framing for someone opening a shared link without a walkthrough.
function renderAbout() {
  const about = studioOptions.about;
  if (!about) return '';
  const rows = [['Prepared for', about.preparedFor], ['Prepared by', about.preparedBy], ['Date', about.date], ['Scope', about.scope]]
    .filter(([, value]) => typeof value === 'string' && value.trim());
  const note = about.note || (stateEntries.length > 1
    ? `Open any screen to try it. ${stateEntries.map(item => item.name).join(' and ')} are separate design states; switch between them at the top. Every interaction is simulated locally.`
    : 'Open any screen to try it. Every interaction is simulated locally.');
  return `<aside class="overview-about" aria-label="About this review">${rows.length ? `<dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}<p>${esc(note)}</p></aside>`;
}

// Findings link captured evidence to the proposal that addresses it.
const severityOrder = ['high', 'medium', 'low'];
const findingStates = () => ({ evidence: findings?.evidenceState || 'existing', proposal: findings?.proposalState || 'future' });
function findingItems() {
  const items = Array.isArray(findings?.items) ? findings.items : [];
  return items.map((item, index) => ({ ...item, order: index }))
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) || a.order - b.order);
}
function severitySummary(items) {
  return severityOrder.map(level => [level, items.filter(item => item.severity === level).length])
    .filter(([, count]) => count).map(([level, count]) => `${count} ${level}`).join(' · ');
}
// Without design states, evidence and proposal cards both live in the single app.
function stateApp(id) { return stateApps.get(id) || (!stateEntries.length ? app : null); }
function stateName(id) { return stateEntries.find(item => item.id === id)?.name || (id === findingStates().evidence ? 'Evidence' : 'Proposal'); }
function findCard(stateId, cardId) {
  for (const board of stateApp(stateId)?.NAV || []) {
    const card = board.cards.find(item => item.id === cardId);
    if (card) return card;
  }
  return null;
}
function severityTag(level) { return `<span class="severity severity-${esc(level)}">${esc(level[0].toUpperCase() + level.slice(1))}</span>`; }
function findingLinks(stateId, ids = []) {
  const links = ids.map(id => findCard(stateId, id) ? `<button type="button" class="finding-card-link" data-state-card="${esc(stateId)}" data-card="${esc(id)}">${esc(findCard(stateId, id).title)}</button>` : '').join('');
  return links ? `<div class="finding-links"><span>${esc(stateName(stateId))}</span>${links}</div>` : '';
}
function renderFindings() {
  const items = findingItems();
  const { evidence, proposal } = findingStates();
  return `<div class="section-toolbar"><h1 class="section-title">Findings <span>${esc(severitySummary(items))}</span></h1><button type="button" class="text-button present-start" data-present="0">Present</button></div>
    ${findings.summary ? `<p class="findings-summary">${esc(findings.summary)}</p>` : ''}
    <ol class="findings-list">${items.map((item, index) => `<li class="finding" id="finding-${esc(item.id)}">
      <span class="finding-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div class="finding-body">
        <div class="finding-heading">${severityTag(item.severity)}<h2>${esc(item.title)}</h2></div>
        ${item.problem ? `<p class="finding-problem">${esc(item.problem)}</p>` : ''}
        ${item.recommendation ? `<p class="finding-recommendation"><strong>Recommendation</strong> ${esc(item.recommendation)}</p>` : ''}
        <div class="finding-footer">${findingLinks(evidence, item.evidence)}${findingLinks(proposal, item.proposal)}<button type="button" class="text-button" data-present="${index}">Present</button></div>
      </div>
    </li>`).join('')}</ol>`;
}
// The counterpart of a card in another design state: an explicit compare, else a finding pair.
function counterpartFor(card) {
  if (!card || stateEntries.length < 2) return null;
  let target = card.compare;
  if (!target) {
    const { evidence, proposal } = findingStates();
    for (const item of findingItems()) {
      if (appVariant === evidence && item.evidence?.includes(card.id) && item.proposal?.length) { target = { state: proposal, card: item.proposal[0] }; break; }
      if (appVariant === proposal && item.proposal?.includes(card.id) && item.evidence?.length) { target = { state: evidence, card: item.evidence[0] }; break; }
    }
  }
  return target && target.state !== appVariant && findCard(target.state, target.card) ? target : null;
}
async function openStateCard(stateId, cardId) {
  if (stateEntries.length && stateId !== appVariant) await loadApp(appId, stateId);
  if (cards.some(card => card.id === cardId)) openCard(cardId);
}
function cardHTML(card) {
  const s = makeState(card);
  const preview = screenHTML(s).replace(/\s(?:id|for|aria-labelledby|aria-describedby)="[^"]*"/g, '');
  return `<article class="screen-card" data-card-id="${esc(card.id)}">
    <div role="button" tabindex="0" class="card-open" data-open-card="${esc(card.id)}" aria-label="Open ${esc(card.title)}">
      <div class="thumb" aria-hidden="true" inert><div class="phone" style="${tokensStyle()}">${preview}</div></div>
    </div>
    <div class="card-details"><div class="card-name"><h3>${esc(card.title)}</h3><span class="status status-${esc(card.status.toLowerCase())}">${esc(card.status)}</span></div><div class="card-route">/${esc(card.route)}${card.kind !== 'ready' ? ` · ${esc(card.kind)}` : ''}</div></div>
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
  if (designSystem) return renderDesignSystem();
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
// Design system: inferred from Existing screenshots by Claude (apps/design-system.js), with a live
// pixel-sampled palette as a cross-check. While the file is pending, the view polls for it.
// Fonts the design system ships (e.g. extracted from the client's app) load for samples and Future screens.
function applyDesignFonts() {
  let style = document.getElementById('ds-fonts');
  if (!style) { style = document.createElement('style'); style.id = 'ds-fonts'; document.head.append(style); }
  const safe = value => String(value ?? '').replace(/["\\<>]/g, '');
  style.textContent = (designSystem?.fonts || []).filter(font => /^\.\/apps\/[^"'()]+\.(woff2?|ttf|otf)$/.test(font.src || '')).map(font => `@font-face{font-family:"${safe(font.family)}";src:url("${safe(font.src)}");font-weight:${Number(font.weight) || 400};font-style:${font.style === 'italic' ? 'italic' : 'normal'};font-display:swap}`).join('');
}
const dsState = () => designSystem?.evidenceState || 'existing';
const dsName = () => designSystem?.name || app.identity.name;
const px = value => typeof value === 'number' ? `${value}px` : String(value ?? '');
function evidenceCrop(evidence, width = 220) {
  const mod = stateApp(dsState()), card = evidence?.card && findCard(dsState(), evidence.card);
  if (!mod || !card || !Array.isArray(evidence.box)) return '';
  const [left, top, w, h] = evidence.box;
  const frameW = mod.presentation?.width || 360, frameH = mod.presentation?.height || 740;
  // Never enlarge past 1.4x, so small controls stay crisp instead of filling the slot.
  const scale = Math.min(width / (frameW * w / 100), 1.4), height = frameH * h / 100 * scale;
  width = frameW * w / 100 * scale;
  // A div, not a button: the screen markup inside contains buttons, which cannot nest.
  return `<div role="button" tabindex="0" class="ds-crop" data-state-card="${esc(dsState())}" data-card="${esc(card.id)}" aria-label="Open ${esc(card.title)}" title="Open ${esc(card.title)}" style="width:${Math.round(width)}px;height:${Math.round(height)}px"><span class="ds-crop-inner" aria-hidden="true" inert><span class="phone" style="${tokensStyle(mod)};--preview-width:${frameW}px;--preview-height:${frameH}px;transform:translate(${-frameW * left / 100 * scale}px,${-frameH * top / 100 * scale}px) scale(${scale})">${staticMarkup(screenHTML(makeState(card, mod), mod))}</span></span></div>`;
}
const crops = (list, width) => (list || []).map(item => evidenceCrop(item, width)).filter(Boolean).join('');
function dsSection(id, title, note, body) {
  return body ? `<section class="ds-section" id="ds-${id}"><header><h2>${esc(title)}</h2>${note ? `<p>${esc(note)}</p>` : ''}</header>${body}</section>` : '';
}
function renderDesignSystem() {
  setStateStylesheets(true);
  const ds = designSystem, pending = ds.status !== 'ready';
  const head = `<div class="section-toolbar"><h1 class="section-title">Design library <span>${esc(dsName())} design system</span></h1></div>`;
  const sampled = `<section class="ds-section"><header><h2>Sampled palette</h2><p>Measured live from the pixels of every ${esc(stateName(dsState()))} screen. Coverage is the share of all screenshot area.</p></header><div id="ds-sampled" class="ds-sampled"><p class="ds-progress">Preparing…</p></div></section>`;
  if (pending) {
    queueMicrotask(sampleScreens); pollDesignSystem();
    return `${head}<div class="ds-pending" role="status"><span class="ds-spinner" aria-hidden="true"></span><div><strong>Inferring the ${esc(dsName())} design system</strong><p>Claude is reading the ${esc(stateName(dsState()))} screenshots for color, type, spacing, shape, components, and voice. This page updates on its own when it is ready.</p></div></div>
      <div class="ds-skeleton" aria-hidden="true">${'<div></div>'.repeat(6)}</div>${sampled}`;
  }
  const nav = [['overview','Overview'],['colors','Color'],['type','Typography'],['spacing','Spacing'],['shape','Shape & elevation'],['components','Components'],['icons','Iconography'],['voice','Voice'],['tokens','Tokens']];
  const basis = ds.basis || {};
  const overview = dsSection('overview', 'Overview', '', `<p class="ds-summary">${esc(ds.summary || '')}</p><dl class="ds-basis">${[['Source', basis.source], ['Screens', basis.screens], ['Captured', basis.captured], ['Method', basis.method]].filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${(ds.principles || []).length ? `<ul class="ds-principles">${ds.principles.map(item => `<li><b>${esc(item.title)}</b> ${esc(item.text)}</li>`).join('')}</ul>` : ''}`);
  const colors = dsSection('colors', 'Color', ds.colorNote, (ds.colors || []).map(group => `<div class="ds-group"><h3>${esc(group.group)}</h3><div class="ds-color-grid">${(group.items || []).map(color => `<article class="ds-color"><div class="ds-swatch" style="background:${esc(color.hex)}"></div><div class="ds-color-info"><b>${esc(color.name)}</b><code>${esc(color.hex)}</code>${color.role ? `<span class="ds-role">${esc(color.role)}</span>` : ''}${color.usage ? `<p>${esc(color.usage)}</p>` : ''}</div>${crops(color.evidence, 96) ? `<div class="ds-evidence">${crops(color.evidence, 96)}</div>` : ''}</article>`).join('')}</div></div>`).join(''));
  const type = dsSection('type', 'Typography', ds.typeNote, (ds.typography || []).map(item => `<article class="ds-type"><div class="ds-type-sample" style="font-family:${esc(item.fallback || 'inherit')};font-size:${esc(px(item.size))};font-weight:${esc(item.weight || 400)};line-height:${esc(item.lineHeight || 1.25)};letter-spacing:${esc(item.tracking || 'normal')}">${esc(item.sample || item.name)}</div><div class="ds-type-meta"><b>${esc(item.name)}</b><code>${esc([px(item.size), item.weight, item.lineHeight && `${item.lineHeight} lh`].filter(Boolean).join(' · '))}</code><span>${esc(item.family || '')}</span>${item.usage ? `<p>${esc(item.usage)}</p>` : ''}</div>${crops(item.evidence, 200) ? `<div class="ds-evidence">${crops(item.evidence, 200)}</div>` : ''}</article>`).join(''));
  const spacingList = ds.spacing?.scale || [];
  const spacing = dsSection('spacing', 'Spacing', ds.spacing?.note, spacingList.length ? `<div class="ds-scale">${spacingList.map(item => `<div class="ds-space"><span style="width:${esc(px(item.value))}"></span><code>${esc(px(item.value))}</code><p>${esc(item.usage || '')}</p></div>`).join('')}</div>` : '');
  const shape = dsSection('shape', 'Shape & elevation', ds.shapeNote, `${(ds.radii || []).length ? `<h3 class="ds-sub">Corner radius</h3><div class="ds-shapes">${ds.radii.map(item => `<article><div class="ds-radius" style="border-radius:${esc(px(item.value))}"></div><b>${esc(item.name)}</b><code>${esc(px(item.value))}</code><p>${esc(item.usage || '')}</p></article>`).join('')}</div>` : ''}${(ds.elevation || []).length ? `<h3 class="ds-sub">Elevation</h3><div class="ds-shapes">${ds.elevation.map(item => `<article><div class="ds-elevation" style="box-shadow:${esc(item.value)}"></div><b>${esc(item.name)}</b><p>${esc(item.usage || '')}</p></article>`).join('')}</div>` : ''}`);
  const components = dsSection('components', 'Components', ds.componentNote, (ds.components || []).map(item => `<article class="ds-component"><div class="ds-evidence">${crops(item.evidence, 240)}</div><div class="ds-component-info"><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}${item.specs ? `<dl>${Object.entries(item.specs).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}${(item.variants || []).length ? `<p class="ds-variants">Variants: ${item.variants.map(esc).join(' · ')}</p>` : ''}</div></article>`).join(''));
  const icons = ds.iconography ? dsSection('icons', 'Iconography', '', `<p class="ds-summary">${esc(ds.iconography.style || '')}</p>${(ds.iconography.notes || []).length ? `<ul class="ds-list">${ds.iconography.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<div class="ds-evidence">${crops(ds.iconography.evidence, 140)}</div>`) : '';
  const voice = ds.voice ? dsSection('voice', 'Voice', '', `<p class="ds-summary">${esc(ds.voice.tone || '')}</p>${(ds.voice.patterns || []).length ? `<ul class="ds-list">${ds.voice.patterns.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}${(ds.voice.examples || []).length ? `<div class="ds-quotes">${ds.voice.examples.map(q => `<blockquote>${esc(q)}</blockquote>`).join('')}</div>` : ''}`) : '';
  const tokens = ds.tokens ? dsSection('tokens', 'Tokens', 'Feeds the Future design state. Edit here, and Future screens pick it up.', Object.entries(ds.tokens).map(([mode, values]) => `<div class="ds-group"><h3>${esc(mode)}</h3><table class="ds-tokens"><tbody>${Object.entries(values).map(([k, v]) => `<tr><td><code>--app-${esc(k.replace(/[A-Z]/g, l => '-' + l.toLowerCase()))}</code></td><td>${/^#|^rgb/.test(v) ? `<span class="ds-dot" style="background:${esc(v)}"></span>` : ''}<code>${esc(v)}</code></td></tr>`).join('')}</tbody></table></div>`).join('')) : '';
  queueMicrotask(sampleScreens);
  return `${head}<nav class="ds-nav" aria-label="Design system sections">${nav.map(([id, label]) => `<a href="#ds-${id}">${label}</a>`).join('')}</nav>${overview}${colors}${sampled}${type}${spacing}${shape}${components}${icons}${voice}${tokens}`;
}
function pollDesignSystem() {
  if (designSystemPoll || !designSystemPath) return;
  designSystemPoll = setInterval(async () => {
    if (currentView !== 'library' || designSystem?.status === 'ready') { clearInterval(designSystemPoll); designSystemPoll = null; return; }
    try {
      const next = (await import(`${designSystemPath}?v=${Date.now()}`)).default;
      if (next?.status === 'ready') { designSystem = next; clearInterval(designSystemPoll); designSystemPoll = null; renderView(); }
    } catch {}
  }, 4000);
}
const sampledPalettes = new Map();
async function sampleScreens() {
  const target = document.getElementById('ds-sampled');
  const mod = stateApp(dsState());
  if (!target || !mod) return;
  const parser = new DOMParser();
  const sources = [...new Set(mod.NAV.flatMap(board => board.cards).flatMap(card => [...parser.parseFromString(screenHTML(makeState(card, mod), mod), 'text/html').images].map(image => image.getAttribute('src'))).filter(Boolean))];
  if (!sources.length) { target.innerHTML = '<p class="ds-progress">No screenshots to sample in this design state.</p>'; return; }
  const key = `${appId}:${sources.join('|')}`;
  if (!sampledPalettes.has(key)) {
    const job = (async () => {
      const buckets = new Map(), canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      let total = 0, done = 0;
      for (const src of sources) {
        const image = new Image(); image.src = src;
        try { await image.decode(); } catch { done++; continue; }
        canvas.width = 72; canvas.height = Math.max(1, Math.round(72 * image.naturalHeight / image.naturalWidth));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const id = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3;
          const bucket = buckets.get(id) || { r: 0, g: 0, b: 0, n: 0, screens: new Set() };
          bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2]; bucket.n++; bucket.screens.add(src); buckets.set(id, bucket);
          total++;
        }
        done++;
        const live = document.getElementById('ds-sampled');
        if (live && done < sources.length) live.innerHTML = `<p class="ds-progress"><span class="ds-bar"><span style="width:${Math.round(done / sources.length * 100)}%"></span></span>Sampling ${done} of ${sources.length} screenshots…</p>`;
      }
      const clusters = [];
      for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
        const color = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
        const near = clusters.find(cluster => Math.hypot(...cluster.color.map((value, index) => value - color[index])) < 26);
        if (near) { near.n += bucket.n; bucket.screens.forEach(src => near.screens.add(src)); }
        else clusters.push({ color, n: bucket.n, screens: new Set(bucket.screens) });
      }
      const hex = color => `#${color.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
      return clusters.sort((a, b) => b.n - a.n).filter(cluster => cluster.n / total > .002).slice(0, 18).map(cluster => ({ hex: hex(cluster.color), share: cluster.n / total, screens: cluster.screens.size, count: sources.length }));
    })();
    sampledPalettes.set(key, job);
  }
  const palette = await sampledPalettes.get(key);
  const live = document.getElementById('ds-sampled');
  if (live) live.innerHTML = `<div class="ds-sampled-grid">${palette.map(item => `<div class="ds-sample"><span style="background:${item.hex}"></span><code>${item.hex}</code><small>${(item.share * 100).toFixed(item.share < .01 ? 1 : 0)}% · ${item.screens}/${item.count} screens</small></div>`).join('')}</div>`;
}
// Flow map: every flow merged into one graph. Pills highlight a single flow and its steps.
let mapFlow = -1;
function mapGraph() {
  const ids = [], edges = new Map();
  app.FLOWS.forEach((flow, flowIndex) => flow.steps.forEach((step, index) => {
    if (!ids.includes(step.card)) ids.push(step.card);
    const next = flow.steps[index + 1];
    if (!next) return;
    const key = `${step.card}>${next.card}`;
    if (!edges.has(key)) edges.set(key, { from: step.card, to: next.card, label: step.label || '', flows: new Set() });
    edges.get(key).flows.add(flowIndex);
  }));
  const all = [...edges.values()], back = new Set(), seen = new Map();
  const visit = id => {
    seen.set(id, 1);
    for (const edge of all.filter(item => item.from === id)) {
      if (seen.get(edge.to) === 1) back.add(edge);
      else if (!seen.get(edge.to)) visit(edge.to);
    }
    seen.set(id, 2);
  };
  ids.forEach(id => seen.get(id) || visit(id));
  const forward = all.filter(edge => !back.has(edge));
  const layer = new Map(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) for (const edge of forward) layer.set(edge.to, Math.max(layer.get(edge.to), layer.get(edge.from) + 1));
  const columns = [];
  ids.forEach(id => (columns[layer.get(id)] ||= []).push(id));
  // Rows: each screen sits level with its parents where possible, so chains stay straight.
  const row = new Map();
  columns.forEach(column => column.forEach((id, index) => row.set(id, index)));
  for (const column of columns.slice(1)) {
    const want = id => { const rows = forward.filter(edge => edge.to === id).map(edge => row.get(edge.from)); return rows.length ? Math.min(...rows) : row.get(id); };
    const wanted = new Map(column.map(id => [id, want(id)]));
    column.sort((a, b) => wanted.get(a) - wanted.get(b));
    let next = 0;
    for (const id of column) { const value = Math.max(wanted.get(id), next); row.set(id, value); next = value + 1; }
  }
  const rows = Math.max(...ids.map(id => row.get(id))) + 1;
  return { ids, edges: all, back, layer, row, columns, rows };
}
function renderMap() {
  const graph = mapGraph(), flow = app.FLOWS[mapFlow];
  const W = 176, H = 58, X = 248, Y = 92, pad = 24;
  const at = id => ({ x: pad + graph.layer.get(id) * X, y: pad + graph.row.get(id) * Y });
  const width = pad * 2 + (graph.columns.length - 1) * X + W, height = pad * 2 + (graph.rows - 1) * Y + H + 40;
  const stepOf = id => flow ? flow.steps.findIndex(step => step.card === id) : -1;
  const path = edge => {
    const a = at(edge.from), b = at(edge.to);
    if (b.x > a.x) { const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x - 6, y2 = b.y + H / 2, dx = (x2 - x1) / 2; return `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`; }
    const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y + H + 6, low = Math.max(y1, y2) + 34;
    return `M${x1} ${y1}C${x1} ${low} ${x2} ${low} ${x2} ${y2}`;
  };
  const labelAt = edge => { const a = at(edge.from), b = at(edge.to); return b.x > a.x ? { x: (a.x + W + b.x) / 2, y: (a.y + b.y + H) / 2 } : { x: (a.x + b.x + W) / 2, y: Math.max(a.y, b.y) + H + 26 }; };
  const on = edge => flow && edge.flows.has(mapFlow);
  const edgesSVG = graph.edges.map(edge => `<path class="graph-edge${on(edge) ? ' on' : ''}" d="${path(edge)}" marker-end="url(#${on(edge) ? 'graph-arrow-on' : 'graph-arrow'})"/>`).join('');
  const labels = flow ? graph.edges.filter(on).map(edge => { const p = labelAt(edge); return `<span class="graph-label" style="left:${p.x}px;top:${p.y}px">${esc(edge.label || 'Continue')}</span>`; }).join('') : '';
  const nodes = graph.ids.map(id => {
    const card = cards.find(item => item.id === id), p = at(id), step = stepOf(id);
    const sequence = step >= 0 ? ` data-flow-index="${mapFlow}" data-step-index="${step}"` : '';
    return `<button class="graph-node${step >= 0 ? ' on' : ''}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px" data-open-card="${esc(card.id)}"${sequence}>${step >= 0 ? `<i>${step + 1}</i>` : ''}<b>${esc(card.title)}</b><small>/${esc(card.route)}</small></button>`;
  }).join('');
  const pills = [['All flows', -1], ...app.FLOWS.map((item, index) => [item.title, index])].map(([title, index]) => `<button class="graph-pill" data-map-flow="${index}" aria-pressed="${mapFlow === index}">${esc(title)}${index >= 0 ? `<span>${app.FLOWS[index].steps.length}</span>` : ''}</button>`).join('');
  return `<div class="section-toolbar"><h1 class="section-title">Flow map <span>${graph.ids.length} screens · ${app.FLOWS.length} flows</span></h1></div>
    <div class="graph-pills" role="group" aria-label="Highlight a flow">${pills}</div>
    ${flow?.description ? `<p class="flow-description">${esc(flow.description)}</p>` : ''}
    <div class="graph-scroll"><div class="graph${flow ? ' focused' : ''}" style="width:${width}px;height:${height}px">
      <svg class="graph-edges" width="${width}" height="${height}" aria-hidden="true"><defs><marker id="graph-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z"/></marker><marker id="graph-arrow-on" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z"/></marker></defs>${edgesSVG}</svg>
      ${labels}${nodes}
    </div></div>`;
}
function renderView() {
  $('#board-subnav').hidden = currentView !== 'screens';
  for (const button of document.querySelectorAll('.view-nav [data-view]')) {
    button.hidden = !workspaceViews().some(([id])=>id === button.dataset.view);
    const active = button.dataset.view === currentView;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  let html;
  if (currentView === 'overview') html = renderOverview();
  else if (currentView === 'findings') html = renderFindings();
  else if (currentView === 'screens') {
    html = `<div class="section-toolbar"><h1 class="section-title">Screens <span id="visible-count" aria-live="polite"></span></h1><div class="filters"><div class="search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="search" type="search" aria-label="Search screens" placeholder="Search screens" value="${esc(search)}"></div><select id="board-filter" aria-label="Filter by board"><option value="all">All boards</option>${app.NAV.map(board => `<option value="${esc(board.id)}" ${boardFilter === board.id ? 'selected' : ''}>${esc(board.title)}</option>`).join('')}</select><select id="kind-filter" aria-label="Filter by state type"><option value="all">All states</option>${[...new Set(cards.map(card => card.kind))].map(value => `<option value="${esc(value)}" ${kind === value ? 'selected' : ''}>${esc(value[0].toUpperCase()+value.slice(1))}</option>`).join('')}</select></div></div><div id="boards"></div>`;
  } else if (currentView === 'map') html = renderMap();
  else html = renderLibrary();
  content.innerHTML = mobileTabs() + html;
  if (currentView === 'screens') drawBoards();
}

function setView(view) {
  if (!workspaceViews().some(([id])=>id === view)) return;
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
  const closeLabel = `Back to ${workspaceViews().find(([id])=>id === currentView)?.[1].toLowerCase() || 'screens'}`;
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
  // Return focus quietly: no ring on the card just closed until the user moves focus again.
  if (returnFocus) { returnFocus.classList.add('quiet-focus'); returnFocus.addEventListener('blur', () => returnFocus.classList.remove('quiet-focus'), { once: true }); returnFocus.focus({preventScroll:true}); }
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
  renderCompare(baseCard);
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
  $('#context').innerHTML = `<div class="context-top"><span class="status status-${esc(card.status.toLowerCase())}">${esc(card.status)}</span>${card.kind !== 'ready' ? `<span class="status">${esc(card.kind)}</span>` : ''}</div><h2>${esc(card.title)}</h2><div class="context-route">/${esc(state.route)}${state.overlay ? ` · ${esc(state.overlay)}` : ''}</div>${renderContextSummary(card)}<section class="context-box"><h3>How you get here</h3><p>${esc(card.how)}</p></section><section class="context-box"><h3>Available interactions</h3><ul>${actions.map(action=>`<li class="interaction-item"><strong>${esc(action.label)}</strong><span>${esc(action.description)}</span></li>`).join('') || '<li>No actions are documented for this state.</li>'}</ul></section><div class="simulation-note">${simulationNote}</div>`;
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
function renderCompare(card) {
  const toggle = $('#compare-toggle');
  const target = counterpartFor(card);
  toggle.hidden = !target;
  if (!target) { toggle.innerHTML = ''; delete toggle.dataset.key; return; }
  const key = `${appVariant}:${card.id}:${target.state}:${target.card}`;
  if (toggle.dataset.key === key) return;
  toggle.dataset.key = key;
  toggle.innerHTML = stateEntries.filter(item => [appVariant, target.state].includes(item.id)).map(item => item.id === appVariant
    ? `<button type="button" aria-pressed="true">${esc(item.name)}</button>`
    : `<button type="button" aria-pressed="false" data-state-card="${esc(item.id)}" data-card="${esc(target.card)}" title="${esc(findCard(item.id, target.card).title)}">${esc(item.name)}</button>`).join('');
}

// Presenter mode walks through findings with evidence and proposal side by side.
const presenter = $('#present');
let presentIndex = 0, presentOpener = null;
function setStateStylesheets(enabled) {
  for (const link of document.querySelectorAll('link[data-state-stylesheet]')) link.remove();
  if (!enabled) return;
  for (const item of stateEntries) {
    if (item.id === appVariant || !item.stylesheet) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = item.stylesheet; link.dataset.stateStylesheet = item.id;
    document.head.append(link);
  }
}
function presentFrame(stateId, cardId) {
  const mod = stateApp(stateId), card = cardId && findCard(stateId, cardId);
  if (!mod || !card) return '';
  const width = mod.presentation?.width || 360, height = mod.presentation?.height || 740;
  const scale = Math.min(.6, 360 / width);
  return `<figure class="present-frame"><figcaption><span>${esc(stateName(stateId))}</span>${esc(card.title)}</figcaption><div role="button" tabindex="0" class="present-open" data-state-card="${esc(stateId)}" data-card="${esc(cardId)}" aria-label="Try ${esc(card.title)} in the prototype" style="width:${width * scale}px;height:${height * scale}px"><div class="present-thumb" aria-hidden="true" inert><div class="phone" style="${tokensStyle(mod)};--preview-width:${width}px;--preview-height:${height}px;transform:scale(${scale})">${staticMarkup(screenHTML(makeState(card, mod), mod))}</div></div></div></figure>`;
}
function renderPresenter() {
  const items = findingItems(), item = items[presentIndex];
  const { evidence, proposal } = findingStates();
  $('#present-position').textContent = `Finding ${presentIndex + 1} of ${items.length}`;
  $('#present-previous').disabled = presentIndex === 0;
  $('#present-next').disabled = presentIndex === items.length - 1;
  $('#present-body').innerHTML = `<div class="present-text">${severityTag(item.severity)}<h2 id="present-title">${esc(item.title)}</h2>${item.problem ? `<p class="finding-problem">${esc(item.problem)}</p>` : ''}${item.recommendation ? `<p class="finding-recommendation"><strong>Recommendation</strong> ${esc(item.recommendation)}</p>` : ''}</div><div class="present-frames">${presentFrame(evidence, item.evidence?.[0])}${presentFrame(proposal, item.proposal?.[0])}</div>`;
  $('#present-announcement').textContent = `Finding ${presentIndex + 1}: ${item.title}`;
}
function openPresenter(index) {
  const count = findingItems().length;
  if (!count) return;
  presentIndex = Math.max(0, Math.min(count - 1, index));
  if (!presenter.open) {
    presentOpener = document.activeElement;
    setStateStylesheets(true);
    presenter.showModal();
    document.body.style.overflow = 'hidden';
  }
  renderPresenter();
  $('#present-close').focus({ preventScroll: true });
}
function movePresenter(direction) {
  const index = presentIndex + direction;
  if (index < 0 || index >= findingItems().length) return;
  presentIndex = index; renderPresenter();
}
presenter.addEventListener('close', () => {
  setStateStylesheets(false);
  document.body.style.overflow = '';
  if (presentOpener?.isConnected) presentOpener.focus({ preventScroll: true });
  presentOpener = null;
});
presenter.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); movePresenter(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); movePresenter(1); }
});
$('#present-previous').addEventListener('click', () => movePresenter(-1));
$('#present-next').addEventListener('click', () => movePresenter(1));
$('#present-close').addEventListener('click', () => presenter.close());

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
  const frame = event.target.closest('.present-open, .ds-crop');
  if (frame && ['Enter',' '].includes(event.key)) { event.preventDefault(); frame.click(); }
});
document.addEventListener('click',event=>{
  const target = event.target.closest('[data-open-card],[data-view],[data-board],[data-state-card],[data-present],[data-map-flow]');
  if (!target) return;
  if (target.dataset.mapFlow !== undefined) {
    mapFlow = Number(target.dataset.mapFlow); renderView();
    document.querySelector(`[data-map-flow="${mapFlow}"]`)?.focus({preventScroll:true, focusVisible:false});
    document.querySelector('.graph-node.on')?.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'});
  }
  else if (target.dataset.stateCard) {
    if (presenter.open) { presentOpener = null; presenter.close(); }
    openStateCard(target.dataset.stateCard, target.dataset.card).catch(showError);
  }
  else if (target.dataset.present !== undefined) openPresenter(Number(target.dataset.present));
  else if (target.dataset.openCard) openCardFromElement(target);
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
