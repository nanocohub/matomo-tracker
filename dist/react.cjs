'use strict';

var react = require('react');

// src/react.ts
function useMatomoPageView(tracker, { path, title, ready = true }) {
  const latestTitle = react.useRef(title);
  react.useEffect(() => {
    latestTitle.current = title;
  });
  react.useEffect(() => {
    if (!ready || !tracker.enabled) return void 0;
    const timer = setTimeout(() => tracker.trackPageView({ url: path, title: latestTitle.current }), 0);
    return () => clearTimeout(timer);
  }, [tracker, path, ready]);
}

exports.useMatomoPageView = useMatomoPageView;
