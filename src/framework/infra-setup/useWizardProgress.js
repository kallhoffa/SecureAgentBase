// useWizardProgress — thin hook wrapping useReducer + the pure selectors.
// Returns the reducer state, a bound dispatch, and the selectors bound to the
// current state so JSX handlers stay terse (`isStepCompleted(3)` instead of
// `isStepCompleted(state, ctx, 3)`). The completion context (external signals)
// is passed once per render; the bound selectors close over it.
import { useReducer, useCallback, useMemo } from 'react';
import {
  initialWizardProgress,
  wizardProgressReducer,
  isStepCompleted as selectIsStepCompleted,
  isStepLocked as selectIsStepLocked,
  isStepActive as selectIsStepActive,
  isStepWarning as selectIsStepWarning,
} from './wizard-progress';

export const useWizardProgress = (completionCtx) => {
  const [state, dispatch] = useReducer(wizardProgressReducer, initialWizardProgress);

  // Bound selectors close over the current state + completion context so call
  // sites read exactly like the legacy inline functions did. ctx changes every
  // render (new object literal at the call site is fine); these are cheap.
  const isStepCompleted = useCallback(
    (step) => selectIsStepCompleted(state, completionCtx, step),
    [state, completionCtx]
  );
  const isStepLocked = useCallback(
    (step) => selectIsStepLocked(state, completionCtx, step),
    [state, completionCtx]
  );
  const isStepActive = useCallback(
    (step) => selectIsStepActive(state, completionCtx, step),
    [state, completionCtx]
  );
  const isStepWarning = useCallback(
    (step) => selectIsStepWarning(state, completionCtx, step),
    [state, completionCtx]
  );

  // Navigation helpers wrap dispatch so JSX onClick handlers stay one-liners.
  const toggleStep = useCallback((step) => dispatch({ type: 'TOGGLE_STEP', step }), []);
  const editStep = useCallback((step) => dispatch({ type: 'EXPAND_STEP', step }), []);
  const expandNextStep = useCallback((currentStepNum) => dispatch({ type: 'EXPAND_NEXT', currentStepNum }), []);

  return useMemo(
    () => ({
      state,
      expandedSteps: state.expandedSteps,
      step3Complete: state.step3Complete,
      dispatch,
      isStepCompleted,
      isStepLocked,
      isStepActive,
      isStepWarning,
      toggleStep,
      editStep,
      expandNextStep,
    }),
    [state, isStepCompleted, isStepLocked, isStepActive, isStepWarning, toggleStep, editStep, expandNextStep]
  );
};
