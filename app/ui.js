// Small, app-neutral HTML helpers. Escape any text originating in state or input.
export function escape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  leaf: '<path d="M19 4C8 3 3 8 5 15c2 6 12 6 14-11Z"/><path d="M4 21 15 10"/>',
  book: '<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v15"/>',
  pencil: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15l-1 6Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-.6 2-2 .9-1.9-.5-2 3.4 1.5 1.5v2.4l-1.5 1.5 2 3.4 2-.5 2 .9.5 2h4l.6-2 2-.9 1.9.5 2-3.4-1.5-1.5v-2.4l1.5-1.5-2-3.4-2 .5-2-.9L13 3Z"/>',
  sort: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
  alert: '<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sun}</svg>`;
}

export function button(label, action, { variant = 'primary', icon: iconName, value, id, disabled = false, type = 'button' } = {}) {
  return `<button type="${type}" class="app-button app-button-${escape(variant)}"${action ? ` data-action="${escape(action)}"` : ''}${value === undefined ? '' : ` data-value="${escape(value)}"`}${id === undefined ? '' : ` data-id="${escape(id)}"`}${disabled ? ' disabled' : ''}>${iconName ? icon(iconName) : ''}<span>${escape(label)}</span></button>`;
}

export function iconButton(label, action, iconName, extra = '') {
  return `<button type="button" class="app-icon-button" aria-label="${escape(label)}" data-action="${escape(action)}" ${extra}>${icon(iconName)}</button>`;
}

export function header(title, { back = true, right = '' } = {}) {
  return `<header class="app-header">${back ? iconButton('Go back', 'back', 'back') : '<span class="app-header-spacer"></span>'}<span>${escape(title)}</span>${right || '<span class="app-header-spacer"></span>'}</header>`;
}

export function emptyState({ icon: iconName = 'sun', eyebrow = '', title, body, action = '' }) {
  return `<div class="app-empty"><div class="app-empty-symbol">${icon(iconName, 32)}</div>${eyebrow ? `<p class="app-eyebrow">${escape(eyebrow)}</p>` : ''}<h2>${escape(title)}</h2><p>${escape(body)}</p>${action}</div>`;
}

export function field(label, name, value, { placeholder = '', error = '', type = 'text', maxlength = 64 } = {}) {
  return `<label class="app-field"><span>${escape(label)}</span><input name="${escape(name)}" data-field="${escape(name)}" type="${escape(type)}" value="${escape(value)}" placeholder="${escape(placeholder)}" maxlength="${maxlength}"${error ? ' aria-invalid="true" aria-describedby="field-error"' : ''}>${error ? `<small id="field-error" class="app-field-error">${escape(error)}</small>` : ''}</label>`;
}
