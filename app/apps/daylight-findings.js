// Example findings for the fictional Daylight app. Invented for the demo: Daylight is code-drawn, not a real product.
// Open Findings in the local preview and choose Review to accept, edit or reject each one; decisions are saved beside
// this file in daylight-findings-review.json, which is not committed.
export default {
  summary: 'Example findings for a fictional app, written to show how a review works.',
  status: 'Example',
  opportunities: [
    { id: 'first-plan', title: 'Make the first plan obvious', summary: 'Lead a new person to one plan without making them decode the app.', impact: 'high' },
    { id: 'reversible', title: 'Keep changes reversible', summary: 'Let people change their mind after acting, not only before.', impact: 'medium' },
  ],
  items: [
    {
      id: 'welcome-no-explanation',
      severity: 'high',
      title: 'Welcome does not say what the app does',
      problem: 'The first screen describes a mood ("A day that feels like you") and offers one button, "Find my daylight". Neither says the app is for planning a few small things in a day.',
      recommendation: 'Name the job in the line under the headline, and keep the single button.',
      evidence: ['welcome'],
      opportunity: 'first-plan',
    },
    {
      id: 'two-names-one-action',
      severity: 'medium',
      title: 'Adding a plan has three names',
      problem: 'The empty day says "Add your first plan", the filled day says "Add a little plan", and the form\'s button says "Add to my day".',
      recommendation: 'Use one phrase for adding a plan across the empty state, the list and the form.',
      evidence: ['today-empty', 'today-ready', 'create-ready'],
      opportunity: 'first-plan',
    },
    {
      id: 'late-name-error',
      severity: 'medium',
      title: 'The missing-name error appears only after submitting',
      problem: 'The form shows "Give your little plan a name." only after it is submitted empty. Before that, the name field carries no sign that it is required.',
      recommendation: 'Mark the name as required before the first submit.',
      evidence: ['create-ready', 'create-invalid'],
      opportunity: 'first-plan',
    },
    {
      id: 'no-undo-after-remove',
      severity: 'medium',
      title: 'A removed plan cannot be brought back',
      problem: 'Removing a plan asks for confirmation and then returns to Today without the plan. No screen offers an undo.',
      recommendation: 'Replace the confirmation with an undo message on Today, so removal is one tap and still reversible.',
      evidence: ['plan-detail', 'remove-dialog'],
      opportunity: 'reversible',
    },
    {
      id: 'make-room-means-remove',
      severity: 'low',
      title: 'The removal dialog borrows the words used for adding',
      problem: 'The dialog that removes a plan is titled "Make a little room?", while saving a new plan shows "Making a little room". The same phrase stands for opposite actions.',
      recommendation: 'Title the dialog with the action it performs, such as removing the named plan.',
      evidence: ['remove-dialog', 'create-saving'],
      opportunity: 'reversible',
    },
  ],
};
