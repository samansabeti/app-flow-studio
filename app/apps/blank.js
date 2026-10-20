// Your smallest starting point: two screens, two actions, one documented flow.
// Keep screen renderers pure. Change state only inside handlers or onEnter.
const primary = (action, label) => `<button type="button" class="app-button app-button-primary" data-action="${action}">${label}</button>`;
const example = () => '<div class="blank-example"><span class="blank-example-icon">↗</span><div><strong>Your first flow</strong><p>Two screens. One clear next step.</p></div></div>';
const note = () => '<div class="blank-note"><span class="blank-note-dot"></span><strong>Start with the important part</strong><p>Replace this screen with the smallest useful action in your new app.</p></div>';

export default {
  identity: {
    id: 'blank', name: 'Blank app', tagline: 'Your next idea starts here.',
    description: 'A minimal two-screen starting point. Replace the sample copy with your app brief.',
    version: '1.0'
  },
  overview: {
    eyebrow: 'Starter example',
    title: 'Start with one useful journey.',
    description: 'Two editable screens and local feedback are enough to begin.',
    strategies: ['**Choose one outcome**, then give each action a clear result.']
  },
  tokens: {
    light: {
      background: '#f7f7f2', surface: '#ffffff', ink: '#182c25', muted: '#77817b',
      border: '#e0e5df', accent: '#27745a', accentSoft: '#e3efe8', onAccent: '#ffffff', danger: '#b34343'
    },
    dark: {
      background: '#14221c', surface: '#1e3027', ink: '#f1f6ef', muted: '#a2b3a8',
      border: '#344b3c', accent: '#a8d9ba', accentSoft: '#2b4635', onAccent: '#163121', danger: '#f3a8a0'
    }
  },
  library: {
    typography: [
      { name: 'Display', sample: 'Make room for what’s next.', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '35px', fontWeight: 550 },
      { name: 'Body', sample: 'Start with one useful journey. Give every screen a purpose.', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '14px', fontWeight: 400 },
      { name: 'Label', sample: 'YOUR FIRST DESTINATION', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '9px', fontWeight: 650 },
    ],
    components: [
      { id: 'primary-action', name: 'Primary action', description: 'A clear next step with a simple directional cue.', render: () => primary('open-detail', 'Explore the next screen <span aria-hidden="true">↗</span>') },
      { id: 'example-card', name: 'Example card', description: 'A compact icon, title, and one supporting sentence.', render: example },
      { id: 'supporting-note', name: 'Supporting note', description: 'A quiet surface for helpful context.', render: note },
    ],
  },
  freshState: () => ({ route: 'home', overlay: null, toast: null }),
  SCREENS: {
    home: () => `<div class="app-screen blank-screen">
      <div class="blank-wordmark"><span class="blank-logo">✳</span> YOUR APP</div>
      <div class="blank-hero"><div class="blank-kicker">A LITTLE SPACE FOR A BIG IDEA</div>
        <h1>Make room<br>for what’s next.</h1>
        <p>Start with one useful journey. Give every screen a purpose, every action a result.</p>
      </div>
      ${example()}
      <div class="blank-bottom">${primary('open-detail', 'Explore the next screen <span aria-hidden="true">↗</span>')}<p>Local prototype · simulated content</p></div>
    </div>`,
    detail: () => `<div class="app-screen blank-screen">
      <button class="blank-back" data-action="back" aria-label="Go back">← Back</button>
      <div class="blank-hero"><div class="blank-kicker">YOUR FIRST DESTINATION</div>
        <h1>A small step.<br>A working flow.</h1>
        <p>This is a real prototype action. The next button shows feedback without leaving the screen.</p>
      </div>
      ${note()}
      <div class="blank-bottom">${primary('show-feedback', 'Try an action <span aria-hidden="true">✓</span>')}<p>No account, network request, or saved data.</p></div>
    </div>`
  },
  OVERLAYS: {},
  handlers: {
    'open-detail': ctx => ctx.go('detail'),
    'show-feedback': ctx => ctx.toast('Your first action works. Make it your own.', 3500)
  },
  ACTIONS: {
    'open-detail': { label: 'Explore the next screen', description: 'Navigate from the starting screen to the detail screen.', to: 'detail' },
    'show-feedback': { label: 'Try an action', description: 'Show a local confirmation toast for 3.5 seconds. Stay on this screen.' },
    back: { label: 'Back', description: 'Return to the previous app screen.' },
    'dismiss-toast': { label: 'Dismiss feedback', description: 'Close the temporary confirmation message immediately.' }
  },
  NAV: [{
    id: 'first-flow', title: 'Your first flow', description: 'A minimal starting point you can replace without removing a large demo.',
    cards: [
      { id: 'blank-home', title: 'Start', route: 'home', kind: 'ready', status: 'new',
        setup: state => { state.route = 'home'; }, match: state => state.route === 'home',
        how: 'Open this card or reset the prototype.',
        approach: 'Introduce one journey with a single next step.',
        rationale: 'Keep the starting point easy to understand and replace.',
        notes: ['Replace this introduction with the first screen of your app.', 'The main button opens the detail route.'],
        actions: ['open-detail'] },
      { id: 'blank-detail', title: 'First destination', route: 'detail', kind: 'ready', status: 'proposed',
        setup: state => { state.route = 'detail'; }, match: state => state.route === 'detail',
        how: 'Tap Explore the next screen on Start, or open this card directly.',
        approach: 'Show local feedback without leaving the destination.',
        rationale: 'Make the result of a tap visible before adding more screens.',
        notes: ['Try an action shows a temporary confirmation toast.', 'Back returns to Start; no data is persisted.'],
        actions: ['show-feedback', 'back'] }
    ]
  }],
  FLOWS: [{ title: 'Your first journey', steps: [
    { card: 'blank-home', label: 'Explore the next screen' },
    { card: 'blank-detail', label: 'Try an action to show feedback' }
  ] }]
};
