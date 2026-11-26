'use strict';

// src/config.ts
var DEFAULT_HEARTBEAT_SECONDS = 15;
var DEFAULT_MAX_ERROR_EVENTS_PER_PAGE = 10;
function resolveConfig(options) {
  var _a, _b, _c;
  const baseUrl = parseHttpsBaseUrl(options.url);
  const siteId = parsePositiveInteger(options.siteId);
  return {
    enabled: options.enabled !== false && baseUrl !== null && siteId !== null,
    baseUrl: baseUrl != null ? baseUrl : "",
    siteId: siteId != null ? siteId : 0,
    linkTracking: options.linkTracking !== false,
    heartbeatSeconds: resolveHeartbeat(options.heartbeatSeconds),
    jsErrorTracking: options.jsErrorTracking === true,
    keepQueryParams: new Set((_a = options.keepQueryParams) != null ? _a : []),
    normalizePath: (_b = options.normalizePath) != null ? _b : identity,
    domains: (_c = options.domains) != null ? _c : [],
    cookieDomain: options.cookieDomain || void 0,
    requireCookieConsent: options.requireCookieConsent === true,
    requestMethod: options.requestMethod,
    maxErrorEventsPerPage: resolveErrorCap(options.maxErrorEventsPerPage)
  };
}
function identity(path) {
  return path;
}
function parseHttpsBaseUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch (e) {
    return null;
  }
}
function parsePositiveInteger(value) {
  const parsed = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function resolveHeartbeat(value) {
  if (value === void 0) return DEFAULT_HEARTBEAT_SECONDS;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : false;
}
function resolveErrorCap(value) {
  const isValid = typeof value === "number" && Number.isInteger(value) && value >= 0;
  return isValid ? value : DEFAULT_MAX_ERROR_EVENTS_PER_PAGE;
}

// src/dimensions.ts
var MAX_DIMENSION_LENGTH = 255;
function normalizeDimensionValue(value) {
  if (value === null || value === void 0) return null;
  const text = String(value).trim();
  return text.length > 0 ? text.slice(0, MAX_DIMENSION_LENGTH) : null;
}
function toDimensionEntries(dimensions) {
  return Object.keys(dimensions != null ? dimensions : {}).map(Number).filter((id) => Number.isInteger(id) && id > 0).sort((left, right) => left - right).map((id) => [id, normalizeDimensionValue(dimensions[id])]);
}
function dimensionCommand([id, value]) {
  return value === null ? ["deleteCustomDimension", id] : ["setCustomDimension", id, value];
}

// src/event.ts
var MAX_EVENT_NAME_LENGTH = 100;
var SUSPICIOUS_PATTERNS = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "looks like an email address"],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "contains a UUID"],
  [/\d{5,}/, "contains a long number, probably an id"],
  [/https?:\/\//i, "contains a URL"]
];
var MAX_WORDS_IN_NAME = 8;
function buildEventCommand(event, logger) {
  const category = cleanText(event.category);
  const action = cleanText(event.action);
  if (!category || !action) {
    logger.warn("event dropped: category and action are required", event);
    return null;
  }
  const name = normalizeEventName(event.name, logger);
  const value = isFiniteNumber(event.value) ? event.value : void 0;
  const command = ["trackEvent", category, action];
  if (name !== void 0 || value !== void 0) command.push(name);
  if (value !== void 0) command.push(value);
  return command;
}
function normalizeEventName(rawName, logger) {
  const name = cleanText(rawName);
  if (!name) return void 0;
  const suspicion = describeSuspiciousName(name);
  if (suspicion) logger.warn(`suspicious event name "${name}": ${suspicion}`);
  return name.slice(0, MAX_EVENT_NAME_LENGTH);
}
function describeSuspiciousName(name) {
  if (name.length > MAX_EVENT_NAME_LENGTH) {
    return `longer than ${MAX_EVENT_NAME_LENGTH} characters, it will be truncated`;
  }
  const match = SUSPICIOUS_PATTERNS.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  return name.split(/\s+/).length > MAX_WORDS_IN_NAME ? "looks like free text" : null;
}
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/ecommerce.ts
var MAX_CATEGORIES = 5;
function normalizeProduct(product) {
  const sku = cleanText(product == null ? void 0 : product.sku);
  if (!sku) return null;
  return {
    sku,
    name: cleanText(product.name),
    category: normalizeCategory(product.category),
    price: isFiniteNumber(product.price) ? product.price : ""
  };
}
function productViewCommand(view) {
  const category = Array.isArray(view.category) ? JSON.stringify(view.category) : view.category;
  return ["setEcommerceView", view.sku, view.name, category, view.price];
}
function clearProductViewCommand() {
  return ["setEcommerceView"];
}
function clearCartCommand() {
  return ["clearEcommerceCart"];
}
function itemCommands(items) {
  const commands = [];
  for (const item of Array.isArray(items) ? items : []) {
    const product = normalizeProduct(item);
    if (product === null) continue;
    const price = typeof product.price === "number" ? product.price : 0;
    const quantity = isFiniteNumber(item.quantity) ? item.quantity : 1;
    commands.push(["addEcommerceItem", product.sku, product.name, product.category, price, quantity]);
  }
  return commands;
}
function cartUpdateCommand(grandTotal) {
  return ["trackEcommerceCartUpdate", grandTotal];
}
function orderCommand(order, orderId) {
  return [
    "trackEcommerceOrder",
    orderId,
    order.grandTotal,
    amountOrBlank(order.subTotal),
    amountOrBlank(order.tax),
    amountOrBlank(order.shipping),
    amountOrBlank(order.discount)
  ];
}
function amountOrBlank(amount) {
  return isFiniteNumber(amount) ? amount : "";
}
function normalizeCategory(category) {
  if (Array.isArray(category)) {
    const categories = category.map(cleanText).filter(Boolean).slice(0, MAX_CATEGORIES);
    return categories.length > 0 ? categories : "";
  }
  return cleanText(category);
}

// src/init-commands.ts
function buildInitCommands(config, page) {
  const commands = [
    ["setTrackerUrl", `${config.baseUrl}/matomo.php`],
    ["setSiteId", config.siteId],
    config.requestMethod ? ["setRequestMethod", config.requestMethod] : null,
    config.domains.length > 0 ? ["setDomains", config.domains] : null,
    config.cookieDomain ? ["setCookieDomain", config.cookieDomain] : null,
    config.requireCookieConsent ? ["requireCookieConsent"] : null,
    page.currentUrl ? ["setCustomUrl", page.currentUrl] : null,
    page.sameOriginReferrerUrl ? ["setReferrerUrl", page.sameOriginReferrerUrl] : null,
    config.linkTracking ? ["enableLinkTracking"] : null,
    config.heartbeatSeconds === false ? null : ["enableHeartBeatTimer", config.heartbeatSeconds],
    config.jsErrorTracking ? ["enableJSErrorTracking"] : null
  ];
  return commands.filter((command) => command !== null);
}

// src/logger.ts
function createLogger(debug) {
  if (!debug) return { command: noop, warn: noop };
  return {
    command: (command) => console.info("[matomo]", ...command),
    warn: (message, ...details) => console.warn(`[matomo] ${message}`, ...details)
  };
}
function noop() {
}

// src/page-url.ts
function buildPageUrl(input, baseHref, rules) {
  const parsed = parseUrl(input, baseHref);
  if (parsed === null) return null;
  const path = normalizePathname(parsed.pathname, rules.normalizePath);
  const query = keepQueryParams(parsed.search, rules.keepQueryParams);
  return `${parsed.origin}${path}${query}`;
}
function buildSameOriginReferrerUrl(referrer, pageHref, rules) {
  const parsedReferrer = referrer ? parseUrl(referrer) : null;
  const parsedPage = parseUrl(pageHref);
  if (parsedReferrer === null || parsedPage === null || parsedReferrer.origin !== parsedPage.origin) return null;
  return buildPageUrl(referrer, pageHref, rules);
}
function parseUrl(input, baseHref) {
  try {
    const parsed = new URL(input, baseHref);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch (e) {
    return null;
  }
}
function normalizePathname(pathname, normalize) {
  try {
    const normalized = normalize(pathname);
    if (typeof normalized === "string" && normalized.length > 0) {
      return normalized.startsWith("/") ? normalized : `/${normalized}`;
    }
  } catch (e) {
  }
  return pathname;
}
function keepQueryParams(search, keep) {
  if (keep.size === 0 || search.length <= 1) return "";
  const kept = search.slice(1).split("&").filter((pair) => pair.length > 0 && keep.has(decodeParamName(pair)));
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}
function decodeParamName(pair) {
  var _a;
  const rawName = (_a = pair.split("=")[0]) != null ? _a : "";
  try {
    return decodeURIComponent(rawName.replace(/\+/g, " "));
  } catch (e) {
    return rawName;
  }
}

// src/queue.ts
var MAX_QUEUED_COMMANDS = 500;
var RESERVED_QUEUE_COMMANDS = 100;
function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
function enqueue(commands, options = {}) {
  var _a;
  const target = window;
  const queue = (_a = target._paq) != null ? _a : target._paq = [];
  const limit = MAX_QUEUED_COMMANDS + (options.useReserve ? RESERVED_QUEUE_COMMANDS : 0);
  if (Array.isArray(queue) && queue.length + commands.length > limit) return false;
  commands.forEach((command) => queue.push(command));
  return true;
}
function discardQueuedCommands() {
  const queue = window._paq;
  if (Array.isArray(queue)) queue.length = 0;
}

// src/script.ts
var SCRIPT_MARKER = "data-nanoco-matomo";
function injectMatomoScript(src, onError) {
  if (isScriptPresent(src)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  script.setAttribute(SCRIPT_MARKER, src);
  script.onerror = onError;
  (document.head || document.documentElement).appendChild(script);
}
function isScriptPresent(src) {
  return Array.from(document.scripts).some(
    (script) => script.getAttribute(SCRIPT_MARKER) === src || script.getAttribute("src") === src
  );
}

// src/site-search.ts
var MAX_SEARCH_KEYWORD_LENGTH = 100;
function buildSiteSearchCommand(search) {
  const keyword = cleanText(search == null ? void 0 : search.keyword).slice(0, MAX_SEARCH_KEYWORD_LENGTH);
  if (!keyword) return null;
  const category = cleanText(search.category) || false;
  if (isFiniteNumber(search.resultsCount) && search.resultsCount >= 0) {
    return ["trackSiteSearch", keyword, category, search.resultsCount];
  }
  return category === false ? ["trackSiteSearch", keyword] : ["trackSiteSearch", keyword, category];
}

// src/tab-memory.ts
function createTabMemory(siteId) {
  const userKey = `nanoco-matomo:${siteId}:user`;
  const newVisitKey = `nanoco-matomo:${siteId}:new-visit`;
  return {
    readUserId: () => {
      var _a;
      return (_a = attempt(() => window.sessionStorage.getItem(userKey))) != null ? _a : null;
    },
    writeUserId: (userId) => void attempt(() => window.sessionStorage.setItem(userKey, userId)),
    forgetUserId: () => void attempt(() => window.sessionStorage.removeItem(userKey)),
    readNewVisitPending: () => attempt(() => window.sessionStorage.getItem(newVisitKey)) === "1",
    writeNewVisitPending: (pending) => void attempt(
      () => pending ? window.sessionStorage.setItem(newVisitKey, "1") : window.sessionStorage.removeItem(newVisitKey)
    )
  };
}
function attempt(action) {
  try {
    return action();
  } catch (e) {
    return void 0;
  }
}

// src/tracker.ts
var NEW_VISIT_PARAMETER = "new_visit=1";
var ERROR_EVENT_CATEGORY = "Error";
function createMatomoTracker(options) {
  const config = resolveConfig(options);
  const logger = createLogger(options.debug === true);
  const memory = createTabMemory(config.siteId);
  const state = {
    started: false,
    scriptFailed: false,
    lastViewUrl: null,
    newVisitPending: false,
    pendingProduct: null,
    identity: null,
    errorEventsOnPage: 0,
    trackedOrderIds: /* @__PURE__ */ new Set()
  };
  const isActive = () => config.enabled && !state.scriptFailed && isBrowser();
  function sendAll(commands, options2 = {}) {
    if (!enqueue(commands, options2)) {
      logger.warn("queue is full, commands dropped", commands);
      return false;
    }
    commands.forEach((command) => logger.command(command));
    return true;
  }
  const send = (command) => sendAll([command]);
  function start() {
    if (state.started) return;
    state.started = true;
    state.newVisitPending = memory.readNewVisitPending();
    const href = window.location.href;
    const page = {
      currentUrl: buildPageUrl(href, href, config),
      sameOriginReferrerUrl: buildSameOriginReferrerUrl(document.referrer, href, config)
    };
    sendAll(buildInitCommands(config, page));
    injectMatomoScript(`${config.baseUrl}/matomo.js`, () => turnTrackingOff("matomo.js could not be loaded"));
  }
  function turnTrackingOff(reason) {
    state.scriptFailed = true;
    discardQueuedCommands();
    logger.warn(`${reason}, tracking is off`);
  }
  function run(action) {
    if (!isActive()) return;
    try {
      start();
      action();
    } catch (error) {
      logger.warn("call failed", error);
    }
  }
  function setNewVisitPending(pending) {
    state.newVisitPending = pending;
    memory.writeNewVisitPending(pending);
  }
  function isAccountSwitch(userId) {
    var _a, _b;
    const previousUserId = (_b = (_a = state.identity) == null ? void 0 : _a.userId) != null ? _b : memory.readUserId();
    return previousUserId !== null && previousUserId !== void 0 && previousUserId !== userId;
  }
  function identityDimensionCommands(entries) {
    var _a, _b;
    const removed = ((_b = (_a = state.identity) == null ? void 0 : _a.dimensionIds) != null ? _b : []).filter((id) => !entries.some(([entryId]) => entryId === id)).map((id) => [id, null]);
    return [...entries, ...removed].sort(([left], [right]) => left - right).map(dimensionCommand);
  }
  function identify(user) {
    run(() => {
      var _a;
      const userId = normalizeUserId(user == null ? void 0 : user.userId);
      if (!userId) {
        logger.warn("identify() ignored: userId is empty");
        return;
      }
      const entries = toDimensionEntries(user.dimensions);
      const key = JSON.stringify([userId, entries]);
      if (((_a = state.identity) == null ? void 0 : _a.key) === key) return;
      const switchesAccount = isAccountSwitch(userId);
      if (!sendAll([["setUserId", userId], ...identityDimensionCommands(entries)])) return;
      if (switchesAccount) setNewVisitPending(true);
      state.identity = {
        userId,
        key,
        dimensionIds: entries.filter(([, value]) => value !== null).map(([id]) => id)
      };
      memory.writeUserId(userId);
    });
  }
  function reset() {
    run(() => {
      var _a, _b;
      const deletions = ((_b = (_a = state.identity) == null ? void 0 : _a.dimensionIds) != null ? _b : []).map((id) => ["deleteCustomDimension", id]);
      const clearingCommands = [["resetUserId"], ...deletions, ["setReferrerUrl", ""]];
      state.identity = null;
      state.lastViewUrl = null;
      state.pendingProduct = null;
      memory.forgetUserId();
      setNewVisitPending(true);
      if (!sendAll(clearingCommands, { useReserve: true })) turnTrackingOff("the user id could not be cleared");
    });
  }
  function setDimensions(dimensions) {
    run(() => void sendAll(toDimensionEntries(dimensions).map(dimensionCommand)));
  }
  function pageViewCommands(url, title) {
    const commands = [];
    if (state.lastViewUrl !== null) commands.push(["setReferrerUrl", state.lastViewUrl]);
    commands.push(["setCustomUrl", url], ["setDocumentTitle", title]);
    if (state.pendingProduct !== null) commands.push(productViewCommand(state.pendingProduct));
    if (state.newVisitPending) {
      commands.push(["appendToTrackingUrl", NEW_VISIT_PARAMETER], ["trackPageView"], ["appendToTrackingUrl", ""]);
    } else {
      commands.push(["trackPageView"]);
    }
    if (state.pendingProduct !== null) commands.push(clearProductViewCommand());
    return commands;
  }
  function trackPageView(view) {
    run(() => {
      var _a, _b;
      const url = buildPageUrl((_a = view == null ? void 0 : view.url) != null ? _a : window.location.href, window.location.href, config);
      if (url === null) {
        logger.warn("page view dropped: not an http(s) URL", view == null ? void 0 : view.url);
        return;
      }
      if ((view == null ? void 0 : view.force) !== true && url === state.lastViewUrl) {
        state.pendingProduct = null;
        return;
      }
      if (!sendAll(pageViewCommands(url, (_b = view == null ? void 0 : view.title) != null ? _b : document.title))) return;
      state.lastViewUrl = url;
      state.errorEventsOnPage = 0;
      state.pendingProduct = null;
      if (state.newVisitPending) setNewVisitPending(false);
    });
  }
  function sendEvent(event) {
    const command = buildEventCommand(event, logger);
    return command !== null && send(command);
  }
  function trackEvent(event) {
    run(() => void sendEvent(event));
  }
  function trackSiteSearch(search) {
    run(() => {
      const command = buildSiteSearchCommand(search);
      if (command === null) {
        logger.warn("site search dropped: keyword is empty", search);
        return;
      }
      send(command);
    });
  }
  function trackError(kind) {
    run(() => {
      if (state.errorEventsOnPage >= config.maxErrorEventsPerPage) {
        logger.warn(`error event "${kind}" dropped: ${config.maxErrorEventsPerPage} per page reached`);
        return;
      }
      if (sendEvent({ category: ERROR_EVENT_CATEGORY, action: kind })) state.errorEventsOnPage += 1;
    });
  }
  const ecommerce = {
    productView(product) {
      run(() => {
        const view = normalizeProduct(product);
        if (view === null) {
          logger.warn("productView ignored: sku is required", product);
          return;
        }
        state.pendingProduct = view;
      });
    },
    cartUpdate(items, grandTotal) {
      run(() => {
        if (!isFiniteNumber(grandTotal)) {
          logger.warn("cartUpdate ignored: grandTotal must be a number", grandTotal);
          return;
        }
        sendAll([clearCartCommand(), ...itemCommands(items), cartUpdateCommand(grandTotal)]);
      });
    },
    order(order) {
      run(() => {
        const orderId = cleanText(order == null ? void 0 : order.orderId);
        if (!orderId || !isFiniteNumber(order.grandTotal)) {
          logger.warn("order ignored: orderId and a numeric grandTotal are required", order);
          return;
        }
        if (state.trackedOrderIds.has(orderId)) {
          logger.warn(`order "${orderId}" ignored: it was already tracked in this page session`);
          return;
        }
        if (sendAll([clearCartCommand(), ...itemCommands(order.items), orderCommand(order, orderId)])) {
          state.trackedOrderIds.add(orderId);
        }
      });
    }
  };
  function push(command) {
    run(() => {
      if (!Array.isArray(command) || command.length === 0) {
        logger.warn("push() ignored: a command is a non-empty array", command);
        return;
      }
      send(command);
    });
  }
  return {
    get enabled() {
      return config.enabled && !state.scriptFailed;
    },
    identify,
    reset,
    setDimensions,
    trackPageView,
    trackEvent,
    trackSiteSearch,
    trackError,
    ecommerce,
    push
  };
}
function normalizeUserId(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

exports.createMatomoTracker = createMatomoTracker;
