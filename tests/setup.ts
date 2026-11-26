import { beforeEach } from 'vitest';

beforeEach(() => {
  if (typeof window === 'undefined') return;

  delete (window as { _paq?: unknown })._paq;
  document.querySelectorAll('script').forEach((script) => script.remove());
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  document.title = '';
});
