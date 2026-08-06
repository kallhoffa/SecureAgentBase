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
  it('initial state opens on the optional sign-in step', () => {
    expect(initialWizardProgress.expandedSteps).toEqual([0]);
  });

  it('toggles a step in/out of expandedSteps', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'TOGGLE_STEP', step: 1 });
    expect(s.expandedSteps).toEqual([0, 1]);
    const s2 = wizardProgressReducer(s, { type: 'TOGGLE_STEP', step: 1 });
    expect(s2.expandedSteps).toEqual([0]);
  });

  it('EXPAND_STEP pushes a step without deduping (preserves editStep behavior)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [0, 1] },
      { type: 'EXPAND_STEP', step: 1 }
    );
    expect(s.expandedSteps).toEqual([0, 1, 1]);
  });

  it('COLLAPSE_STEP removes a step', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [0, 1, 2] },
      { type: 'COLLAPSE_STEP', step: 1 }
    );
    expect(s.expandedSteps).toEqual([0, 2]);
  });

  it('COLLAPSE_AND_EXPAND removes several then adds one', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [0, 2, 3] },
      { type: 'COLLAPSE_AND_EXPAND', remove: [2, 3], add: 1 }
    );
    // matches [...prev.filter(s => s !== 2 && s !== 3), 1]
    expect(s.expandedSteps).toEqual([0, 1]);
  });

  it('EXPAND_NEXT removes current and adds next (<=3)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [0, 1] },
      { type: 'EXPAND_NEXT', currentStepNum: 1 }
    );
    expect(s.expandedSteps).toEqual([0, 2]);
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
      { expandedSteps: [0, 1, 2] },
      { type: 'CLEAR' }
    );
    expect(s.expandedSteps).toEqual([]);
  });

  it('SET_EXPANDED replaces the array verbatim', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [0, 1] },
      { type: 'SET_EXPANDED', steps: [1, 2] }
    );
    expect(s.expandedSteps).toEqual([1, 2]);
  });
});

describe('wizardProgressReducer — no completion flags (legacy flag is dead)', () => {
  it('reducer has no step3Complete state (flag is dead)', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'TOGGLE_STEP', step: 1 });
    expect(s).not.toHaveProperty('step3Complete');
  });
});

describe('isStepCompleted — derives purely from external signals', () => {
  it('step 0 is complete when user is present (optional sign-in)', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ user: { uid: 'u1' } }), 0)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx(), 0)).toBe(false);
  });
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
    expect(isStepCompleted(initialWizardProgress, ctx(), 4)).toBe(false);
    expect(isStepCompleted(initialWizardProgress, ctx(), 99)).toBe(false);
  });
});

describe('isStepLocked — linear chain starts at Discord; step 0 optional', () => {
  it('step 0 is never locked (optional sign-in)', () => {
    expect(isStepLocked(initialWizardProgress, ctx(), 0)).toBe(false);
  });
  it('step 1 (Discord) is never locked — even signed out', () => {
    expect(isStepLocked(initialWizardProgress, ctx(), 1)).toBe(false);
    expect(isStepLocked(initialWizardProgress, ctx({ user: { uid: 'u' } }), 1)).toBe(false);
  });
  it('step 2 (GitHub) is locked until Discord is done, regardless of sign-in', () => {
    expect(isStepLocked(initialWizardProgress, ctx({ user: { uid: 'u' } }), 2)).toBe(true);
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true }), 2)).toBe(false);
  });
  it('step 3 (GCP) is locked until GitHub is done', () => {
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true }), 3)).toBe(true);
    expect(isStepLocked(initialWizardProgress, ctx({ discordBotAdded: true, githubPat: 'ghp_x' }), 3)).toBe(false);
  });
  it('signed-out operator can reach step 3 once Discord + GitHub are done', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x' });
    expect(isStepLocked(initialWizardProgress, c, 3)).toBe(false);
  });
});

describe('isStepActive — the first incomplete step of the linear chain', () => {
  it('step 0 is active on a fresh wizard (offering sign-in)', () => {
    expect(isStepActive(initialWizardProgress, ctx(), 0)).toBe(true);
    expect(isStepActive(initialWizardProgress, ctx(), 1)).toBe(false);
  });
  it('step 0 stops being active once signed in', () => {
    expect(isStepActive(initialWizardProgress, ctx({ user: { uid: 'u' } }), 0)).toBe(false);
  });
  it('step 0 stops being active once Discord is done (signed out)', () => {
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true }), 0)).toBe(false);
  });
  it('step 1 is active when signed in but Discord not done', () => {
    expect(isStepActive(initialWizardProgress, ctx({ user: { uid: 'u' } }), 1)).toBe(true);
  });
  it('step N active when N-1 complete and N incomplete', () => {
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true }), 2)).toBe(true);
    expect(isStepActive(initialWizardProgress, ctx({ discordBotAdded: true, githubPat: 'ghp_x' }), 3)).toBe(true);
  });
  it('isStepActive returns false when both N-1 and N complete', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x' });
    expect(isStepActive(initialWizardProgress, c, 2)).toBe(false);
  });
  it('no step is active once the wizard is fully complete', () => {
    const c = ctx({ discordBotAdded: true, githubPat: 'ghp_x', vmIp: '1.2.3.4' });
    expect(isStepActive(initialWizardProgress, c, 0)).toBe(false);
    expect(isStepActive(initialWizardProgress, c, 3)).toBe(false);
  });
});
