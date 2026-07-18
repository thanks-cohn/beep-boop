function rememberNodeState(node) {
    return {
        style: node.getAttribute("style"),
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: node.hasAttribute("inert"),
        tabindex: node.getAttribute("tabindex")
    };
}
function restoreNodeState(node, state) {
    if (state.style === null) node.removeAttribute("style"); else node.setAttribute("style", state.style);
    if (state.ariaHidden === null) node.removeAttribute("aria-hidden"); else node.setAttribute("aria-hidden", state.ariaHidden);
    if (state.inert) node.setAttribute("inert", ""); else node.removeAttribute("inert");
    if (state.tabindex === null) node.removeAttribute("tabindex"); else node.setAttribute("tabindex", state.tabindex);
}
function createFiniteRailSession(containers) {
    const rails = [containers.left, containers.right].filter(Boolean);
    let frame = null;
    let disposed = false;
    const states = rails.map(target => {
        target.querySelectorAll('[data-rail-clone="true"]').forEach(clone => clone.remove());
        target.classList.add("finite-reader-rail");
        const blocks = [...target.children];
        const original = new Map();
        blocks.forEach((child, index) => {
            original.set(child, { self: rememberNodeState(child), focusables: [...child.querySelectorAll("a,button,input,select,textarea,iframe,[tabindex]")].map(node => [node, rememberNodeState(node)]) });
            child.dataset.railIndex = String(index);
            child.style.position = "absolute";
            child.style.left = "0";
            child.style.right = "0";
            child.style.background = "#000000";
            child.style.transition = "none";
        });
        return { target, blocks, original, activeStart: -1, visibleSlots: 0, heights: [], offsets: [], cycleCount: 0, iframeIds: [...target.querySelectorAll("iframe")], iframeSrcs: [...target.querySelectorAll("iframe")].map(iframe => iframe.src) };
    });
    const measure = () => {
        for (const state of states) {
            const gap = Number.parseFloat(getComputedStyle(state.target).rowGap || getComputedStyle(state.target).gap || "0") || 0;
            state.heights = state.blocks.map(block => Math.max(1, block.getBoundingClientRect?.().height || 260));
            state.offsets = [];
            let total = 0;
            for (const h of state.heights) { state.offsets.push(total); total += h + gap; }
            const side = state.target.closest(".reader-block-side");
            const layout = state.target.closest(".reader-block-layout");
            const contentHeight = layout?.getBoundingClientRect?.().height || document.documentElement.scrollHeight;
            const height = Math.min(window.innerHeight, side?.getBoundingClientRect?.().height || window.innerHeight);
            let used = 0, slots = 0;
            for (const h of state.heights) { if (slots && used + h > height) break; used += h + gap; slots += 1; }
            state.visibleSlots = Math.min(state.blocks.length, Math.max(1, slots));
            state.target.style.position = "sticky";
            state.target.style.top = "0";
            state.target.style.height = `${height}px`;
            state.target.style.minHeight = `${height}px`;
            state.target.style.background = "#000000";
            if (side) side.style.minHeight = `${Math.max(contentHeight, document.documentElement.scrollHeight)}px`;
        }
        schedule();
    };
    const update = () => {
        frame = null;
        if (disposed) return;
        for (const state of states) {
            const count = state.blocks.length;
            if (!count) continue;
            const cyclePx = Math.max(480, (state.heights[0] || 260) * 1.5);
            const nextStart = ((Math.floor(window.scrollY / cyclePx) % count) + count) % count;
            if (state.activeStart !== -1 && nextStart < state.activeStart) state.cycleCount += 1;
            state.activeStart = nextStart;
            const visibleOrder = Array.from({ length: state.visibleSlots }, (_, slot) => (nextStart + slot) % count);
            for (let index = 0; index < count; index += 1) {
                const child = state.blocks[index];
                const slot = visibleOrder.indexOf(index);
                const active = slot !== -1;
                child.style.transform = active ? `translateY(${state.offsets[slot] || 0}px)` : "translateY(-200vh)";
                child.style.opacity = active ? "1" : "0";
                child.style.pointerEvents = active ? "auto" : "none";
                if (active) { const saved = state.original.get(child).self; if (saved.ariaHidden === null) child.removeAttribute("aria-hidden"); else child.setAttribute("aria-hidden", saved.ariaHidden); if (saved.inert) child.setAttribute("inert", ""); else child.removeAttribute("inert"); } else child.setAttribute("aria-hidden", "true");
                state.original.get(child).focusables.forEach(([node, saved]) => active ? restoreNodeState(node, saved) : node.setAttribute("tabindex", "-1"));
            }
            if (import.meta.env?.DEV) state.target.__railDiagnostics = {
                configuredBlockCount: count,
                visibleSlotCount: state.visibleSlots,
                liveDomNodeCount: state.blocks.length,
                liveIframeCount: state.target.querySelectorAll("iframe").length,
                activeStartIndex: state.activeStart,
                cycleCount: state.cycleCount,
                iframeElementIdentities: state.iframeIds,
                currentIframeSrcList: [...state.target.querySelectorAll("iframe")].map(iframe => iframe.src),
                disposed
            };
        }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(measure);
    rails.forEach(rail => resize.observe(rail));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    frame = requestAnimationFrame(measure);
    return () => {
        disposed = true;
        if (frame !== null) cancelAnimationFrame(frame);
        resize.disconnect();
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", measure);
        states.forEach(state => { state.target.classList.remove("finite-reader-rail"); state.target.removeAttribute("style"); state.target.closest(".reader-block-side")?.style.removeProperty("min-height"); state.blocks.forEach(child => { restoreNodeState(child, state.original.get(child).self); state.original.get(child).focusables.forEach(([node, saved]) => restoreNodeState(node, saved)); }); });
    };
}

export { createFiniteRailSession };
