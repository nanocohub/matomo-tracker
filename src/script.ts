const SCRIPT_MARKER = 'data-nanoco-matomo';

/** Adds `matomo.js` to the page once, however many trackers ask for it. */
export function injectMatomoScript(src: string, onError: () => void): void {
  if (isScriptPresent(src)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.setAttribute(SCRIPT_MARKER, src);
  script.onerror = onError;
  (document.head || document.documentElement).appendChild(script);
}

function isScriptPresent(src: string): boolean {
  return Array.from(document.scripts).some(
    (script) => script.getAttribute(SCRIPT_MARKER) === src || script.getAttribute('src') === src,
  );
}
