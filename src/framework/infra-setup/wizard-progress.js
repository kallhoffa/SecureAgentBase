// wizard-progress — the deep module owning the wizard's progress invariant.
//
// State shape: { expandedSteps: number[] }
//
// The reducer owns ONLY the expanded-steps UI state. Step *completion* is
// always derived from external signals the component already manages as the
// source of truth (user, discordBotAdded, githubPat, vmIp, ...); the selectors
// below take them as a context arg instead. There is deliberately no
// completion flag in the reducer state (the legacy `step3Complete` flag was
// removed in the 4-step consolidation — see map #27 / tickets #32-#33).
//
// Step model (post-consolidation):
//   step 1: Discord           — bot token + server invite. No GCP.
//   step 2: GitHub            — PAT paste + repo vars. No GCP.
//   step 3: GCP               — ONE Google consent powers all cloud work
//                               (Firebase apps, deploy SAs + WIF, app-vm +
//                               agent SA, billing link, secrets, create VM).
//
// Step 0 (optional sign-in) is hidden — it was only useful for persistence
// via the projects collection which has been removed. The user variable is
// still available (Firestore config save/load, GCP email matching) but does
// not gate wizard progress.
//
// The previous implementation had ~17 scattered setExpandedSteps updater
// functions, ~12 setStep3Complete calls, and 8 completion cases; this module
// concentrates the rules: callers dispatch named actions, and the selectors
// are pure functions testable without mounting the 5400-line component.

export const initialWizardProgress = {
  expandedSteps: [1], // wizard opens on the Discord step (step 0 hidden)
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
      if (next <= 3 && !filtered.includes(next)) return { ...state, expandedSteps: [...filtered, next] };
      return { ...state, expandedSteps: filtered };
    }
    case 'CLEAR':
      return { ...state, expandedSteps: [] };
    case 'SET_EXPANDED':
      return { ...state, expandedSteps: action.steps };
    default:
      return state;
  }
};

// Selectors take the external completion context so the reducer stays free
// of inputs/async state. All completion signals are derivable from ctx — no
// flags, no step3Complete (map #27 / #32/#33).
export const isStepCompleted = (state, ctx, step) => {
  switch (step) {
    case 1: return !!ctx.discordBotAdded; // Discord
    case 2: return !!ctx.githubPat; // GitHub
    case 3: return !!ctx.vmIp; // GCP step done = VM created (or manual IP)
    default: return false;
  }
};

// Linear lock chain: step 1 is never locked (it's the first step).
export const isStepLocked = (state, ctx, step) => {
  if (step === 1) return false;
  return !isStepCompleted(state, ctx, step - 1);
};

// Active = "the step the operator should currently be working on": the first
// incomplete step of the linear chain. Step 1 is always active when incomplete
// (step 0 is hidden, does not gate progress).
export const isStepActive = (state, ctx, step) => {
  if (step === 1) return !isStepCompleted(state, ctx, 1);
  return isStepCompleted(state, ctx, step - 1) && !isStepCompleted(state, ctx, step);
};
