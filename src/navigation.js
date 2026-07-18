let resolver = null;

export function setRouteResolver(fn) {
  resolver = fn;
}

export function navigate(url, options = {}) {
  const next = new URL(url, window.location.origin);
  if (next.origin !== window.location.origin) {
    window.location.href = next.href;
    return;
  }
  const href = `${next.pathname}${next.search}${next.hash}`;
  if (options.replace) history.replaceState({}, "", href);
  else history.pushState({}, "", href);
  resolver?.();
}

export function installNavigation() {
  if (window.__beepBoopNavigationInstalled) return;
  window.__beepBoopNavigationInstalled = true;
  window.addEventListener("popstate", () => resolver?.());
  document.addEventListener("click", event => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.target || anchor.hasAttribute("download")) return;
    const next = new URL(anchor.href, window.location.href);
    if (next.origin !== window.location.origin) return;
    event.preventDefault();
    navigate(next.href);
  });
}
