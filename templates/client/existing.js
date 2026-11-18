// An unreviewed Existing audit scaffold. Nothing has been captured yet, so this design state has no screens:
// the studio lists the journeys from apps/findings.js as "Not captured yet" in Screens, the Flow map and the
// Overview. `npm run draft-existing -- <folder>` replaces this file (it looks for the sentence above) and keeps
// the overview block below.
// The instance generator replaces these JSON-quoted identity sentinels.
const APP_ID = "__APP_ID__";
const APP_NAME = "__APP_NAME__";

export default {
  identity:{id:APP_ID,name:APP_NAME,tagline:'The current experience, screen by screen.',description:'An unreviewed Existing audit. No screens have been captured yet.',version:'Existing · Not captured yet'},
  overview:{
    eyebrow:'Existing · Not captured yet',
    title:'Map the current experience before drawing conclusions.',
    description:'Each journey is captured in order: every screen, every control linked to where it goes, and the path drawn on the Flow map. No captures have been added yet.',
    approachTitle:'How the audit works',
    strategies:['**Preserve the source** and its proportions.','**Record gaps** instead of inventing missing outcomes.']
  },
  tokens:{
    light:{background:'#f6f7f8',surface:'#ffffff',ink:'#202a34',muted:'#65717e',border:'#dce1e6',accent:'#354251',accentSoft:'#e9edf1',onAccent:'#ffffff',danger:'#b84040'},
    dark:{background:'#17212b',surface:'#222e3a',ink:'#f1f4f7',muted:'#aab7c5',border:'#3a4857',accent:'#d5e0eb',accentSoft:'#2e3e4e',onAccent:'#17212b',danger:'#f0a1a1'}
  },
  previewLabel:'Existing',
  freshState:()=>({route:null,overlay:null,toast:null}),
  SCREENS:{},
  OVERLAYS:{},
  handlers:{},
  ACTIONS:{},
  NAV:[],
  FLOWS:[]
};
