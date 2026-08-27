/**
 * Chrome's one-tap install offer, caught before it is lost (launch audit,
 * 2026-08-20: the end screen was printing menu directions while the
 * browser held a NATIVE install dialog we were throwing away). Captured at
 * module scope because the event fires before the first session finishes
 * booting.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
let installPrompt: InstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
});

/** Fire the captured prompt, once. False where the browser never offered one. */
export function promptInstall(): boolean {
  if (installPrompt === null) return false;
  void installPrompt.prompt();
  installPrompt = null;
  return true;
}
