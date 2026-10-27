// Audit findings. Each finding links Existing evidence cards to the Future cards that address it.
// severity: 'high' | 'medium' | 'low'. evidence/proposal list card IDs from the Existing and Future modules.
// Replace this placeholder; never record a finding the evidence does not support.
export default {
  summary: 'Placeholder. Replace with a one-sentence summary of what the audit found.',
  evidenceState: 'existing',
  proposalState: 'future',
  items: [
    {
      id: 'placeholder-evidence',
      severity: 'medium',
      title: 'No evidence has been collected yet',
      problem: 'Describe what the captured screen shows and why it causes friction. Cite only what the evidence supports.',
      recommendation: 'Describe the proposed change and point to the Future screen that demonstrates it.',
      evidence: ['existing-evidence'],
      proposal: ['future-start'],
    },
  ],
};
