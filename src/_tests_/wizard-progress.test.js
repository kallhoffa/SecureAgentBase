import { describe, it, expect } from 'vitest';
import {
  initialWizardProgress,
  wizardProgressReducer,
  isStepCompleted,
  isStepLocked,
  isStepActive,
  isStepWarning,
} from '../framework/infra-setup/wizard-progress';

// Minimal completion context matching the 8 external signals the wizard's
// isStepCompleted selector derives from.
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
  it('toggles a step in/out of expandedSteps', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'TOGGLE_STEP', step: 2 });
    expect(s.expandedSteps).toEqual([1, 2]);
    const s2 = wizardProgressReducer(s, { type: 'TOGGLE_STEP', step: 2 });
    expect(s2.expandedSteps).toEqual([1]);
  });

  it('EXPAND_STEP pushes a step without deduping (preserves editStep behavior)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2], step3Complete: false },
      { type: 'EXPAND_STEP', step: 2 }
    );
    expect(s.expandedSteps).toEqual([1, 2, 2]);
  });

  it('COLLAPSE_STEP removes a step', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2, 3], step3Complete: false },
      { type: 'COLLAPSE_STEP', step: 2 }
    );
    expect(s.expandedSteps).toEqual([1, 3]);
  });

  it('COLLAPSE_AND_EXPAND removes several then adds one', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [2, 3, 4], step3Complete: false },
      { type: 'COLLAPSE_AND_EXPAND', remove: [2, 3], add: 4 }
    );
    // 4 already present; matches [...prev.filter(s => s !== 2 && s !== 3), 4]
    expect(s.expandedSteps).toEqual([4, 4]);
  });

  it('EXPAND_NEXT removes current and adds next (<=9)', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [3], step3Complete: false },
      { type: 'EXPAND_NEXT', currentStepNum: 3 }
    );
    expect(s.expandedSteps).toEqual([4]);
  });

  it('EXPAND_NEXT does not add step > 9', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [9], step3Complete: false },
      { type: 'EXPAND_NEXT', currentStepNum: 9 }
    );
    expect(s.expandedSteps).toEqual([]);
  });

  it('CLEAR empties expandedSteps', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2, 3], step3Complete: false },
      { type: 'CLEAR' }
    );
    expect(s.expandedSteps).toEqual([]);
  });

  it('SET_EXPANDED replaces the array verbatim', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [1, 2], step3Complete: false },
      { type: 'SET_EXPANDED', steps: [3, 4] }
    );
    expect(s.expandedSteps).toEqual([3, 4]);
  });
});

describe('wizardProgressReducer — step3Complete', () => {
  it('SET_STEP3_COMPLETE sets the flag', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'SET_STEP3_COMPLETE', value: true });
    expect(s.step3Complete).toBe(true);
  });
  it('REHYDRATE merges a persisted snapshot', () => {
    const s = wizardProgressReducer(
      { expandedSteps: [5, 6], step3Complete: true },
      { type: 'REHYDRATE', snapshot: { expandedSteps: [1, 2], step3Complete: false } }
    );
    expect(s).toEqual({ expandedSteps: [1, 2], step3Complete: false });
  });
  it('REHYDRATE ignores undefined fields', () => {
    const s = wizardProgressReducer(initialWizardProgress, { type: 'REHYDRATE', snapshot: { step3Complete: true } });
    expect(s.expandedSteps).toEqual([1]);
    expect(s.step3Complete).toBe(true);
  });
});

describe('isStepCompleted — derives from external signals + step3Complete flag', () => {
  it('step 1 is complete when user is present', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ user: { uid: 'u1' } }), 1)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx(), 1)).toBe(false);
  });
  it('step 2 is complete when serviceAccountJson is present', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ serviceAccountJson: { project_id: 'p' } }), 2)).toBe(true);
  });
  it('step 3 reads step3Complete flag from state', () => {
    expect(isStepCompleted({ expandedSteps: [1], step3Complete: true }, ctx(), 3)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx(), 3)).toBe(false);
  });
  it('step 4 requires both firebase projectIds', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({
      firebaseStagingData: { projectId: 's' }, firebaseProductionData: { projectId: 'p' },
    }), 4)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx({
      firebaseStagingData: { projectId: 's' }, firebaseProductionData: {},
    }), 4)).toBe(false);
  });
  it('step 5 requires billingEnabled === true (not truthy)', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ billingEnabled: true }), 5)).toBe(true);
    expect(isStepCompleted(initialWizardProgress, ctx({ billingEnabled: 'yes' }), 5)).toBe(false);
  });
  it('step 6 requires githubPat', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ githubPat: 'ghp_x' }), 6)).toBe(true);
  });
  it('step 7 requires discordBotAdded', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ discordBotAdded: true }), 7)).toBe(true);
  });
  it('step 8 requires vmIp', () => {
    expect(isStepCompleted(initialWizardProgress, ctx({ vmIp: '1.2.3.4' }), 8)).toBe(true);
  });
  it('unknown step returns false', () => {
    expect(isStepCompleted(initialWizardProgress, ctx(), 99)).toBe(false);
  });
});

describe('isStepLocked / isStepActive — derived purely from completion', () => {
  it('step 1 is never locked', () => {
    expect(isStepLocked(initialWizardProgress, ctx(), 1)).toBe(false);
  });
  it('step N is locked when step N-1 is incomplete', () => {
    // step 2 locked because step 1 (user) incomplete
    expect(isStepLocked(initialWizardProgress, ctx(), 2)).toBe(true);
    // step 2 unlocked when step 1 complete (user present)
    expect(isStepLocked(initialWizardProgress, ctx({ user: { uid: 'u' } }), 2)).toBe(false);
    // step 3 unlocked when step 2 complete (SA present + user present)
    expect(isStepLocked(initialWizardProgress, ctx({ user: { uid: 'u' }, serviceAccountJson: { project_id: 'p' } }), 3)).toBe(false);
  });
  it('isStepActive: step 1 active when not complete; step N active when N-1 complete and N incomplete', () => {
    expect(isStepActive(initialWizardProgress, ctx(), 1)).toBe(true);
    expect(isStepActive(initialWizardProgress, ctx({ user: { uid: 'u' } }), 1)).toBe(false);
    expect(isStepActive(initialWizardProgress, ctx({ user: { uid: 'u' } }), 2)).toBe(true);
  });
  it('isStepActive returns false when both N-1 and N complete', () => {
    const c = ctx({ user: { uid: 'u' }, serviceAccountJson: { project_id: 'p' } });
    expect(isStepActive(initialWizardProgress, c, 2)).toBe(false);
  });
});

describe('isStepWarning — step 2 warns when project+gcp connected but no SA', () => {
  it('warns for step 2 when projectId+gcpConnected and no serviceAccountJson', () => {
    expect(isStepWarning(initialWizardProgress, ctx({ projectId: 'p', gcpConnected: true }), 2)).toBe(true);
  });
  it('does not warn when SA is present', () => {
    expect(isStepWarning(initialWizardProgress, ctx({
      projectId: 'p', gcpConnected: true, serviceAccountJson: {},
    }), 2)).toBe(false);
  });
  it('returns false for all other steps', () => {
    expect(isStepWarning(initialWizardProgress, ctx(), 1)).toBe(false);
    expect(isStepWarning(initialWizardProgress, ctx(), 5)).toBe(false);
  });
});
