import { fetchWithRetry } from "../utils/retry.js";
import blocksData from "../data/blocks.json";

const IMAGE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const HTML_PATTERN = /\.html?(\?.*)?$/i;
const PLACEMENTS = ["left", "center", "right"];

async function loadText(path) {
    return fetchWithRetry(path, {}, { parse: "text", retries: 10 });
}

function normalizeBlock(item) {
    if (typeof item !== "string") return item || null;

    const value = item.trim();
    if (value.startsWith("<")) return { embed: value };
    if (IMAGE_PATTERN.test(value)) return { image: value };
    if (HTML_PATTERN.test(value)) return { html: value };
    return { text: value };
}

function isEnabled(item, page) {
    const block = normalizeBlock(item);
    if (!block) return false;
    if (block.enabled === false || block.active === false || block.disabled === true) return false;
    const excluded = block.excludePages || block.exclude_pages || block.exclude || block.hiddenOn || block.hidden_on;
    if (Array.isArray(excluded) && excluded.includes(page)) return false;
    const pages = block.pages || block.includePages || block.include_pages || block.onlyPages || block.only_pages;
    if (Array.isArray(pages) && pages.length && !pages.includes(page)) return false;
    if (page === "reader" && (block.reader === false || block.readerEnabled === false || block.reader_enabled === false)) return false;
    return true;
}

function block(className, item = {}) {
    const element = document.createElement("section");
    element.className = ["site-block", className, item.className || item.class || ""].filter(Boolean).join(" ");
    if (item.sticky) element.classList.add("site-block-sticky");
    return element;
}

function appendHtml(target, html) {
    const template = document.createElement("template");
    template.innerHTML = html;

    for (const script of template.content.querySelectorAll("script")) {
        const replacement = document.createElement("script");
        for (const attribute of script.attributes) {
            replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.textContent = script.textContent;
        script.replaceWith(replacement);
    }

    target.appendChild(template.content.cloneNode(true));
}

function imageBlock(item) {
    const element = block("image-block", item);
    const image = document.createElement("img");
    image.className = "block-image";
    image.src = item.image || item.src || item.url;
    image.alt = item.alt || item.title || "";
    image.loading = item.loading || "lazy";
    image.decoding = "async";
    if (item.width) image.width = item.width;
    if (item.height) image.height = item.height;

    if (item.href || item.link) {
        const link = document.createElement("a");
        link.href = item.href || item.link;
        link.target = item.target || "_blank";
        link.rel = item.rel || "noopener noreferrer";
        link.appendChild(image);
        element.appendChild(link);
    } else {
        element.appendChild(image);
    }

    return element;
}

function textBlock(item) {
    const element = block("text-block", item);
    if (item.title) {
        const title = document.createElement("h3");
        title.textContent = item.title;
        element.appendChild(title);
    }

    const body = item.body || item.text || item.content;
    if (body) {
        const paragraph = document.createElement("p");
        paragraph.textContent = body;
        element.appendChild(paragraph);
    }

    return element;
}

async function renderBlock(target, rawItem) {
    const item = normalizeBlock(rawItem);
    if (!item) return;

    try {
        if (item.html) {
            appendHtml(target, await loadText(item.html));
        } else if (item.image || item.src || IMAGE_PATTERN.test(item.url || "")) {
            target.appendChild(imageBlock(item));
        } else if (item.embed || item.code) {
            const element = block("embed-block", item);
            appendHtml(element, item.embed || item.code);
            target.appendChild(element);
        } else if (item.iframe || item.page) {
            const element = block("iframe-block", item);
            const iframe = document.createElement("iframe");
            iframe.className = "block-iframe";
            iframe.src = item.iframe || item.page;
            iframe.title = item.title || "Embedded content";
            iframe.loading = "lazy";
            if (item.width) iframe.width = item.width;
            if (item.height) iframe.height = item.height;
            const wrap = document.createElement("div");
            wrap.className = "block-iframe-wrap";
            const cover = document.createElement("div");
            cover.className = "block-iframe-cover";
            cover.textContent = "Loading…";
            const done = () => { cover.classList.add("is-loaded"); cover.textContent = ""; cover.style.pointerEvents = "none"; };
            iframe.addEventListener("load", done, { once: true });
            iframe.addEventListener("error", () => { cover.textContent = ""; }, { once: true });
            setTimeout(done, 5000);
            wrap.append(iframe, cover);
            element.appendChild(wrap);
            target.appendChild(element);
        } else if (item.title || item.body || item.text || item.content) {
            target.appendChild(textBlock(item));
        }
    } catch (error) {
        console.warn("Block failed:", item, error);
    }
}

async function buildBlock(rawItem) {
    const fragment = document.createDocumentFragment();
    await renderBlock(fragment, rawItem);
    return fragment;
}

async function renderBlocks(target, items = [], page = "landing") {
    if (!target) return;
    const filtered = items.filter(item => isEnabled(item, page));
    const rendered = await Promise.all(filtered.map(buildBlock));
    target.replaceChildren(...rendered);
}

export function createLandingBlockShell(root) {
    root.innerHTML = `
        <div id="blocks-shell" class="blocks-shell">
            <aside class="blocks-side"><div id="blocks-left" class="blocks-column"></div></aside>
            <main class="blocks-main"><div id="blocks-center" class="blocks-column"></div><div id="blocks-reader"></div></main>
            <aside class="blocks-side"><div id="blocks-right" class="blocks-column"></div></aside>
        </div>
    `;
}

function optionContainer(options, name, fallbackSelector) {
    if (Object.prototype.hasOwnProperty.call(options, name)) {
        const value = options[name];
        if (value === null) return null;
        if (typeof value === "string") return document.querySelector(value);
        return value;
    }
    if (!fallbackSelector) return null;
    return document.querySelector(fallbackSelector);
}

function itemsForPlacement(config, placement) {
    const raw = config?.[placement];
    if (!Array.isArray(raw)) return [];
    return raw.slice().sort((a, b) => (normalizeBlock(a)?.order ?? 0) - (normalizeBlock(b)?.order ?? 0));
}

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
            if (import.meta.env.DEV) state.target.__railDiagnostics = {
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

function refreshReaderRails(containers) {
    return createFiniteRailSession(containers);
}

export async function renderBlocksIntoContainers(options = {}) {
    const page = options.page || "landing";
    const config = options.blocksData || blocksData || {};
    const containers = {
        left: optionContainer(options, "left", "#blocks-left"),
        center: optionContainer(options, "center", "#blocks-center"),
        right: optionContainer(options, "right", "#blocks-right")
    };

    await Promise.all(PLACEMENTS.map(placement => renderBlocks(
        containers[placement],
        itemsForPlacement(config, placement),
        page
    )));
    if (page === "reader") return refreshReaderRails(containers);
    return null;
}

export class Blocks {
    static async start(options = {}) {
        if (Object.keys(options).length === 0) {
            const root = document.getElementById("blocks-root");
            if (!root) return;
            createLandingBlockShell(root);
            await renderBlocksIntoContainers({ page: "landing" });
            return;
        }

        return renderBlocksIntoContainers(options);
    }
}
