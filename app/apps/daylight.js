import { escape, icon, button, iconButton, header, emptyState, field } from '../ui.js';

const samplePlans = () => [
  { id: 'morning-pages', title: 'Morning pages', category: 'Personal', minutes: 15, done: false },
  { id: 'walk-outside', title: 'A walk outside', category: 'Wellbeing', minutes: 25, done: false },
  { id: 'read-chapter', title: 'Read a chapter', category: 'Learning', minutes: 20, done: false },
];
const categories = ['Personal', 'Wellbeing', 'Learning'];
const categoryIcon = category => ({ Personal: 'pencil', Wellbeing: 'leaf', Learning: 'book' })[category] || 'sun';
const selectedPlan = s => s.plans.find(plan => plan.id === s.selectedId) || s.plans[0];
const clean = s => !s.overlay && !s.toast;
const on = (route, test = () => true) => s => s.route === route && clean(s) && test(s);

function sunArt(className = '') {
  return `<div class="daylight-art ${className}" aria-hidden="true"><div class="daylight-orbit orbit-one"></div><div class="daylight-orbit orbit-two"></div><div class="daylight-sun"></div><div class="daylight-horizon"></div><div class="daylight-art-caption">A LITTLE SPACE, EVERY DAY</div></div>`;
}

function tabbar(active = 'today') {
  return `<nav class="app-tabbar" aria-label="Main navigation"><button type="button" data-action="today" class="${active === 'today' ? 'is-active' : ''}"${active === 'today' ? ' aria-current="page" disabled' : ''}>${icon('sun')}<span>Today</span></button><button type="button" data-action="settings" class="${active === 'settings' ? 'is-active' : ''}"${active === 'settings' ? ' aria-current="page" disabled' : ''}>${icon('settings')}<span>Settings</span></button></nav>`;
}

function todayHead() {
  return `<div class="daylight-topline"><span class="daylight-wordmark">${icon('sun', 21)} daylight</span><span class="app-mini-tag">WED, OCT 14</span></div><div class="daylight-page-title"><div><p class="app-eyebrow">MAKE ROOM FOR YOU</p><h1>Your day,<br><em>a little lighter.</em></h1></div></div>`;
}

function planRow(plan) {
  return `<button type="button" class="daylight-plan-row ${plan.done ? 'is-done' : ''}" data-action="open-plan" data-id="${escape(plan.id)}"><span class="daylight-plan-icon">${icon(plan.done ? 'check' : categoryIcon(plan.category), 22)}</span><span class="daylight-plan-copy"><strong>${escape(plan.title)}</strong><small>${escape(plan.category)} <span>·</span> ${plan.minutes} min</small></span>${icon('chevron', 16)}</button>`;
}

function reminderRow(s) {
  return `<div class="daylight-setting-row"><span class="daylight-plan-icon">${icon('bell')}</span><span><strong>A gentle nudge</strong><small>Daily reminder at 9:00 am</small></span><button type="button" class="app-switch" role="switch" aria-label="Daily reminder" aria-checked="${s.reminders}" data-action="toggle-reminders"><span></span></button></div>`;
}

function renderToday(s) {
  let content;
  if (s.loadState === 'loading') {
    content = `<div class="daylight-summary skeleton" aria-label="Loading your day"></div><div class="daylight-section-label"><h2>Today's plans</h2><span class="app-loading-label"><span class="app-spinner"></span> Gathering</span></div><div class="daylight-skeleton-list" aria-hidden="true">${[1, 2, 3].map(() => '<div class="daylight-skeleton-row"><i class="skeleton"></i><div><b class="skeleton"></b><span class="skeleton"></span></div></div>').join('')}</div><p class="app-subtle-note">A little breathing room is on its way.</p>`;
  } else if (s.loadState === 'error') {
    content = emptyState({ icon: 'refresh', eyebrow: 'LET’S TRY THAT AGAIN', title: 'Your day can wait a moment.', body: 'We couldn’t load your plans. Try again when you’re ready.', action: button('Try again', 'reload', { icon: 'refresh' }) });
  } else if (!s.plans.length) {
    content = emptyState({ icon: 'leaf', eyebrow: 'A FRESH PAGE', title: 'What would feel good today?', body: 'Start with one small thing. There’s no need to fill the whole day.', action: button('Add your first plan', 'create', { icon: 'plus' }) });
  } else {
    const remaining = s.plans.filter(plan => !plan.done);
    const sorted = [...s.plans].sort(s.sort === 'shortest' ? (a, b) => a.minutes - b.minutes : () => 0);
    content = `<div class="daylight-summary"><span class="daylight-summary-mark">${icon('leaf', 25)}</span><div><strong>${remaining.length ? `${remaining.reduce((sum, plan) => sum + plan.minutes, 0)} minutes, just for you` : 'A little more you, today'}</strong><span>${s.plans.filter(plan => plan.done).length} of ${s.plans.length} little plans complete</span></div><span class="daylight-summary-dot"></span></div><div class="daylight-section-label"><h2>Today's plans <span>${s.plans.length}</span></h2>${iconButton('Sort plans', 'sort-plans', 'sort')}</div><div class="daylight-plans">${sorted.map(planRow).join('')}</div><button type="button" class="daylight-add-plan" data-action="create">${icon('plus', 18)} Add a little plan</button><div class="daylight-bottom-note">${icon('sun', 15)} Small things make a good day.</div>`;
  }
  return `<div class="app-screen daylight-today"><div class="app-scroll">${todayHead()}${content}</div>${tabbar()}</div>`;
}

function renderCreate(s) {
  const saving = s.formStatus === 'saving';
  return `<div class="app-screen">${header('A little plan')}<form class="app-form app-scroll" data-submit="save-plan" novalidate><p class="app-eyebrow">MAKE IT YOURS</p><h1>Something<br><em>to look forward to.</em></h1><p class="app-intro">A small intention is a lovely place to start.</p><fieldset${saving ? ' disabled' : ''}>${field('What would you like to do?', 'draftTitle', s.draftTitle, { placeholder: 'e.g. Take the scenic route', error: s.formError })}<label class="app-field"><span>A little time</span><select name="draftMinutes" data-field="draftMinutes">${[10, 15, 20, 25, 30, 45, 60].map(minutes => `<option value="${minutes}"${String(s.draftMinutes) === String(minutes) ? ' selected' : ''}>${minutes} minutes</option>`).join('')}</select></label><label class="app-field"><span>A part of your day</span><select name="draftCategory" data-field="draftCategory">${categories.map(category => `<option${s.draftCategory === category ? ' selected' : ''}>${category}</option>`).join('')}</select></label></fieldset><div class="app-form-footer"><p class="app-subtle-note">Keep it simple. You can always start small.</p>${button(saving ? 'Adding your plan…' : 'Add to my day', null, { type: 'submit', disabled: saving, icon: saving ? undefined : 'plus' })}${saving ? '<p class="app-saving-status" role="status"><span class="app-spinner"></span> Making a little room</p>' : ''}</div></form></div>`;
}

function renderDetail(s) {
  const plan = selectedPlan(s);
  if (!plan) return renderToday({ ...s, plans: [] });
  return `<div class="app-screen">${header('Your little plan', { right: iconButton('Remove plan', 'remove-plan', 'trash') })}<div class="app-scroll daylight-detail"><div class="daylight-detail-art">${icon(categoryIcon(plan.category), 62)}<span class="detail-orbit"></span><span class="detail-dot"></span></div><p class="app-eyebrow">${escape(plan.category.toUpperCase())}</p><h1>${escape(plan.title)}</h1><span class="app-time-pill">${icon('clock', 15)} ${plan.minutes} minutes of your day</span><div class="daylight-intention"><span class="app-eyebrow">A GENTLE REMINDER</span><p>You don’t have to do it perfectly.<br>Just give yourself a little space.</p></div><div class="app-grow"></div>${button(plan.done ? 'Back to my day' : 'I did this', plan.done ? 'today' : 'complete-plan', { icon: plan.done ? 'arrow' : 'check' })}<p class="app-subtle-note">${plan.done ? 'A small promise, kept.' : 'Ready when you are. No timer, no pressure.'}</p></div></div>`;
}

function finishSave(ctx) {
  const s = ctx.state;
  if (s.route !== 'create' || s.formStatus !== 'saving') return;
  const id = `little-plan-${s.nextId}`;
  const plan = { id, title: s.draftTitle.trim(), category: s.draftCategory, minutes: Number(s.draftMinutes), done: false };
  // The runtime keeps the pre-save loading state for held Back/Reset inspection.
  ctx.set({ formStatus: 'ready' });
  ctx.go('detail', { plans: [...s.plans, plan], selectedId: id, nextId: s.nextId + 1, formStatus: 'ready' }, { replace: true });
  ctx.toast('A little plan, added to your day.');
}

const app = {
  identity: { id: 'daylight', name: 'Daylight', tagline: 'A little space, every day.', description: 'A fictional daily planning app. A small, complete example of screens, states, and connected interactions.', version: '1.0' },
  overview: {
    eyebrow: 'Fictional example',
    title: 'Make room for one small plan.',
    description: 'Explore a complete local journey from a first visit to a finished plan.',
    rationale: 'These are design hypotheses for a fictional app. No research results or production behavior are claimed.',
    approachTitle: 'Ideas to test',
    strategies: [
      '**One clear next step** could help someone choose a plan without filling a schedule.',
      '**Visible progress and useful feedback** could make waiting and recovery easier to understand.',
      '**A quiet completion** could encourage someone to return tomorrow.'
    ]
  },
  tokens: {
    light: { background: '#f8f8f1', surface: '#ffffff', ink: '#273c34', muted: '#69766e', border: '#e1e6dc', accent: '#315b49', accentSoft: '#e7eddf', onAccent: '#ffffff', danger: '#a3473e', warmth: '#e4b66b' },
    dark: { background: '#1c2923', surface: '#26372e', ink: '#eef1e7', muted: '#acb9af', border: '#3e5045', accent: '#bfd2a8', accentSoft: '#344a3c', onAccent: '#21362a', danger: '#eeaaa0', warmth: '#dcb371' },
  },
  library: {
    typography: [
      { name: 'Display', sample: 'A little lighter.', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '38px', fontWeight: 400 },
      { name: 'Gentle emphasis', sample: 'Small things make a good day.', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '15px', fontWeight: 400, fontStyle: 'italic' },
      { name: 'Body', sample: 'Make a little space for the things that make you feel good.', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '14px', fontWeight: 400 },
      { name: 'Eyebrow', sample: 'MAKE ROOM FOR YOU', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 650 },
    ],
    components: [
      { id: 'actions', name: 'Actions', description: 'Filled primary action and quiet secondary action.', render: () => `<div class="app-library-stack">${button('Add to my day', 'save-plan', { icon: 'plus' })}${button('Keep it for today', 'dismiss-overlay', { variant: 'secondary' })}</div>` },
      { id: 'plan-field', name: 'Plan name', description: 'A visible label, a helpful example, and space for a small intention.', render: s => field('What would you like to do?', 'draftTitle', s.draftTitle, { placeholder: 'e.g. Take the scenic route' }) },
      { id: 'plan-rows', name: 'Plan rows', description: 'The same row before and after a plan is complete.', render: s => `<div class="daylight-plans">${planRow(s.plans[0])}${planRow({ ...s.plans[1], done: true })}</div>` },
      { id: 'reminder', name: 'Reminder preference', description: 'A labeled switch for one optional daily nudge.', render: reminderRow },
    ],
  },
  freshState: () => ({ route: 'welcome', overlay: null, toast: null, loadState: 'ready', plans: samplePlans(), selectedId: 'morning-pages', draftTitle: '', draftMinutes: '15', draftCategory: 'Personal', formStatus: 'ready', formError: '', sort: 'planned', reminders: true, nextId: 1 }),
  backRoute: { create: 'today', detail: 'today', settings: 'today', complete: 'today', today: 'welcome' },
  SCREENS: {
    welcome: () => `<div class="app-screen daylight-welcome"><div class="daylight-welcome-brand">${icon('sun', 24)}<span>daylight</span></div>${sunArt()}<div class="daylight-welcome-copy"><p class="app-eyebrow">LESS RUSH. MORE ROOM.</p><h1>A day that<br>feels like <em>you.</em></h1><p>Make a little space for the things<br>that make you feel good.</p></div><div class="daylight-welcome-footer">${button('Find my daylight', 'start', { icon: 'arrow' })}<p>One small intention at a time.</p></div></div>`,
    today: renderToday,
    create: renderCreate,
    detail: renderDetail,
    complete: s => `<div class="app-screen daylight-complete"><div class="app-complete-close">${iconButton('Back to today', 'today', 'close')}</div><div class="daylight-complete-art"><span class="complete-ring ring-one"></span><span class="complete-ring ring-two"></span><div>${icon('check', 44)}</div><i></i><b></b></div><p class="app-eyebrow">A SMALL PROMISE, KEPT</p><h1>Look at you.<br><em>You made room.</em></h1><p class="app-intro">${escape(selectedPlan(s)?.title || 'Your little plan')} is done.<br>Let that be enough for a moment.</p><div class="daylight-complete-card">${icon('sun', 23)}<span>Good days are made of little things.</span></div><div class="app-grow"></div>${button('Back to my day', 'today', { icon: 'arrow' })}</div>`,
    settings: s => `<div class="app-screen">${header('Your space', { back: false })}<div class="app-scroll daylight-settings"><p class="app-eyebrow">A LITTLE PERSONAL</p><h1>At your<br><em>own pace.</em></h1><p class="app-intro">Keep the helpful things.<br>Leave room for everything else.</p><div class="daylight-setting-group">${reminderRow(s)}</div><p class="app-setting-note">This is a local sample preference. No notifications are scheduled.</p><div class="daylight-about">${icon('sun', 29)}<strong>daylight</strong><span>A little space, every day.</span><small>Fictional app · Local demo · v1.0</small></div></div>${tabbar('settings')}</div>`,
  },
  OVERLAYS: {
    sort: s => `<section class="app-sheet" role="dialog" aria-modal="true" aria-labelledby="sort-title"><div class="app-sheet-handle"></div><div class="app-overlay-title"><h2 id="sort-title">A little order</h2>${iconButton('Close sorting options', 'dismiss-overlay', 'close')}</div><p>Arrange today in a way that feels right.</p>${[['planned', 'As I planned it', 'The order you added your plans'], ['shortest', 'Smallest steps first', 'Start with the shortest plan']].map(([value, title, sub]) => `<button type="button" class="app-choice" data-action="set-sort" data-value="${value}" aria-pressed="${s.sort === value}"><span><strong>${title}</strong><small>${sub}</small></span><span class="app-choice-check">${s.sort === value ? icon('check', 16) : ''}</span></button>`).join('')}</section>`,
    remove: s => `<section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-title"><div class="app-dialog-symbol">${icon('leaf', 29)}</div><h2 id="remove-title">Make a little room?</h2><p>Remove “${escape(selectedPlan(s)?.title || 'this plan')}” from today? It’s okay to leave something for another day.</p>${button('Remove plan', 'confirm-remove', { variant: 'danger' })}${button('Keep it for today', 'dismiss-overlay', { variant: 'secondary' })}</section>`,
  },
  overlayContext: {
    sort: { title: 'Choose a plan order', kind: 'sheet', how: 'Open Sort plans from Today.', actions: ['set-sort', 'dismiss-overlay'], approach: 'Offer two ordering choices beside the plan list.', rationale: 'Let someone change the order without leaving their day.' },
    remove: { title: 'Confirm plan removal', kind: 'dialog', how: 'Choose Remove plan from a plan detail.', actions: ['confirm-remove', 'dismiss-overlay'], approach: 'Name the plan and ask before removing it.', rationale: 'Make the consequence clear and cancellation easy.' }
  },
  handlers: {
    start: ctx => ctx.go('today', { loadState: 'loading' }),
    today: ctx => ctx.go('today', { loadState: 'ready' }),
    reload: ctx => ctx.go('today', { loadState: 'loading' }),
    settings: ctx => ctx.go('settings'),
    create: ctx => ctx.go('create', { draftTitle: '', draftMinutes: '15', draftCategory: 'Personal', formError: '', formStatus: 'ready' }),
    'open-plan': (ctx, payload) => ctx.go('detail', { selectedId: payload.id }),
    'save-plan': (ctx, payload) => {
      if (ctx.state.formStatus === 'saving') return;
      const draftTitle = String(payload.draftTitle ?? ctx.state.draftTitle).trim();
      const draftMinutes = String(payload.draftMinutes ?? ctx.state.draftMinutes);
      const draftCategory = String(payload.draftCategory ?? ctx.state.draftCategory);
      if (!draftTitle) return ctx.set({ draftTitle, formError: 'Give your little plan a name.' });
      ctx.set({ draftTitle: draftTitle.slice(0, 64), draftMinutes: ['10', '15', '20', '25', '30', '45', '60'].includes(draftMinutes) ? draftMinutes : '15', draftCategory: categories.includes(draftCategory) ? draftCategory : 'Personal', formError: '', formStatus: 'saving' });
      ctx.advance(1200, () => finishSave(ctx));
    },
    'sort-plans': ctx => ctx.overlay('sort'),
    'set-sort': (ctx, payload) => { ctx.set({ sort: payload.value === 'shortest' ? 'shortest' : 'planned' }); ctx.overlay(null); },
    'remove-plan': ctx => ctx.overlay('remove'),
    'confirm-remove': ctx => { const plans = ctx.state.plans.filter(plan => plan.id !== ctx.state.selectedId); ctx.go('today', { plans, loadState: 'ready', selectedId: plans[0]?.id || null }, { replace: true }); },
    'complete-plan': ctx => { const plans = ctx.state.plans.map(plan => plan.id === ctx.state.selectedId ? { ...plan, done: true } : plan); ctx.go('complete', { plans }); },
    'toggle-reminders': ctx => ctx.set({ reminders: !ctx.state.reminders }),
  },
  ACTIONS: {
    start: { label: 'Find my daylight', description: 'Open today’s loading screen. It advances once per open prototype; Back or Reset restores loading for inspection.', to: 'today' },
    today: { label: 'Back to my day', description: 'Return to today with this preview session’s plans and completion state.', to: 'today' },
    reload: { label: 'Try again', description: 'Open simulated loading. Its first view in this open prototype reveals plans after 1.1 seconds; revisits hold for inspection.', to: 'today' },
    settings: { label: 'Settings', description: 'Open the local reminder preference.', to: 'settings' },
    create: { label: 'Add a little plan', description: 'Open a fresh form with a name, duration, and category.', to: 'create' },
    'open-plan': { label: 'Tap a plan', description: 'Open the tapped plan’s detail.', to: 'detail' },
    'save-plan': { label: 'Add to my day', description: 'Validate the name and open saving. Its first view completes after 1.2 seconds; Back or Reset restores the entered draft and holds saving.', to: 'detail' },
    'sort-plans': { label: 'Sort plans', description: 'Open the sorting sheet. Dismiss it to keep the current order.' },
    'set-sort': { label: 'Choose an order', description: 'Apply the selected order immediately and close the sheet.' },
    'remove-plan': { label: 'Remove plan', description: 'Open a confirmation dialog before removing the selected plan.' },
    'confirm-remove': { label: 'Confirm removal', description: 'Remove the selected plan and return to today. Removing the last plan reveals the empty state.', to: 'today' },
    'complete-plan': { label: 'I did this', description: 'Mark this plan complete and show a quiet celebration.', to: 'complete' },
    'toggle-reminders': { label: 'A gentle nudge', description: 'Toggle the sample preference for this session. No notification permission or service is used.' },
    back: { label: 'Back', description: 'Return to the previous route or loading checkpoint. Restored loading stays on screen without repeating a save.' },
    'dismiss-overlay': { label: 'Dismiss', description: 'Close the sheet or dialog and keep the current screen.' },
    'dismiss-toast': { label: 'Dismiss message', description: 'Close the confirmation toast. It also disappears after 3.5 seconds.' },
  },
  NAV: [
    { id: 'start', title: 'A softer start', description: 'An invitation, an everyday home, and the states around it.', cards: [
      { id: 'welcome', title: 'Welcome', route: 'welcome', kind: 'ready', status: 'Defined', setup: () => {}, match: on('welcome'), approach: "Offer one invitation into the sample day.", rationale: "Make the first useful step easy to choose.", how: 'First launch, before entering the example app.', notes: ['One invitation leads straight into the sample experience.', 'No account, remote assets, or network access.'], actions: ['start'] },
      { id: 'today-loading', title: 'Finding your day', route: 'today', kind: 'loading', status: 'Defined', setup: s => { s.loadState = 'loading'; }, match: on('today', s => s.loadState === 'loading'), approach: "Keep the day layout visible while sample plans load.", rationale: "Explain the wait without shifting the screen around.", how: 'Continue from welcome or retry after an error.', notes: ['The first view advances after 1.1 seconds while this prototype is open.', 'Reset/R, Back, and backward card browsing hold loading while its skeleton animation continues.', 'Close and reopen the prototype to replay the transition.'], actions: ['settings'] },
      { id: 'today-ready', title: 'Today, ready', route: 'today', kind: 'ready', status: 'Defined', setup: () => {}, match: on('today', s => s.loadState === 'ready' && s.plans.length > 0), approach: "Bring today’s plans and progress into one list.", rationale: "Help someone choose a small next action at a glance.", how: 'The simulated load finishes, or return from a plan.', notes: ['Every plan opens its own detail.', 'The summary counts unfinished minutes and completed plans.', 'Adding, completing, removing, and sorting persist within this preview.'], actions: ['open-plan', 'create', 'sort-plans', 'settings'] },
      { id: 'today-empty', title: 'A fresh page', route: 'today', kind: 'empty', status: 'New', setup: s => { s.plans = []; s.selectedId = null; }, match: on('today', s => s.loadState === 'ready' && s.plans.length === 0), approach: "Replace the empty list with an invitation to add a plan.", rationale: "Give a fresh day a useful starting point.", how: 'A day with no plans, or remove the final remaining plan.', notes: ['The invitation uses the same create flow as the ready state.', 'No blank summary or dead controls are shown.'], actions: ['create', 'settings'] },
      { id: 'today-error', title: 'A small interruption', route: 'today', kind: 'error', status: 'Proposed', setup: s => { s.loadState = 'error'; }, match: on('today', s => s.loadState === 'error'), approach: "Explain the failed load and offer a retry.", rationale: "Help someone recover without losing their place.", how: 'Open this card to simulate a failed load.', notes: ['This failure is a deliberate sample state; no real request runs.', 'Retry opens loading, which advances once per open prototype and holds on later visits.'], actions: ['reload', 'settings'] },
    ] },
    { id: 'plan', title: 'Make a little room', description: 'Turn an intention into a plan, with clear feedback along the way.', cards: [
      { id: 'create-ready', title: 'A new intention', route: 'create', kind: 'ready', status: 'Defined', setup: () => {}, match: on('create', s => s.formStatus === 'ready' && !s.formError), approach: "Collect a name, duration, and category in one form.", rationale: "Make a small intention concrete without a long setup.", how: 'Tap “Add a little plan” on today.', notes: ['Name, duration, and category are real local form controls.', 'Saving keeps the entered values and opens that new plan.', 'Back leaves the form; reopening create starts fresh.'], actions: ['save-plan', 'back'] },
      { id: 'create-invalid', title: 'A name is missing', route: 'create', kind: 'error', status: 'New', setup: s => { s.formError = 'Give your little plan a name.'; }, match: on('create', s => s.formStatus === 'ready' && !!s.formError), approach: "Place the missing-name message beside the field.", rationale: "Show exactly what to fix before trying again.", how: 'Submit the form with an empty or whitespace-only name.', notes: ['A field-level message explains how to continue.', 'Enter a name and submit again to recover.'], actions: ['save-plan', 'back'] },
      { id: 'create-saving', title: 'Making room', route: 'create', kind: 'loading', status: 'Defined', setup: s => { s.draftTitle = 'Make something small'; s.formStatus = 'saving'; }, match: on('create', s => s.formStatus === 'saving'), approach: "Keep the filled form visible during the simulated save.", rationale: "Acknowledge the action and prevent duplicate submissions.", how: 'Submit a valid plan.', notes: ['The first view completes after 1.2 seconds; fields and submit stay disabled while saving.', 'Back or Reset restores the pre-save draft and holds this state without adding another plan.', 'Navigation and closing cancel pending work; close and reopen the prototype to replay.'], actions: ['back'] },
      { id: 'plan-detail', title: 'Your little plan', route: 'detail', kind: 'ready', status: 'Defined', setup: () => {}, match: on('detail', s => !selectedPlan(s)?.done), approach: "Focus on one plan and its completion action.", rationale: "Make the next step clear while keeping removal available.", how: 'Tap an unfinished plan on today, or wait for the saved-plan toast to close.', notes: ['Title, duration, and category come from the selected plan.', 'Complete the plan or open its removal dialog.'], actions: ['complete-plan', 'remove-plan', 'back'] },
      { id: 'sort-sheet', title: 'A little order', route: 'today', kind: 'sheet', status: 'Proposed', setup: s => { s.overlay = 'sort'; }, match: s => s.route === 'today' && s.overlay === 'sort', approach: "Offer two ordering choices beside the plan list.", rationale: "Let someone change the order without leaving their day.", how: 'Tap the sort icon beside “Today’s plans.”', notes: ['Choose added order or shortest duration first.', 'A choice applies immediately and closes the sheet.', 'Dismiss or Escape leaves the current order unchanged.'], actions: ['set-sort', 'dismiss-overlay'] },
      { id: 'plan-saved', title: 'A plan, added', route: 'detail', kind: 'toast', status: 'New', setup: s => { s.plans.push({ id: 'new-plan', title: 'Make something small', category: 'Personal', minutes: 15, done: false }); s.selectedId = 'new-plan'; s.toast = 'A little plan, added to your day.'; }, match: s => s.route === 'detail' && !s.overlay && !!s.toast, approach: "Open the new plan with a brief confirmation.", rationale: "Confirm the save where its result can be checked.", how: 'A valid plan finishes saving.', notes: ['A confirmation appears over the new plan detail.', 'The toast can be dismissed and automatically clears after 3.5 seconds.', 'After a simulated save, Back or Reset restores and holds the pre-save loading checkpoint, including the original draft.'], actions: ['dismiss-toast', 'complete-plan', 'remove-plan', 'back'] },
    ] },
    { id: 'finish', title: 'Keep it gentle', description: 'Celebrate a little progress, change your mind, and set your pace.', cards: [
      { id: 'plan-complete', title: 'A small promise, kept', route: 'complete', kind: 'success', status: 'New', setup: s => { s.plans[0].done = true; }, match: on('complete'), approach: "Acknowledge the completed plan and offer a return to today.", rationale: "Recognize progress without interrupting the rest of the day.", how: 'Tap “I did this” on an unfinished plan.', notes: ['Completion updates the selected plan, once.', 'Return to today to see its checkmark and updated summary.'], actions: ['today'] },
      { id: 'plan-done', title: 'A plan, fulfilled', route: 'detail', kind: 'success', status: 'Defined', setup: s => { s.plans[0].done = true; }, match: on('detail', s => !!selectedPlan(s)?.done), approach: "Keep the completed plan readable with a return action.", rationale: "Preserve useful detail and avoid counting completion twice.", how: 'Open a checked-off plan from today.', notes: ['The plan stays available after completion.', 'The main action returns to today, so completion cannot be counted twice.', 'The removal dialog is still available.'], actions: ['today', 'remove-plan', 'back'] },
      { id: 'remove-dialog', title: 'Room to change your mind', route: 'detail', kind: 'dialog', status: 'Defined', setup: s => { s.overlay = 'remove'; }, match: s => s.route === 'detail' && s.overlay === 'remove', approach: "Name the plan and ask before removing it.", rationale: "Make the consequence clear and cancellation easy.", how: 'Tap the remove icon in plan detail.', notes: ['The selected plan is named in the confirmation.', 'Cancel keeps everything; confirm returns to today.', 'Removing the final plan produces the empty state.'], actions: ['confirm-remove', 'dismiss-overlay'] },
      { id: 'settings', title: 'At your own pace', route: 'settings', kind: 'ready', status: 'Proposed', setup: () => {}, match: on('settings'), approach: "Offer one local reminder preference.", rationale: "Keep the choice simple and explicit about its simulated effect.", how: 'Tap Settings in the bottom navigation.', notes: ['The switch is a local, session-only preference.', 'No notification permission is requested and no reminder is scheduled.', 'Preview appearance is controlled by the App appearance selector.'], actions: ['toggle-reminders', 'today'] },
    ] },
  ],
  FLOWS: [
    { title: 'Begin a day', steps: [{ card: 'welcome', label: 'Find my daylight' }, { card: 'today-loading', label: '1.1 seconds · first view' }, { card: 'today-ready', label: '' }] },
    { title: 'Create a plan', steps: [{ card: 'today-ready', label: 'Add a plan' }, { card: 'create-ready', label: 'Submit a name' }, { card: 'create-saving', label: '1.2 seconds · first view' }, { card: 'plan-saved', label: 'Dismiss / 3.5 seconds' }, { card: 'plan-detail', label: '' }] },
    { title: 'Make progress', steps: [{ card: 'today-ready', label: 'Open a plan' }, { card: 'plan-detail', label: 'I did this' }, { card: 'plan-complete', label: 'Back to my day' }, { card: 'today-ready', label: 'Open completed plan' }, { card: 'plan-done', label: '' }] },
    { title: 'Recover from a missing name', steps: [{ card: 'create-ready', label: 'Submit empty' }, { card: 'create-invalid', label: 'Enter a name + submit' }, { card: 'create-saving', label: '' }] },
    { title: 'Recover a failed load', steps: [{ card: 'today-error', label: 'Try again' }, { card: 'today-loading', label: '1.1 seconds · first view' }, { card: 'today-ready', label: '' }] },
    { title: 'Change your day', steps: [{ card: 'plan-detail', label: 'Remove icon' }, { card: 'remove-dialog', label: 'Confirm removal' }, { card: 'today-ready', label: 'Remove every remaining plan' }, { card: 'today-empty', label: 'Add your first plan' }, { card: 'create-ready', label: '' }] },
    { title: 'Choose your pace', steps: [{ card: 'today-ready', label: 'Sort icon' }, { card: 'sort-sheet', label: 'Choose order' }, { card: 'today-ready', label: 'Settings tab' }, { card: 'settings', label: 'Today tab' }, { card: 'today-ready', label: '' }] },
  ],
  onEnter(ctx) {
    if (ctx.state.route === 'today' && ctx.state.loadState === 'loading') ctx.advance(1100, () => ctx.set({ loadState: 'ready' }));
    if (ctx.state.route === 'create' && ctx.state.formStatus === 'saving') ctx.advance(1200, () => finishSave(ctx));
  },
};

export default app;
