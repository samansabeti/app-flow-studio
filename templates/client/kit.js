// Component kit for Future screens: navigation bar, tab bar, buttons, rows, cards and sheets rebuilt from
// the measurements in design-system.js (its `kit` section), so proposals look like the client's product.
// Everything here is pure: each helper returns markup and never touches state. Styles are in kit.css.
//
//   import designSystem from './design-system.js';
//   import existing from './existing.js';
//   const kit = createKit(designSystem, existing);
//   `<div class="app-screen client-future" style="${kit.vars()}">${kit.navBar({ title: 'Trips' })}…</div>`
//
// Text options (title, label, subtitle, value) are escaped here. `body` and `footer` are markup you build
// yourself: escape any dynamic text in them. Until the design system is ready, or for a component it has no
// measurements for, the kit falls back to neutral defaults; the Design library shows which are measured.
// Icons are unedited crops of captured screens (design-system.js kit.icons). An icon that was never
// captured renders as a dashed placeholder next to its label: never draw one that was not captured.

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOKENS = ['background', 'surface', 'ink', 'muted', 'border', 'accent', 'accentSoft', 'onAccent', 'danger'];
const dash = name => name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
const px = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value}px` : null;
const color = value => TOKENS.includes(value) ? `var(--app-${dash(value)})` : /^#[0-9a-f]{6}$/i.test(value || '') ? value : null;
const weight = value => Number.isInteger(value) && value >= 100 && value <= 900 ? String(value) : null;
const choice = (...allowed) => value => allowed.includes(value) ? value : null;
const flag = value => typeof value === 'boolean' ? (value ? '1' : '0') : null;
const shadow = value => typeof value === 'string' && /^[\w\s.,()%#/-]+$/.test(value) ? value : null;

// Which measurements each component accepts and how they become CSS custom properties (--kit-<part>-<field>).
export const KIT_FIELDS = {
  navBar: { height: px, paddingX: px, titleSize: px, titleWeight: weight, titleAlign: choice('center', 'left'), background: color, border: flag },
  tabBar: { height: px, labelSize: px, labelWeight: weight, iconSize: px, background: color, border: flag, active: color, inactive: color },
  button: { height: px, radius: px, fontSize: px, fontWeight: weight, paddingX: px, secondary: choice('outline', 'tint', 'plain') },
  row: { minHeight: px, paddingX: px, titleSize: px, titleWeight: weight, subtitleSize: px, background: color, divider: choice('inset', 'full', 'none'), chevron: flag },
  card: { radius: px, padding: px, background: color, border: flag, shadow },
  sheet: { radius: px, padding: px, background: color, grabber: flag, titleSize: px, titleWeight: weight },
};

export function createKit(designSystem, evidenceModule) {
  const spec = (designSystem?.status === 'ready' && designSystem.kit) || {};
  const part = name => (spec[name] && typeof spec[name] === 'object' ? spec[name] : {});
  const on = (name, field, fallback) => typeof part(name)[field] === 'boolean' ? part(name)[field] : fallback;
  const pick = (name, field, fallback) => KIT_FIELDS[name][field](part(name)[field]) ?? fallback;

  // Inline custom properties for a screen root (or a Design library specimen). Only measured values are set.
  function vars() {
    const out = [];
    for (const [name, fields] of Object.entries(KIT_FIELDS)) for (const [field, read] of Object.entries(fields)) {
      const value = read(part(name)[field]);
      if (value !== null && !['0', '1'].includes(value) && !['titleAlign', 'secondary', 'divider'].includes(field)) out.push(`--kit-${dash(name)}-${dash(field)}:${value}`);
    }
    return esc(out.join(';'));
  }

  // A captured screen's image, read from the evidence module's own markup so crops stay unedited pixels.
  const shots = new Map();
  function shot(cardId) {
    if (shots.has(cardId)) return shots.get(cardId);
    let found = null;
    try {
      const card = (evidenceModule?.NAV || []).flatMap(board => board.cards).find(item => item.id === cardId);
      const state = { ...evidenceModule.freshState(), route: card.route };
      card.setup?.(state);
      const tag = evidenceModule.SCREENS[card.route](state).match(/<img\b[^>]*>/)?.[0] || '';
      const attr = key => tag.match(new RegExp(`\\s${key}="([^"]*)"`))?.[1];
      const src = attr('src'), width = Number(attr('width')), height = Number(attr('height'));
      if (/^\.\/[\w./-]+\.(?:png|jpe?g|webp)$/i.test(src || '') && width > 0 && height > 0) found = { src, width, height };
    } catch { /* not captured */ }
    shots.set(cardId, found);
    return found;
  }
  const hasIcon = name => Boolean(spec.icons?.[name] && shot(spec.icons[name].card));
  function icon(name, size = 24) {
    const entry = spec.icons?.[name], image = entry && shot(entry.card);
    if (!image || !Array.isArray(entry.box)) return `<span class="kit-icon kit-icon-missing" aria-hidden="true" style="width:${size}px;height:${size}px"></span>`;
    const [left, top, w, h] = entry.box;
    const ratio = (h * image.height) / (w * image.width);
    const at = (start, span) => span >= 100 ? 0 : start / (100 - span) * 100;
    return `<span class="kit-icon" aria-hidden="true" style="width:${size}px;height:${Math.round(size * ratio * 100) / 100}px;background-image:url('${esc(image.src)}');background-size:${10000 / w}% ${10000 / h}%;background-position:${at(left, w)}% ${at(top, h)}%"></span>`;
  }

  const act = item => item?.submit ? `type="submit"` : `type="button"${item?.action ? ` data-action="${esc(item.action)}"` : ''}`;
  // A bar control shows its captured icon when there is one, otherwise its text label.
  const barControl = (item, side) => item ? `<button ${act(item)} class="kit-nav-control" data-side="${side}"${hasIcon(item.icon) ? ` aria-label="${esc(item.label)}">${icon(item.icon, 22)}` : `>${esc(item.label)}`}</button>` : `<span class="kit-nav-control" data-side="${side}"></span>`;

  // navBar({ title, back?: true | { label, action, icon }, trailing?: { label, action, icon } })
  function navBar({ title = '', back, trailing } = {}) {
    const leading = back === true ? { label: 'Back', action: 'back', icon: 'back' } : back;
    return `<header class="kit-nav" data-align="${pick('navBar', 'titleAlign', 'center')}"${on('navBar', 'border', true) ? ' data-border' : ''}>${barControl(leading, 'leading')}<h1 class="kit-nav-title">${esc(title)}</h1>${barControl(trailing, 'trailing')}</header>`;
  }

  // tabBar({ label?, items: [{ label, action, icon?, activeIcon?, active? }] })
  function tabBar({ label = 'Tabs', items = [] } = {}) {
    const size = part('tabBar').iconSize > 0 ? part('tabBar').iconSize : 24;
    return `<nav class="kit-tabs" aria-label="${esc(label)}"${on('tabBar', 'border', true) ? ' data-border' : ''}>${items.map(item => `<button ${act(item)} class="kit-tab"${item.active ? ' aria-current="page"' : ''}>${icon(item.active && hasIcon(item.activeIcon) ? item.activeIcon : item.icon, size)}<span>${esc(item.label)}</span></button>`).join('')}</nav>`;
  }

  // button({ label, action, variant?: 'primary' | 'secondary' | 'destructive', disabled?, submit? })
  function button({ label = '', action, variant = 'primary', disabled, submit } = {}) {
    const kind = ['primary', 'secondary', 'destructive'].includes(variant) ? variant : 'primary';
    return `<button ${act({ action, submit })} class="kit-button" data-variant="${kind}"${kind === 'secondary' ? ` data-style="${pick('button', 'secondary', 'tint')}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  }

  // row({ title, subtitle?, value?, icon?, action?, chevron? }); with an action the whole row is one button.
  function row({ title = '', subtitle, value, icon: name, action, chevron } = {}) {
    const showChevron = chevron ?? (Boolean(action) && on('row', 'chevron', false));
    const body = `${name ? icon(name, 28) : ''}<span class="kit-row-text"><span class="kit-row-title">${esc(title)}</span>${subtitle ? `<span class="kit-row-subtitle">${esc(subtitle)}</span>` : ''}</span>${value ? `<span class="kit-row-value">${esc(value)}</span>` : ''}${showChevron ? '<span class="kit-chevron" aria-hidden="true"></span>' : ''}`;
    return action ? `<button type="button" class="kit-row" data-action="${esc(action)}">${body}</button>` : `<div class="kit-row">${body}</div>`;
  }
  // list([row options | row markup], { header? })
  function list(rows = [], { header } = {}) {
    return `<section class="kit-list" data-divider="${pick('row', 'divider', 'inset')}">${header ? `<h2 class="kit-list-header">${esc(header)}</h2>` : ''}<div class="kit-list-rows">${rows.map(item => typeof item === 'string' ? item : row(item)).join('')}</div></section>`;
  }

  // card({ title?, body?: markup, footer?: markup })
  function card({ title, body = '', footer = '' } = {}) {
    return `<section class="kit-card"${on('card', 'border', true) ? ' data-border' : ''}>${title ? `<h2 class="kit-card-title">${esc(title)}</h2>` : ''}${body}${footer ? `<div class="kit-card-footer">${footer}</div>` : ''}</section>`;
  }

  // sheet({ title, body?: markup, actions?: markup }) for an OVERLAYS renderer; the studio adds the scrim.
  function sheet({ title = '', body = '', actions = '' } = {}) {
    return `<div class="kit-sheet app-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${vars()}">${on('sheet', 'grabber', true) ? '<span class="kit-grabber" aria-hidden="true"></span>' : ''}${title ? `<h2 class="kit-sheet-title">${esc(title)}</h2>` : ''}${body}${actions ? `<div class="kit-sheet-actions">${actions}</div>` : ''}</div>`;
  }

  // measured('navBar') tells a screen (or a reviewer) whether a component is backed by evidence.
  const measured = name => Array.isArray(part(name).evidence) && part(name).evidence.length > 0;
  return { vars, icon, hasIcon, navBar, tabBar, button, row, list, card, sheet, measured };
}
