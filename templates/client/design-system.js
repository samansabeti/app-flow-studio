// The client's design system, inferred from the Existing screenshots. Claude writes this after drafting
// Existing; until then status is 'pending' and the Design library shows a loading state and polls for it.
// Schema (every evidence item points at a real screen: { card: 'existing-card-id', box: [left%, top%, width%, height%] }):
//   status: 'pending' | 'ready', name, summary, basis: { source, screens, captured, method }, principles: [{ title, text }]
//   colors: [{ group, items: [{ name, hex: '#rrggbb', role, usage, evidence: [] }] }]   sample hex values from pixels
//   typography: [{ name, family, fallback, size (pt), weight, lineHeight, tracking, sample, usage, evidence: [] }]
//   spacing: { note, scale: [{ value, usage }] }, radii: [{ name, value, usage }], elevation: [{ name, value (CSS shadow), usage }]
//   components: [{ name, description, specs: { label: value }, variants: [], evidence: [] }]
//   iconography: { style, notes: [], evidence: [] }, voice: { tone, patterns: [], examples: [] }
//   tokens: { light: { background, surface, ink, muted, border, accent, accentSoft, onAccent, danger, fontBody, fontDisplay, radiusButton }, dark?: {...} }
// tokens feed the Future design state. Measure, don't guess: say "inferred" where a value is a judgment.
export default {
  status: 'pending',
  evidenceState: 'existing',
};
