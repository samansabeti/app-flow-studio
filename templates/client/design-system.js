// The client's design system, inferred from the Existing screenshots. Claude writes this after drafting
// Existing; until then status is 'pending' and the Design library shows a loading state and polls for it.
// Schema (every evidence item points at a real screen: { card: 'existing-card-id', box: [left%, top%, width%, height%] }):
//   status: 'pending' | 'ready', name, summary, basis: { source, screens, captured, method }, principles: [{ title, text }]
//   colors: [{ group, items: [{ name, hex: '#rrggbb', role, usage, evidence: [] }] }]   sample hex values from pixels
//   typography: [{ name, family, fallback, size (pt), weight, lineHeight, tracking, sample, usage, evidence: [] }]
//   spacing: { note, scale: [{ value, usage }] }, radii: [{ name, value, usage }], elevation: [{ name, value (CSS shadow), usage }]
//   components: [{ name, description, specs: { label: value }, variants: [], evidence: [] }]
//   iconography: { style, notes: [], evidence: [] }, voice: { tone, patterns: [], examples: [] }
//   fonts: [{ family, src: './apps/assets/fonts/<file>.woff2', weight, style }]   font files the app ships (see npm run scan-fonts); keep the license file alongside
//   tokens: { light: { background, surface, ink, muted, border, accent, accentSoft, onAccent, danger, fontBody, fontDisplay, radiusButton }, dark?: {...} }
//   kit: measured specs that apps/kit.js rebuilds as Future components. Sizes are points; a color is a token name ('surface') or '#rrggbb'.
//     Include only components that were captured: each one needs evidence, and the Design library shows the crop beside the rebuild.
//     navBar: { height, paddingX, titleSize, titleWeight, titleAlign: 'center' | 'left', background, border: true | false, evidence: [] }
//     tabBar: { height, labelSize, labelWeight, iconSize, background, border, active, inactive, evidence: [] }
//     button: { height, radius, fontSize, fontWeight, paddingX, secondary: 'outline' | 'tint' | 'plain', evidence: [] }
//     row:    { minHeight, paddingX, titleSize, titleWeight, subtitleSize, background, divider: 'inset' | 'full' | 'none', chevron, evidence: [] }
//     card:   { radius, padding, background, border, shadow (CSS box-shadow), evidence: [] }
//     sheet:  { radius, padding, background, grabber, titleSize, titleWeight, evidence: [] }
//     Any component may add note: '…' for a judgment call a reviewer should know about.
//     icons:  { name: { card, box } }   unedited crops of captured icons, one entry per captured appearance (for example home, homeActive)
// tokens and kit feed the Future design state. Measure, don't guess: say "inferred" where a value is a judgment.
export default {
  status: 'pending',
  evidenceState: 'existing',
};
