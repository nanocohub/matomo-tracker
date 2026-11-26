import { useRef, useEffect } from 'react';

// src/react.ts
function useMatomoPageView(tracker, { path, title, ready = true }) {
  const latestTitle = useRef(title);
  useEffect(() => {
    latestTitle.current = title;
  });
  useEffect(() => {
    if (!ready || !tracker.enabled) return void 0;
    const timer = setTimeout(() => tracker.trackPageView({ url: path, title: latestTitle.current }), 0);
    return () => clearTimeout(timer);
  }, [tracker, path, ready]);
}

export { useMatomoPageView };
