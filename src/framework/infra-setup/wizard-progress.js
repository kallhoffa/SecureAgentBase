// wizard-progress — the deep module owning the wizard's progress invariant.
//
// State shape: { expandedSteps: number[], step3Complete: boolean }
//
// Only `step3Complete` is owned here. Steps 1, 2, 4-8 are *derived* from
// external signals (user, serviceAccountJson, firebase data, billing, etc.)
// that the component already manages as the source of truth for inputs and
// async results. Pulling those into the reducer would create a god-object;
// the selectors below take them as a context arg instead.
//
// The previous inline implementation had ~17 scattered setExpandedSteps
// updater functions and ~12 setStep3Complete calls with no single place
// defining "what advances a step." This module concentrates those rules:
// callers dispatch named actions; the selectors are pure functions testable
// without mounting the 5400-line component.

export const initialWizardProgress = {
  expandedSteps: [1],
  step3Complete: false,
};

export const wizardProgressReducer = (state, action) => {
  switch (action.type) {
    case 'TOGGLE_STEP': {
      const has = state.expandedSteps.includes(action.step);
      return {
        ...state,
        expandedSteps: has
          ? state.expandedSteps.filter((s) => s !== action.step)
          : [...state.expandedSteps, action.step],
      };
    }
    // EXPAND_STEP preserves the legacy `[...prev, step]` behavior (no dedupe).
    case 'EXPAND_STEP':
      return { ...state, expandedSteps: [...state.expandedSteps, action.step] };
    case 'COLLAPSE_STEP':
      return { ...state, expandedSteps: state.expandedSteps.filter((s) => s !== action.step) };
    case 'COLLAPSE_AND_EXPAND': {
      const remove = new Set(action.remove);
      return {
        ...state,
        expandedSteps: [...state.expandedSteps.filter((s) => !remove.has(s)), action.add],
      };
    }
    case 'EXPAND_NEXT': {
      const next = action.currentStepNum + 1;
      const filtered = state.expandedSteps.filter((s) => s !== action.currentStepNum);
      if (next <= 9 && !filtered.includes(next)) return { ...state, expandedSteps: [...filtered, next] };
      return { ...state, expandedSteps: filtered };
    }
    case 'CLEAR':
      return { ...state, expandedSteps: [] };
    case 'SET_EXPANDED':
      return { ...state, expandedSteps: action.steps };
    case 'SET_STEP3_COMPLETE':
      return { ...state, step3Complete: action.value };
    case 'REHYDRATE':
      return {
        expandedSteps: action.snapshot.expandedSteps ?? state.expandedSteps,
        step3Complete: action.snapshot.step3Complete ?? state.step3Complete,
      };
    default:
      return state;
  }
};

// Selectors take the external completion context so the reducer stays free
// of inputs/async state. Mirrors the inline isStepCompleted at infra-setup.tsx.
export const isStepCompleted = (state, ctx, step) => {
  switch (step) {
    case 1: return !!ctx.user;
    case 2: return !!ctx.serviceAccountJson;
    case 3: return !!state.step3Complete;
    case 4: return !!(ctx.firebaseStagingData?.projectId && ctx.firebaseProductionData?.projectId);
    case 5: return ctx.billingEnabled === true;
    case 6: return !!ctx.githubPat;
    case 7: return !!ctx.discordBotAdded;
    case 8: return !!ctx.vmIp;
    default: return false;
  }
};

export const isStepLocked = (state, ctx, step) => {
  if (step === 1) return false;
  return !isStepCompleted(state, ctx, step - 1);
};

export const isStepActive = (state, ctx, step) => {
  if (step === 1) return !isStepCompleted(state, ctx, 1);
  return isStepCompleted(state, ctx, step - 1) && !isStepCompleted(state, ctx, step);
};

export const isStepWarning = (state, ctx, step) => {
  if (step === 2) {
    return !!(ctx.projectId && ctx.gcpConnected && !ctx.serviceAccountJson);
  }
  return false;
};
