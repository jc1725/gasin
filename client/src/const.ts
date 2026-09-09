export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start login. Call this from an event handler or effect at the moment you
// want to navigate, e.g. `onClick={() => startLogin()}`.
//
// This used to open Manus's own OAuth portal (VITE_OAUTH_PORTAL_URL /
// VITE_APP_ID), which no longer exists now that the app has migrated off
// Manus — constructing that URL from unset env vars threw
// "Failed to construct 'URL': Invalid URL" and silently aborted every call
// site (the header login button, the global unauthenticated-redirect in
// main.tsx, useAuth's redirectOnUnauthenticated effect, entry-client.tsx).
// Route to the working Google OAuth flow instead, same as the other
// "Google 로그인" buttons in the app.
export const startLogin = () => {
  window.location.assign("/api/auth/google");
};
