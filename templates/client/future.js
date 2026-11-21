// The instance generator replaces these JSON-quoted identity sentinels.
import designSystem from './design-system.js';
import existing from './existing.js';
import { createKit } from './kit.js';
const APP_ID = "__APP_ID__";
const APP_NAME = "__APP_NAME__";
const FONT = (designSystem?.status === 'ready' && designSystem.tokens?.light?.fontBody) || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
// Once the client's design system is inferred, Future uses its tokens (colors, fonts, button radius).
const DS_TOKENS = designSystem?.status === 'ready' ? designSystem.tokens : null;
const FUTURE_TOKENS = DS_TOKENS?.light ? DS_TOKENS : {
  light:{background:'#f7f8fc',surface:'#ffffff',ink:'#18243a',muted:'#667188',border:'#dce2ed',accent:'#2857c5',accentSoft:'#e6edfc',onAccent:'#ffffff',danger:'#b84040'},
  dark:{background:'#141d2d',surface:'#1e2b40',ink:'#f0f4ff',muted:'#a7b5ce',border:'#364662',accent:'#a8c4ff',accentSoft:'#2a3b5c',onAccent:'#152341',danger:'#f0a1a1'}
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The component kit rebuilds the client's own nav, tab bar, buttons, rows, cards and sheets from the measured
// design system; compose Future screens from it (see kit.js) so proposals look like the product.
const kit = createKit(designSystem, existing);
const primary = (action,label) => kit.button({ action, label });
const outcome = () => kit.card({ body:`<span class="proposal-label">Draft outcome</span><strong class="proposal-strong">Describe the useful result.</strong><p>What should be different after the user takes this step?</p>` });
const shell = (bar,content,footer) => `<div class="app-screen client-future" style="${kit.vars()}">${bar}${content}<div class="proposal-footer">${footer}</div></div>`;
const specimen = html => `<div class="proposal-specimen" style="${kit.vars()}">${html}</div>`;

export default {
  identity:{id:APP_ID,name:APP_NAME,tagline:'One useful journey.',description:'An editable Future proposal scaffold with placeholder screens and local interactions.',version:'Proposal scaffold'},
  overview:{
    eyebrow:'Future · Draft',
    title:'Define one useful outcome.',
    description:'Replace this scaffold with a proposal that reviewers can try.',
    rationale:'These are editable design prompts, not approved requirements or observed behavior.',
    strategies:['**Start small** with one complete journey.','**Explain the limits** wherever an outcome is not built.']
  },
  tokens:FUTURE_TOKENS,
  ...(DS_TOKENS && !DS_TOKENS.dark ? { appearances:['light'] } : {}),
  previewLabel:'Future · Proposal scaffold',
  freshState:()=>({route:'future-start',overlay:null,toast:null}),
  SCREENS:{
    'future-start':()=>shell(kit.navBar({ title:APP_NAME }),`<main class="proposal-main app-scroll"><span class="proposal-label">Draft journey</span><h2>Your primary action.</h2><p>Define the task your user came here to complete.</p>${outcome()}</main>`,primary('preview-outcome','Preview outcome')),
    'future-result':()=>shell(kit.navBar({ title:'Outcome', back:true }),`<main class="proposal-main app-scroll"><span class="proposal-label">Proposed destination</span><h2>An outcome to design.</h2><p>Replace this placeholder with clear confirmation and the next useful step.</p><div class="proposal-note">This draft is ready for your product decisions.</div></main>`,primary('try-feedback','Try feedback'))
  },
  OVERLAYS:{},
  handlers:{
    'preview-outcome':ctx=>ctx.go('future-result'),
    'try-feedback':ctx=>ctx.toast('This outcome is not built yet. Use Back to explore the draft; nothing is saved.', 5000)
  },
  ACTIONS:{
    'preview-outcome':{label:'Preview outcome',description:'Navigate to the proposed destination placeholder.',to:'future-result'},
    'try-feedback':{label:'Try feedback',description:'Explain that this outcome is not built and offer Back as the next useful step. Nothing is saved.'},
    back:{label:'Back',description:'Return to the draft starting screen.'},
    'dismiss-toast':{label:'Dismiss feedback',description:'Hide the local example toast.'}
  },
  backRoute:{'future-start':'future-start','future-result':'future-start'},
  NAV:[{id:'future-proposal',title:'Future · First proposal',description:'Start with one complete journey. These placeholders do not represent approved product requirements.',cards:[
    {id:'future-start',title:'Draft start',route:'future-start',kind:'ready',status:'Proposed',setup:()=>{},match:s=>s.route==='future-start',how:'Open the Future workspace.',approach:'Frame the user’s task around one proposed primary action.',rationale:'A focused starting point makes the intended outcome easier to assess.',actions:['preview-outcome']},
    {id:'future-result',title:'Draft outcome',route:'future-result',kind:'ready',status:'Proposed',setup:()=>{},match:s=>s.route==='future-result',how:'Choose Preview outcome or open this card directly.',approach:'Show the proposed result and explain which behavior remains unbuilt.',rationale:'Clear feedback gives reviewers a useful next step without implying a completed product operation.',actions:['back','try-feedback']}
  ]}],
  FLOWS:[{title:'First proposal · Placeholder journey',steps:[{card:'future-start',label:'Preview outcome'},{card:'future-result',label:'Try feedback'}]}],
  library:{paletteNote:'Editable proposal placeholders. Replace these with the intended product design system.',typography:[
    {name:'Proposal heading',sample:'One useful journey.',fontFamily:FONT,fontSize:32,fontWeight:600},
    {name:'Proposal body',sample:'Give every action a useful result.',fontFamily:FONT,fontSize:14,fontWeight:400}
  ],components:[
    // Each `kit` id pairs this rebuilt specimen with its evidence crop in the Design library.
    {id:'kit-nav-bar',kit:'navBar',name:'Navigation bar',render:()=>specimen(kit.navBar({ title:'Screen title', back:true }))},
    {id:'kit-tab-bar',kit:'tabBar',name:'Tab bar',render:()=>specimen(kit.tabBar({ items:[{ label:'First', active:true },{ label:'Second' },{ label:'Third' }] }))},
    {id:'kit-button',kit:'button',name:'Buttons',render:()=>specimen(`<div class="proposal-stack">${kit.button({ label:'Primary action' })}${kit.button({ label:'Secondary action', variant:'secondary' })}</div>`)},
    {id:'kit-row',kit:'row',name:'List rows',render:()=>specimen(kit.list([{ title:'Row title', subtitle:'Supporting detail', action:'preview-outcome' },{ title:'Row title', value:'Value' }]))},
    {id:'kit-card',kit:'card',name:'Card',render:()=>specimen(outcome())},
    {id:'kit-sheet',kit:'sheet',name:'Sheet',render:()=>specimen(kit.sheet({ title:'Sheet title', body:'<p>Supporting copy for the decision.</p>', actions:kit.button({ label:'Confirm' }) }))}
  ]}
};
