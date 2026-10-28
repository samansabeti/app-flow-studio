// The instance generator replaces these JSON-quoted identity sentinels.
import designSystem from './design-system.js';
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
const primary = (action,label) => `<button type="button" class="proposal-button" data-action="${action}">${label}</button>`;
const outcome = () => `<div class="proposal-outcome"><span class="proposal-label">Draft outcome</span><strong>Describe the useful result.</strong><p>What should be different after the user takes this step?</p></div>`;
const shell = (content,footer) => `<div class="app-screen client-future"><div class="proposal-wordmark">${esc(APP_NAME)} <span>Future</span></div>${content}<div class="proposal-footer">${footer}</div></div>`;

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
    'future-start':()=>shell(`<main class="proposal-main app-scroll"><span class="proposal-label">Draft journey</span><h1>Your primary action.</h1><p>Define the task your user came here to complete.</p>${outcome()}</main>`,primary('preview-outcome','Preview outcome')),
    'future-result':()=>shell(`<button type="button" class="proposal-back" data-action="back">← Back</button><main class="proposal-main app-scroll"><span class="proposal-label">Proposed destination</span><h1>An outcome to design.</h1><p>Replace this placeholder with clear confirmation and the next useful step.</p><div class="proposal-note">This draft is ready for your product decisions.</div></main>`,primary('try-feedback','Try feedback'))
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
    {id:'proposal-primary',name:'Proposed primary action',description:'The shared action used in the draft screens.',render:()=>`<div class="proposal-specimen">${primary('preview-outcome','Preview outcome')}</div>`},
    {id:'proposal-outcome',name:'Draft outcome',description:'A reusable prompt to define the intended result.',render:()=>`<div class="proposal-specimen">${outcome()}</div>`}
  ]}
};
