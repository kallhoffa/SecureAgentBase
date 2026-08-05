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
//   step 0: OPTIONAL sign-in  — app auth = persistence only. Never locks the
//                               next step (isStepLocked(1) is always false).
//   step 1: Discord           — bot token + server invite. No GCP.
//   step 2: GitHub            — PAT paste + repo vars. No GCP.
//   step 3: GCP               — ONE Google consent powers all cloud work
//                               (Firebase apps, deploy SAs + WIF, app-vm +
//                               agent SA, billing link, secrets, create VM).
//
// The previous implementation had ~17 scattered setExpandedSteps updater
// functions, ~12 setStep3Complete calls, and 8 completion cases; this module
// concentrates the rules: callers dispatch named actions, and the selectors
// are pure functions testable without mounting the 5400-line component.

export const initialWizardProgress = {
  expandedSteps: [0], // wizard opens on the optional sign-in card
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
    case 'REHYDRATE':
      return {
        expandedSteps: action.snapshot.expandedSteps ?? state.expandedSteps,
      };
    default:
      return state;
  }
};

// Selectors take the external completion context so the reducer stays free
// of inputs/async state. All completion signals are derivable from ctx — no
// flags, no step3Complete (map #27 / #32/#33).
export const isStepCompleted = (state, ctx, step) => {
  switch (step) {
    case 0: return !!ctx.user; // optional sign-in (persistence only)
    case 1: return !!ctx.discordBotAdded; // Discord
    case 2: return !!ctx.githubPat; // GitHub
    case 3: return !!ctx.vmIp; // GCP step done = VM created (or manual IP)
    default: return false;
  }
};

// Linear lock chain starts at Discord. Step 0 (optional sign-in) is excluded
// from the chain entirely: isStepLocked(1) must be false even signed out.
export const isStepLocked = (state, ctx, step) => {
  if (step === 0 || step === 1) return false;
  return !isStepCompleted(state, ctx, step - 1);
};

// Active = "the step the operator should currently be working on": the first
// incomplete step of the linear chain. Step 0 is active only while nothing
// else has been done (it offers sign-in, then yields to Discord).
export const isStepActive = (state, ctx, step) => {
  if (step === 0) return !isStepCompleted(state, ctx, 0) && !isStepCompleted(state, ctx, 1);
  return isStepCompleted(state, ctx, step - 1) && !isStepCompleted(state, ctx, step);
};
