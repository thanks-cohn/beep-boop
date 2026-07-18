export function wrapExistingIframes(root) {
    root.querySelectorAll("iframe:not([data-rail-wrapped])").forEach(iframe => {
        const wrapper = document.createElement("div");
        wrapper.className = "block-iframe-shell";
        const cover = document.createElement("div");
        cover.className = "block-iframe-cover";
        cover.setAttribute("aria-hidden", "true");
        iframe.dataset.railWrapped = "true";
        iframe.addEventListener("load", () => wrapper.classList.add("iframe-loaded"), { once: true });
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
    iframe.dataset.railWrapped = "true";
    iframe.addEventListener("load", () => wrapper.classList.add("iframe-loaded"), { once: true });
    wrapper.append(iframe, cover);
    element.appendChild(wrapper);
}
export function enhanceRail(container) {
    if (!container || container.dataset.railEnhanced === "true") return null;
    container.dataset.railEnhanced = "true";
    container.classList.add("rail-ring");
    wrapExistingIframes(container);
    let frame = 0;
    let lastIndex = -1;
    const threshold = () => Math.max(480, Math.floor(window.innerHeight * 0.82));
    const update = () => {
        frame = 0;
        if (!container.isConnected) return;
        const index = Math.floor(Math.max(0, window.scrollY) / threshold());
        if (index === lastIndex) return;
        lastIndex = index;
        container.style.setProperty("--rail-cycle-offset", `${-(index % Math.max(1, container.children.length)) * threshold()}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    update();
    return () => {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        if (frame) cancelAnimationFrame(frame);
        container.classList.remove("rail-ring");
        container.style.removeProperty("--rail-cycle-offset");
        delete container.dataset.railEnhanced;
    };
}
export function railDiagnostics(container) {
    return { blocks: container?.children.length || 0, iframes: container?.querySelectorAll("iframe").length || 0, srcs: [...(container?.querySelectorAll("iframe") || [])].map(i => i.src) };
}
