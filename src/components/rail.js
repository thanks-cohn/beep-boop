const railState = new WeakMap();
let railId = 0;

function trackIframe(wrapper, iframe, state) {
    if (!iframe.dataset.railIdentity) iframe.dataset.railIdentity = `rail-iframe-${++railId}`;
    iframe.dataset.railWrapped = "true";
    state.iframeLoadCounts.set(iframe, state.iframeLoadCounts.get(iframe) || 0);
    iframe.addEventListener("load", () => {
        state.iframeLoadCounts.set(iframe, (state.iframeLoadCounts.get(iframe) || 0) + 1);
        wrapper.classList.add("iframe-loaded");
    }, { once: true });
}

export function wrapExistingIframes(root, state = { iframeLoadCounts: new WeakMap() }) {
    root.querySelectorAll("iframe:not([data-rail-wrapped])").forEach(iframe => {
        const wrapper = document.createElement("div");
        wrapper.className = "block-iframe-shell";
        const cover = document.createElement("div");
        cover.className = "block-iframe-cover";
        cover.setAttribute("aria-hidden", "true");
        trackIframe(wrapper, iframe, state);
        iframe.parentNode.insertBefore(wrapper, iframe);
        wrapper.append(iframe, cover);
    });
}
export function wrapIframe(element, iframe) {
    const wrapper = document.createElement("div");
    wrapper.className = "block-iframe-shell";
    const cover = document.createElement("div");
    cover.className = "block-iframe-cover";
    cover.setAttribute("aria-hidden", "true");
    trackIframe(wrapper, iframe, { iframeLoadCounts: new WeakMap() });
    wrapper.append(iframe, cover);
    element.appendChild(wrapper);
}
export function enhanceRail(container) {
    if (!container || container.dataset.railEnhanced === "true") return null;
    const state = {
        configuredBlockCount: container.children.length,
        iframeLoadCounts: new WeakMap(),
        iframeIdentities: [],
        iframeSrcs: [],
        activeCycleIndex: 0,
        scrollUpdateCount: 0,
        domWriteCount: 0,
        activeListeners: 0,
        activeObservers: 0,
        frame: 0,
        lastOffset: null
    };
    container.dataset.railEnhanced = "true";
    container.classList.add("rail-ring");
    wrapExistingIframes(container, state);
    const iframes = [...container.querySelectorAll("iframe")];
    state.iframeIdentities = iframes.map((iframe, index) => iframe.dataset.railIdentity || `rail-iframe-${index + 1}`);
    state.iframeSrcs = iframes.map(iframe => iframe.src);
    railState.set(container, state);
    const threshold = () => Math.max(480, Math.floor(window.innerHeight * 0.82));
    const update = () => {
        state.frame = 0;
        if (!container.isConnected) return;
        state.scrollUpdateCount += 1;
        const blockCount = Math.max(1, state.configuredBlockCount);
        const index = Math.floor(Math.max(0, window.scrollY) / threshold());
        state.activeCycleIndex = index;
        const offset = -(index % blockCount) * threshold();
        if (offset === state.lastOffset) return;
        state.lastOffset = offset;
        state.domWriteCount += 1;
        container.style.setProperty("--rail-cycle-offset", `${offset}px`);
    };
    const schedule = () => { if (!state.frame) state.frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true }); state.activeListeners += 1;
    window.addEventListener("resize", schedule, { passive: true }); state.activeListeners += 1;
    update();
    return () => {
        window.removeEventListener("scroll", schedule); state.activeListeners -= 1;
        window.removeEventListener("resize", schedule); state.activeListeners -= 1;
        if (state.frame) cancelAnimationFrame(state.frame);
        container.classList.remove("rail-ring");
        container.style.removeProperty("--rail-cycle-offset");
        delete container.dataset.railEnhanced;
        railState.delete(container);
    };
}
export function railDiagnostics(container) {
    const iframes = [...(container?.querySelectorAll("iframe") || [])];
    const state = railState.get(container);
    return {
        configuredBlockCount: state?.configuredBlockCount ?? (container?.children.length || 0),
        liveBlockCount: container?.children.length || 0,
        liveIframeCount: iframes.length,
        iframeObjectIdentities: iframes.map((iframe, index) => iframe.dataset?.railIdentity || state?.iframeIdentities[index] || `iframe-${index + 1}`),
        iframeSrcValues: iframes.map(i => i.src),
        iframeLoadEventCounts: iframes.map(i => state?.iframeLoadCounts.get(i) || 0),
        activeCycleIndex: state?.activeCycleIndex || 0,
        scrollUpdateCount: state?.scrollUpdateCount || 0,
        domWriteCount: state?.domWriteCount || 0,
        activeListeners: state?.activeListeners || 0,
        activeObservers: state?.activeObservers || 0,
        blocks: container?.children.length || 0,
        iframes: iframes.length,
        srcs: iframes.map(i => i.src)
    };
}
