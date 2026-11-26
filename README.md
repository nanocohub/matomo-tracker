# @nanoco/matomo-tracker

The shared [Matomo](https://matomo.org) tracker for Nanoco's web apps, reporting to
`https://analytics.nanoco.com.vn` (Matomo 6).

It replaces the hand-written `_paq` glue each app grew on its own, and fixes the ways those copies diverged:
a logout that did not start a new visit, dimensions that were never cleared, raw URLs with an OAuth `?code=`
in them, unbounded event names, and uncapped error events.

- Zero runtime dependencies, about 4 KB gzipped once minified, ES2018, TypeScript types included.
- SSR safe: every call is a no-op without `window`.
- Never throws and never changes what the app does. When matomo.js cannot load (ad blocker, proxy), tracking turns itself off.
- Installed from a git tag, never published to npm. `dist/` is committed, so installing needs no build step.

## Install

```json
"@nanoco/matomo-tracker": "github:nanocohub/matomo-tracker#v1.0.0"
```

```bash
yarn add "@nanoco/matomo-tracker@github:nanocohub/matomo-tracker#v1.0.0"   # yarn 1
npm i "github:nanocohub/matomo-tracker#v1.0.0"                              # npm
```

Always pin a tag, never a branch. React is an optional peer (`>=17`), needed only for `@nanoco/matomo-tracker/react`.

| Import                           | What                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `@nanoco/matomo-tracker`         | `createMatomoTracker` (ESM, CJS and types)                                       |
| `@nanoco/matomo-tracker/react`   | `useMatomoPageView` (ESM, CJS and types)                                         |
| `@nanoco/matomo-tracker/browser` | One self-contained ESM file, for Rails importmap or any `<script type="module">` |
| `dist/browser.global.js`         | IIFE exposing `window.NanocoMatomo`, for a plain `<script>` (use the CDN URL)    |

TypeScript projects on `moduleResolution: "node"` (Next 12, for example) resolve the subpaths through
`typesVersions`, so they need no config change.

## Quick start

```ts
import { createMatomoTracker } from '@nanoco/matomo-tracker';

export const matomo = createMatomoTracker({
  url: 'https://analytics.nanoco.com.vn',
  siteId: 7,
});

matomo.trackPageView();
matomo.trackEvent({ category: 'Orders', action: 'Export', name: 'csv' });
```

Nothing happens until the tracker is first used: no script, no queue writes. The first call loads
`matomo.js` (once, async) and queues the configuration before any hit.

A tracker is **disabled** (`tracker.enabled === false`, every call a no-op) when `url` is not https,
`siteId` is not a positive integer, or `enabled: false`. Leave the env vars unset locally and the
app simply does not track. `enabled` also turns `false` if matomo.js fails to load, or if the commands of `reset()`
cannot be queued (see "What the tracker does for you").

## Options

| Option                  | Default        | Notes                                                                                                          |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `url`                   | -              | Matomo base URL, https only. A trailing slash is fine.                                                         |
| `siteId`                | -              | Positive integer, as a number or numeric string. `undefined` disables the tracker.                             |
| `enabled`               | `true`         | `false` turns every call into a no-op.                                                                         |
| `linkTracking`          | `true`         | Matomo `enableLinkTracking`: outlinks and downloads. They report the **raw** link URL, see convention 10.     |
| `heartbeatSeconds`      | `15`           | Time on page. `false` turns it off. Matomo enforces a minimum of 5.                                            |
| `jsErrorTracking`       | `true`         | Matomo `enableJSErrorTracking`. matomo.js dedupes identical errors itself but does not cap them.               |
| `keepQueryParams`       | `[]`           | Page URLs keep **only** these query parameters. The `#fragment` is always dropped.                             |
| `normalizePath`         | identity       | Maps the pathname before it is reported, e.g. `/orders/123` to `/orders/:id`.                                  |
| `domains`               | -              | Matomo `setDomains`: hosts that count as internal links.                                                       |
| `cookieDomain`          | -              | Matomo `setCookieDomain`, e.g. `*.nanoco.com.vn`.                                                              |
| `requireCookieConsent`  | `false`        | Matomo `requireCookieConsent`. After consent: `matomo.push(['rememberCookieConsentGiven'])`.                   |
| `requestMethod`         | Matomo's (GET) | `'POST'` avoids URL length limits (large carts), but the page origin must be allowed by Matomo's CORS settings. |
| `maxErrorEventsPerPage` | `10`           | Cap for `trackError` per page view.                                                                            |
| `debug`                 | `false`        | Logs every command and warns about suspicious event names.                                                     |

## API

```ts
interface MatomoTracker {
  readonly enabled: boolean;
  identify(user: { userId: string; dimensions?: Record<number, string | null | undefined> }): void;
  reset(): void;
  setDimensions(dimensions: Record<number, string | null | undefined>): void;
  trackPageView(view?: { url?: string; title?: string; force?: boolean }): void;
  trackEvent(event: { category: string; action: string; name?: string; value?: number }): void;
  trackSiteSearch(search: { keyword: string; category?: string; resultsCount?: number }): void;
  trackError(kind: string): void;
  ecommerce: {
    productView(product: { sku: string; name?: string; category?: string | string[]; price?: number }): void;
    cartUpdate(items: EcommerceItem[], grandTotal: number): void;
    order(order: {
      orderId: string;
      grandTotal: number;
      subTotal?: number;
      tax?: number;
      shipping?: number;
      discount?: number;
      items: EcommerceItem[];
    }): void;
  };
  push(command: unknown[]): void;
}

type EcommerceItem = { sku: string; name?: string; category?: string | string[]; price?: number; quantity?: number };
```

**`identify({ userId, dimensions })`** sets the user id and its visit-scope dimensions. A `null`, `undefined` or
blank dimension value removes that dimension. It is idempotent: the same user and dimensions queue nothing,
so calling it from an effect on every render is safe. Changed dimensions replace the previous ones (a
dimension the user no longer has is removed). A **different** `userId` than the current one makes the next page
view start a new visit, and so does a different one after a hard reload of the tab.

**`reset()`** is for logout. It clears the user id and every dimension set through `identify`, clears the
referrer, and makes the **next** page view a new visit (`new_visit=1` on that one request only). It never sends
a hit itself, and it survives the hard reload that many logouts end in (`location.href = '/login'`). Its commands
are queued even above the cap of the pre-load queue (in a reserve), so they always reach matomo.js before the
next hit. The one exception is a full reserve, which turns tracking off (see "What the tracker does for you").

**`setDimensions(dimensions)`** is for dimensions that are not about the user (language, tenant). `reset()`
leaves them alone.

**`trackPageView({ url?, title?, force? })`**. The URL defaults to `window.location.href` and may be a path.
It is reduced to `origin + normalizePath(pathname) + kept query params`. The commands go out in this order:
`setReferrerUrl` (the previous tracked URL; none for the first view of a page load, see below), `setCustomUrl`,
`setDocumentTitle`, the pending ecommerce product view, the new-visit flag, `trackPageView`. A view whose final
URL equals the last one is skipped unless `force`. Each tracked view resets the `trackError` counter.

The referrer of the **first view of a page load** is `document.referrer`. When it is a page of the **same origin**
(the OAuth callback that redirected to this page, say) it is set at init in its sanitized form, with the same
`keepQueryParams` and `normalizePath` rules as page URLs, so a `?code=` in it never reaches Matomo. An **external**
referrer is left untouched, because Matomo needs it for referrer and keyword attribution (browsers send only the
origin of a cross-origin referrer by default).

**`trackEvent({ category, action, name?, value? })`**: `name` is trimmed to 100 characters. A blank
category or action drops the event.

**`trackSiteSearch({ keyword, category?, resultsCount? })`**: the keyword is trimmed to 100 characters. Pass
`resultsCount: 0` for a search without results; leave it out when unknown (never pass `false`: matomo.js
would record it as a zero).

**`trackError(kind)`** sends an event with category `Error` and `kind` as the action, at most
`maxErrorEventsPerPage` times per page view.

**`ecommerce.productView(product)`** is applied to the **next** page view that is actually sent, so call it
before the view. For a product page whose data loads late, hold the page view back with `ready` (see the hook).
**`ecommerce.cartUpdate(items, grandTotal)`** replaces the cart and sends the update.
**`ecommerce.order(order)`** sends the order; the same `orderId` twice in one page session is ignored (Matomo
also dedupes by order id on the server). Items default to price 0 and quantity 1.

**`push(command)`** is the escape hatch for any other `_paq` command, and is still SSR and disabled safe. Only push
methods matomo.js knows (`trackGoal`, `rememberCookieConsentGiven`, ...): an unknown method name (a typo) makes
matomo.js throw a `TypeError` while it replays the queue, and every command queued **after** it is lost, the
tracker's own page views included. After matomo.js has loaded the error is swallowed, as everything the tracker
does, and shows up only with `debug: true`.

### `useMatomoPageView(tracker, { path, title?, ready? })`

```ts
import { useMatomoPageView } from '@nanoco/matomo-tracker/react';
```

Tracks a page view whenever `path` changes while `ready` is not `false`. The view is sent in a timer after React
commits, so `document.title` already shows the new page, and an `identify()` made in an effect during the same
commit goes out first. There is no double view in React 18/19 StrictMode dev double-effects. Works with React 17+.

## Recipes

Set two env vars per app and environment: `NEXT_PUBLIC_MATOMO_URL=https://analytics.nanoco.com.vn` and
`NEXT_PUBLIC_MATOMO_SITE_ID=<id>`. Next only inlines them when the code reads `process.env.NEXT_PUBLIC_X`
literally, so do not destructure `process.env` or read it through a variable.

### Next.js, pages router

```ts
// lib/matomo.ts
import { createMatomoTracker } from '@nanoco/matomo-tracker';

export const matomo = createMatomoTracker({
  url: process.env.NEXT_PUBLIC_MATOMO_URL ?? '',
  siteId: process.env.NEXT_PUBLIC_MATOMO_SITE_ID,
  keepQueryParams: ['page'],
  normalizePath: (path) => path.replace(/\/(\d+|[0-9a-f-]{36})(?=\/|$)/gi, '/:id'),
});
```

```tsx
// pages/_app.tsx
import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useMatomoPageView } from '@nanoco/matomo-tracker/react';
import { matomo } from '../lib/matomo';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const user = useCurrentUser(); // your auth hook

  useEffect(() => {
    if (user) matomo.identify({ userId: String(user.id), dimensions: { 1: user.role } });
  }, [user]);

  // router.isReady: before it, asPath is still the route pattern (/orders/[id]) on statically optimized pages.
  useMatomoPageView(matomo, { path: router.asPath, ready: router.isReady });

  return <Component {...pageProps} />;
}
```

On logout, call `matomo.reset()` before redirecting or clearing the session. If the app sets a `basePath`,
`router.asPath` does not include it: pass `router.basePath + router.asPath` as `path`.

### Next.js, App Router

```tsx
// app/matomo-page-view.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useMatomoPageView } from '@nanoco/matomo-tracker/react';
import { matomo } from '@/lib/matomo';

export function MatomoPageView() {
  const pathname = usePathname();
  useMatomoPageView(matomo, { path: pathname });
  return null;
}
```

Render `<MatomoPageView />` once in the root `app/layout.tsx`, inside `<body>`. If you use `keepQueryParams`,
read the query too and wrap the component in `<Suspense fallback={null}>`, which Next requires for it:

```tsx
const search = useSearchParams().toString();
useMatomoPageView(matomo, { path: search ? `${pathname}?${search}` : pathname });
```

### Rails with importmap (no bundler)

`config/importmap.rb`, from the CDN (jsDelivr serves the tag straight from GitHub):

```ruby
pin "@nanoco/matomo-tracker", to: "https://cdn.jsdelivr.net/gh/nanocohub/matomo-tracker@v1.0.0/dist/browser.js"
pin "matomo", to: "matomo.js"
```

Or vendor the file, which keeps the app independent of the CDN (and of a CSP rule for it):

```bash
curl -fsSL -o vendor/javascript/nanoco-matomo-tracker.js \
  https://cdn.jsdelivr.net/gh/nanocohub/matomo-tracker@v1.0.0/dist/browser.js
```

```ruby
pin "@nanoco/matomo-tracker", to: "nanoco-matomo-tracker.js"
```

Expose the settings from the layout's `<head>`, then track from `app/javascript/matomo.js` and add
`import "matomo"` to `application.js`:

```erb
<%= tag.meta name: "matomo-url", content: ENV["MATOMO_URL"] %>
<%= tag.meta name: "matomo-site-id", content: ENV["MATOMO_SITE_ID"] %>
<%= tag.meta name: "matomo-user-id", content: current_user&.id %>
```

```js
// app/javascript/matomo.js
import { createMatomoTracker } from "@nanoco/matomo-tracker"

const meta = (name) => document.querySelector(`meta[name="matomo-${name}"]`)?.content

export const tracker = createMatomoTracker({
  url: meta("url") ?? "",
  siteId: meta("site-id"),
  keepQueryParams: ["page"],
})

let identified = false

// turbo:load fires on the first load and after every Turbo visit, once the new <title> is in place.
document.addEventListener("turbo:load", () => {
  const userId = meta("user-id")

  if (userId) {
    tracker.identify({ userId })
    identified = true
  } else if (identified) {
    tracker.reset() // signed out during this tab's life
    identified = false
  }

  tracker.trackPageView()
})
```

For a plain `<script>` page with no modules, load `dist/browser.global.js` from the CDN URL and use
`NanocoMatomo.createMatomoTracker({ ... })`.

## Conventions

1. **User id** is a stable internal id (database id or uuid) when possible. An email or phone number works but
   puts personal data into Matomo reports. Never use a value that changes when the user edits their profile.
2. **Logout calls `reset()`**, every time, before the session is cleared or the page navigates away. That is what
   stops the next person on the machine inheriting the previous person's visit.
3. **Event category and action come from a closed set**: constants or a union type, not strings built at runtime.
4. **Event names are bounded**: a screen, a route template, a feature or a file type. Never an id, an email, a
   URL or free text. Names over 100 characters are cut. Run with `debug: true` while integrating: the tracker
   warns about emails, UUIDs, long numbers, URLs and free text.
5. **Keep only whitelisted query params** (`keepQueryParams`). Everything else, OAuth `?code=` and `?token=`
   included, never reaches Matomo. Use `normalizePath` to fold ids (`/orders/:id`) so reports group.
6. **Page titles are reported as they are.** If `document.title` contains a name or an id, pass `title`
   explicitly to `trackPageView` (or `useMatomoPageView`).
7. **Errors**: `trackError(kind)` takes a kind from a closed set (`ApiTimeout`, `ChunkLoadFailed`), not a message.
8. **Dimensions**: the ids are per Matomo site, so create them in Matomo before using them. Keep the values low
   cardinality (a role, a plan, a language); Matomo stores at most 255 characters.
9. **A Content-Security-Policy** must allow `https://analytics.nanoco.com.vn` in `script-src` and `connect-src`
   (and `img-src`, which Matomo falls back to), plus `https://cdn.jsdelivr.net` in `script-src` if the Rails
   build is pinned from the CDN.
10. **Link tracking reports raw link URLs.** With `linkTracking` on (the default), the `href` of every clicked
    outlink and download is sent exactly as it is in the page: it is **not** sanitized like page URLs. Do not render
    links with secrets in them (a presigned S3 URL with `X-Amz-Signature`, a `?token=`), or give such an `<a>` the
    `matomo_ignore` class (`piwik_ignore` works too), or set `linkTracking: false`.

## What the tracker does for you

- Queues Matomo's configuration once, before any hit, and loads `matomo.js` once however many trackers exist.
- Sets the sanitized current URL up front, so an error raised before the first page view does not report
  `location.href` with a `?code=` attached.
- Sanitizes a same-origin `document.referrer` for the first view of a page load (an external one is left alone),
  and chains referrers across single-page navigations.
- Starts a new visit through `appendToTrackingUrl('new_visit=1')` around **one** page view only, so a heartbeat
  or an event sent in between cannot open a phantom visit.
- Bounds the pre-load queue at 500 commands, and turns tracking off when matomo.js fails to load. An operation
  that needs several commands (a page view with a new visit, `identify`, `setDimensions`, a cart or an order) is
  queued whole or not at all, and the tracker changes its own state only after those commands were queued. A
  full queue therefore never leaves a new visit flag set without the command that clears it, and a dropped page
  view, `identify` or order is tried again instead of being remembered as done.
- `reset()` is the one exception: its commands (the user id, the dimensions and the referrer being cleared) use a
  reserve of 100 commands above the cap, so they always reach matomo.js before the next hit. Without them that hit
  would go out as a new visit still carrying the previous user's id and dimensions. If even the reserve is full
  (about 300 `reset()` calls while matomo.js has still not loaded), tracking is turned off (`enabled` becomes
  `false`) rather than misattribute what follows.
- Keeps working from memory when `sessionStorage` is blocked.

## Debugging

`createMatomoTracker({ ..., debug: true })` prints each `_paq` command and warns about suspicious event names.
In the browser, `_paq` is on `window`; the network tab shows the `matomo.php` requests (`new_visit=1` appears on
the first request after a logout).

## Development

```bash
npm ci
npm run check   # typecheck, tests, build, smoke test of every built file
```

`dist/` is committed and CI fails when it is stale: run `npm run build` and commit the result with every source
change. The tests use vitest with jsdom (`tests/`). `scripts/smoke-dist.mjs` loads each built artefact (ESM, CJS,
the browser ESM and the IIFE) and runs a short scenario through it.

Releasing: bump `version` in `package.json`, run `npm run build`, merge the pull request, then push an annotated
tag on the merge commit:

```bash
git tag -a v1.0.1 -m "v1.0.1" && git push origin v1.0.1
```

Apps pin that tag. This repository is public only so that apps can install it from git; the package is
`UNLICENSED` and is not published to npm.
