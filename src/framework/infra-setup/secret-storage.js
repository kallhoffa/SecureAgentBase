// Operator-entered secret storage for the infra setup wizard.
//
// Storage model:
// - Discord bot token + GitHub PAT are persisted to sessionStorage AND
//   localStorage. sessionStorage covers a same-tab reload; localStorage is
//   shared across tabs of the same origin, so a FRESH TAB restores steps 1-2
//   without needing a GCP access token (step 3 / Secret Manager).
// - The service account key (a long-lived, fully-privileged admin credential)
//   is sessionStorage-only: survives a same-tab reload, cleared when the tab
//   closes. It is never written to localStorage.
// - None of these secrets are ever written to Firestore (GHSA-x49w).
//
// cleanup: clearOperatorSecrets() is called on full disconnect/reset and on
// sign-out so a different operator on the same browser profile cannot inherit
// the previous operator's tokens.

export const SECRET_KEYS = {
  discordBotToken: 'wz_discord_bot_token',
  githubPat: 'wz_github_pat',
  serviceAccountJson: 'wz_sa_key',
};

// Keys that may live in localStorage (fresh-tab restore). Everything else is
// sessionStorage-only.
const TAB_PERSISTED_KEYS = [SECRET_KEYS.discordBotToken, SECRET_KEYS.githubPat];

export const persistOperatorSecret = (key, value) => {
  const storages = TAB_PERSISTED_KEYS.includes(key)
    ? [sessionStorage, localStorage]
    : [sessionStorage];
  for (const storage of storages) {
    try {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to persist operator secret (${key}):`, e);
    }
  }
};

// Read with sessionStorage precedence, falling back to localStorage (fresh
// tab with empty per-tab storage).
export const readOperatorSecret = (key) => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || null;
  } catch (e) {
    return null;
  }
};

export const clearOperatorSecrets = () => {
  for (const key of Object.values(SECRET_KEYS)) {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        storage.removeItem(key);
      } catch (e) {
        // storage unavailable (SSR/privacy mode) — nothing to clear
      }
    }
  }
};
