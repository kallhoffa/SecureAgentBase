import { describe, it, expect } from 'vitest';
import {
  initialWizardProgress,
  wizardProgressReducer,
  isStepCompleted,
  isStepLocked,
  isStepActive,
} from '../framework/infra-setup/wizard-progress';

// Minimal completion context matching the external signals the 4-step
// selectors derive from (map #27 / #33). Kept in sync with the completionCtx
// passed to useWizardProgress in infra-setup.tsx.
const ctx = (overrides = {}) => ({
  user: null,
  serviceAccountJson: null,
  firebaseStagingData: {},
  firebaseProductionData: {},
  billingEnabled: null,
  githubPat: '',
  discordBotAdded: false,
  vmIp: '',
  projectId: '',
  gcpConnected: false,
  ...overrides,
});

describe('wizardProgressReducer — expandedSteps operations', () => {
  it('initial state opens on the Discord step', () => {
    expect(initialWizardProgress.expandedSteps).toEqual([1]);
  });

  it('toggles a step in/out of expandedSteps', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'TOGGLE_STEP', step: 1 });
    expect(s.expandedSteps).toEqual([]);
    const s2 = wizardProgressReducer(s, { type: 'TOGGLE_STEP', step: 1 });
    expect(s2.expandedSteps).toEqual([1]);
  });

  it('EXPAND_STEP pushes a step without deduping (preserves editStep behavior)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2] },
      { type: 'EXPAND_STEP', step: 2 }
    );
    expect(s.expandedSteps).toEqual([1, 2, 2]);
  });

  it('COLLAPSE_STEP removes a step', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2, 3] },
      { type: 'COLLAPSE_STEP', step: 2 }
    );
    expect(s.expandedSteps).toEqual([1, 3]);
  });

  it('COLLAPSE_AND_EXPAND removes several then adds one', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2, 3] },
      { type: 'COLLAPSE_AND_EXPAND', remove: [2, 3], add: 1 }
    );
    // Collapses 2,3 → [1], then expands 1 → [1, 1] (no dedupe)
    expect(s.expandedSteps).toEqual([1, 1]);
  });

  it('EXPAND_NEXT removes current and adds next (<=3)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2] },
      { type: 'EXPAND_NEXT', currentStepNum: 2 }
    );
    expect(s.expandedSteps).toEqual([1, 3]);
  });

  it('EXPAND_NEXT does not add step > 3', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [3] },
      { type: 'EXPAND_NEXT', currentStepNum: 3 }
    );
    expect(s.expandedSteps).toEqual([]);
  });

  it('CLEAR empties expandedSteps', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2, 3] },
      { type: 'CLEAR' }
    );
    expect(s.expandedSteps).toEqual([]);
  });

  it('SET_EXPANDED replaces the array verbatim', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2] },
      { type: 'SET_EXPANDED', steps: [2, 3] }
    );
    expect(s.expandedSteps).toEqual([2, 3]);
  });
});

describe('wizardProgressReducer — no completion flags (legacy flag is dead)', () => {
  it('reducer has no step3Complete state (flag is dead)', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'TOGGLE_STEP', step: 1 });
    expect(s).not.toHaveProperty('step3Complete');
  });
});

describe('isStepCompleted — derives purely from external signals', () => {
  it('step 1 is complete when discordBotAdded (Discord)', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ discordBotAdded: true }), 1)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx(), 1)).toBe(false);
  });
  it('step 2 is complete when githubPat is present (GitHub)', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ githubPat: 'ghp_x' }), 2)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx({ githubPat: '' }), 2)).toBe(false);
  });
  it('step 3 is complete when vmIp is present (GCP step done)', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ vmIp: '1.2.3.4' }), 3)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx(), 3)).toBe(false);
  });
  it('completion does not depend on the reducer state', () => {
    // No flag lives in state — the same ctx produces the same answer for any
    // expandedSteps shape.
    const c = ctx({ discordBotAdded: true });
    expect(isStepCompleted({ expandedSteps: [] }, c, 1)).toBe(true);
    expect(isStepCompleted({ expandedSteps: [1, 2] }, c, 1)).toBe(true);
  });
  it('unknown step returns false', () => {
    expect(isStepCompleted(initialWizardProgress, ctx(), 0)).toBe(false);
    expect(isStepCompleted(initialWizardProgress, ctx(), 4)).toBe(false);
    expect(isStepCompleted(initialWizardProgress, ctx(), 99)).toBe(false);
  });
});

describe('isStepLocked — linear chain starts at Discord', () => {
  it('step 1 (Discord) is never locked', () => {
    expect(isStepLocked(initialWizardProgress, ctx(), 1)).toBe(false);
  });
  it('step 2 (GitHub) is locked until Discord is done', () => {
    expect(isStepLocked(initialWizardProgress, ctx(), 2)).toBe(true);
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true }), 2)).toBe(false);
  });
  it('step 3 (GCP) is locked until GitHub is done', () => {
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true }), 3)).toBe(true);
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true, githubPat: 'ghp_x' }), 3)).toBe(false);
  });
  it('operator can reach step 3 once Discord + GitHub are done', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x' });
    expect(isStepLocked(initialWizardProgress, c, 3)).toBe(false);
  });
});

describe('isStepActive — the first incomplete step of the linear chain', () => {
  it('step 1 is active on a fresh wizard', () => {
    expect(isStepActive(initialWizardProgress, ctx(), 1)).toBe(true);
  });
  it('step 1 stops being active once Discord is done', () => {
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true }), 1)).toBe(false);
  });
  it('step 2 is active when Discord is done but GitHub not done', () => {
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true }), 2)).toBe(true);
  });
  it('step 3 is active when Discord + GitHub done but no VM', () => {
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true, githubPat: 'ghp_x' }), 3)).toBe(true);
  });
  it('isStepActive returns false when both N-1 and N complete', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x' });
    expect(isStepActive(initialWizardProgress, c, 2)).toBe(false);
  });
  it('no step is active once the wizard is fully complete', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x', vmIp: '1.2.3.4' });
    expect(isStepActive(initialWizardProgress, c, 1)).toBe(false);
    expect(isStepActive(initialWizardProgress, c, 3)).toBe(false);
  });
});
