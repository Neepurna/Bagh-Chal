// Cached DOM lookups + tiny helpers.
//
// Replaces dozens of repeated `document.getElementById('...')` calls and the
// boilerplate `if (el) el.addEventListener(...)` pattern that filled the old
// main.js. Lookups are cached; the cache can be cleared if markup is replaced.

const idCache = new Map();

/** Get an element by id (cached). Returns null if not present. */
export function id(elementId) {
  if (idCache.has(elementId)) {
    const cached = idCache.get(elementId);
    // If element was removed from DOM, refetch.
    if (cached && document.body.contains(cached)) return cached;
    idCache.delete(elementId);
  }
  const el = document.getElementById(elementId);
  if (el) idCache.set(elementId, el);
  return el;
}

/** querySelector wrapper (uncached — call sparingly). */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** querySelectorAll wrapper (returns Array, not NodeList). */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Bind a handler to `getElementById(elementId).addEventListener(event, fn)` if the element exists. */
export function on(elementId, event, fn, options) {
  const el = id(elementId);
  if (!el) return null;
  el.addEventListener(event, fn, options);
  return el;
}

/** Add the same listener to many elements selected by selector. */
export function onAll(selector, event, fn, options, root = document) {
  const els = qsa(selector, root);
  els.forEach((el) => el.addEventListener(event, fn, options));
  return els;
}

/** Toggle the `show` class (the codebase's standard overlay-visible class). */
export function showOverlay(elementId) {
  const el = id(elementId);
  if (el) el.classList.add('show');
}

export function hideOverlay(elementId) {
  const el = id(elementId);
  if (el) el.classList.remove('show');
}

/** Toggle a class on an element by id. */
export function toggleClass(elementId, className, force) {
  const el = id(elementId);
  if (el) el.classList.toggle(className, force);
}

/** Set hidden flag on an element by id. */
export function setHidden(elementId, hidden) {
  const el = id(elementId);
  if (el) el.hidden = !!hidden;
}

/** Set CSS display style on an element by id. */
export function setDisplay(elementId, value) {
  const el = id(elementId);
  if (el) el.style.display = value;
}

/** Clear the cache (use after large markup changes). */
export function clearDomCache() {
  idCache.clear();
}
