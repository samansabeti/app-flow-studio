// Audit findings. Each finding links Existing evidence cards to the Future cards that address it.
// items: { id, severity: 'high' | 'medium' | 'low', title, problem, recommendation, evidence: [cardIds], proposal: [cardIds],
//          journey?: journeyId, opportunity?: opportunityId }
// journeys (optional): [{ id, title, summary? }] tags findings, adds a journey filter, and orders journeys in every view.
//   A journey with no screens yet shows as "Not captured yet". Name screenshot subfolders after journey ids
//   (for example 01-signing-up) and `npm run draft-existing` files their screens under that journey.
//   messages: true on a journey of emails, push notifications or texts gives its drafted shots channel and supports fields.
// opportunities (optional): [{ id, title, summary, impact: 'high' | 'medium' | 'low' }] groups findings; list order is
//   priority order. The Overview lists them as early directions until they are validated.
// status (optional): a short label beside the Findings title, such as 'Work in progress'.
// Cite only what the screenshots show. The Findings view appears once items are added.
// Review in the local preview saves accept, edit and reject decisions beside this file in findings-review.json;
// this file keeps the draft. Once a review exists, exports carry accepted findings only.
export default {
  summary: '',
  status: 'Work in progress',
  evidenceState: 'existing',
  proposalState: 'future',
  // Example journeys: rename, reorder or replace them with the client's own.
  journeys: [
    { id: 'signing-up', title: 'Signing up', summary: 'From first launch to a ready account.' },
    { id: 'first-task', title: 'Completing the first task', summary: 'The first time someone does the main thing the app is for.' },
    { id: 'managing-settings', title: 'Managing settings', summary: 'Changing preferences, notifications and account details.' },
  ],
  opportunities: [
    // { id: 'clearer-first-step', title: 'Make the first step obvious', summary: 'Lead with the one action a new user came to take.', impact: 'high' },
  ],
  items: [
    // {
    //   id: 'unclear-first-step',
    //   severity: 'medium',
    //   title: 'The first step is not clear',
    //   problem: 'Describe what the captured screen shows and why it causes friction. Cite only what the evidence supports.',
    //   recommendation: 'Describe the proposed change and point to the Future screen that demonstrates it.',
    //   evidence: ['existing-card-id'],
    //   proposal: ['future-start'],
    //   journey: 'first-task',
    //   opportunity: 'clearer-first-step',
    // },
  ],
};
