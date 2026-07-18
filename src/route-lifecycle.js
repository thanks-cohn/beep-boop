export function createRouteLifecycle() {
  let generation = 0;
  let current = null;
  return {
    next(route, dispose) {
      generation += 1;
      if (current && !current.disposed) current.dispose();
      const controller = new AbortController();
      const cleanups = [];
      let disposed = false;
      const context = {
        route,
        generation,
        signal: controller.signal,
        get disposed() { return disposed; },
        isActive: () => current === context && !disposed && !controller.signal.aborted,
        addCleanup(fn) { if (typeof fn !== "function") return; if (disposed) fn(); else cleanups.push(fn); },
        dispose() {
          if (disposed) return;
          disposed = true;
          controller.abort();
          while (cleanups.length) cleanups.shift()?.();
          dispose?.();
        }
      };
      current = context;
      return context;
    },
    current: () => current,
    generation: () => generation,
    disposeCurrent() { current?.dispose(); current = null; }
  };
}
