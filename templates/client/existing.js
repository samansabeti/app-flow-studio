// The instance generator replaces these JSON-quoted identity sentinels.
const APP_ID = "__APP_ID__";
const APP_NAME = "__APP_NAME__";
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const primary = (action,label) => `<button type="button" class="audit-button" data-action="${action}">${label}</button>`;
const status = () => `<div class="audit-evidence"><span class="audit-label">Evidence status</span><strong>Not collected</strong><p>No source screens or verified observations have been added.</p></div>`;
const shell = (content,footer) => `<div class="app-screen client-existing"><div class="audit-wordmark">${esc(APP_NAME)} <span>Existing</span></div>${content}<div class="audit-footer">${footer}</div></div>`;

export default {
  identity:{id:APP_ID,name:APP_NAME,tagline:'Evidence before conclusions.',description:'An unreviewed Existing audit scaffold. It contains no captured product behavior.',version:'Audit scaffold'},
  overview:{
    eyebrow:'Existing · Unreviewed',
    title:'Collect evidence before drawing conclusions.',
    description:'No source captures or verified product observations have been added.',
    strategies:['**Preserve the source** and its proportions.','**Record gaps** instead of inventing missing outcomes.']
  },
  tokens:{
    light:{background:'#f6f7f8',surface:'#ffffff',ink:'#202a34',muted:'#65717e',border:'#dce1e6',accent:'#354251',accentSoft:'#e9edf1',onAccent:'#ffffff',danger:'#b84040'},
    dark:{background:'#17212b',surface:'#222e3a',ink:'#f1f4f7',muted:'#aab7c5',border:'#3a4857',accent:'#d5e0eb',accentSoft:'#2e3e4e',onAccent:'#17212b',danger:'#f0a1a1'}
  },
  previewLabel:'Existing · Audit scaffold',
  freshState:()=>({route:'existing-overview',overlay:null,toast:null}),
  SCREENS:{
    'existing-overview':()=>shell(`<main class="audit-main app-scroll"><span class="audit-label">Source inventory</span><h1>Add the current experience.</h1><p>Place source screens here before describing how this product works.</p>${status()}</main>`,primary('review-evidence','Review evidence')),
    'existing-evidence':()=>shell(`<button type="button" class="audit-back" data-action="back">← Back</button><main class="audit-main app-scroll"><span class="audit-label">Evidence needed</span><h1>Start with what you can verify.</h1><p>Add a source capture, record when it was collected, and describe only the behavior it supports.</p><ul class="audit-list"><li><strong>Source</strong><span>Not added</span></li><li><strong>Observation</strong><span>Not recorded</span></li><li><strong>Open question</strong><span>What happens next?</span></li></ul></main>`,primary('show-evidence-note','Show audit note'))
  },
  OVERLAYS:{},
  handlers:{
    'review-evidence':ctx=>ctx.go('existing-evidence'),
    'show-evidence-note':ctx=>ctx.toast('No evidence has been added. Replace this scaffold with verified source material.')
  },
  ACTIONS:{
    'review-evidence':{label:'Review evidence',description:'Open the scaffold checklist. This is local workspace navigation, not an observed product transition.',to:'existing-evidence'},
    'show-evidence-note':{label:'Show audit note',description:'Show a local reminder that no product evidence has been recorded.'},
    back:{label:'Back',description:'Return to the source inventory scaffold.'},
    'dismiss-toast':{label:'Dismiss audit note',description:'Hide the local audit reminder.'}
  },
  backRoute:{'existing-overview':'existing-overview','existing-evidence':'existing-overview'},
  NAV:[{id:'existing-audit',title:'Existing · Evidence to collect',description:'Unreviewed placeholders. Replace them with source-backed states before making audit claims.',cards:[
    {id:'existing-overview',title:'Source inventory · Empty',route:'existing-overview',kind:'empty',status:'New',setup:()=>{},match:s=>s.route==='existing-overview',how:'Open the Existing workspace.',approach:'Start with a source inventory before mapping the current product.',rationale:'An explicit empty state keeps missing evidence from appearing verified.',actions:['review-evidence']},
    {id:'existing-evidence',title:'Evidence checklist · Empty',route:'existing-evidence',kind:'empty',status:'New',setup:()=>{},match:s=>s.route==='existing-evidence',how:'Choose Review evidence or open this card directly.',approach:'Show the source, observation, and open questions still needed.',rationale:'Make evidence gaps visible before drawing product conclusions.',actions:['back','show-evidence-note']}
  ]}],
  FLOWS:[{title:'Audit setup · Placeholder navigation',steps:[{card:'existing-overview',label:'Review evidence'},{card:'existing-evidence',label:'Show audit note'}]}],
  library:{paletteNote:'Neutral audit placeholders. No production colors or typography have been measured.',typography:[
    {name:'Scaffold heading',sample:'Evidence before conclusions.',fontFamily:FONT,fontSize:32,fontWeight:600},
    {name:'Scaffold body',sample:'Record what the source supports.',fontFamily:FONT,fontSize:14,fontWeight:400}
  ],components:[
    {id:'audit-primary',name:'Scaffold navigation',description:'A local audit-workspace control, not a production component.',render:()=>`<div class="audit-specimen">${primary('review-evidence','Review evidence')}</div>`},
    {id:'audit-evidence',name:'Missing evidence',description:'An explicit placeholder for evidence that has not been collected.',render:()=>`<div class="audit-specimen">${status()}</div>`}
  ]}
};
