import blocksData from "../data/blocks.json";

const IMAGE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const HTML_PATTERN = /\.html?(\?.*)?$/i;
const PLACEMENTS = ["left", "center", "right"];

import { fetchTextWithRetry } from "../utils/retry.js";

async function loadText(path) {
    return fetchTextWithRetry(path, { retries: 6, baseDelay: 250, maxDelay: 6000 });
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
            wrapIframe(element, iframe);
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
}


import { enhanceRail, wrapExistingIframes, wrapIframe } from "./rail.js";

export class Blocks {
    static async start(options = {}) {
        if (Object.keys(options).length === 0) {
            const root = document.getElementById("blocks-root");
            if (!root) return;
            createLandingBlockShell(root);
            await renderBlocksIntoContainers({ page: "landing" });
            const cleanups = [enhanceRail(document.getElementById("blocks-left")), enhanceRail(document.getElementById("blocks-right"))].filter(Boolean);
            return () => cleanups.forEach(cleanup => cleanup());
        }

        await renderBlocksIntoContainers(options);
        const cleanups = [enhanceRail(optionContainer(options, "left", null)), enhanceRail(optionContainer(options, "right", null))].filter(Boolean);
        return () => cleanups.forEach(cleanup => cleanup());
    }
}
