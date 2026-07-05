import blocksData from "../data/blocks.json";

const IMAGE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const HTML_FRAGMENT_PATTERN = /\.html?(\?.*)?$/i;
const SIDEBAR_REFRESH_INTERVAL_MS = 90 * 1000;

let sidebarRefreshTimer = null;
let sidebarRefreshRun = 0;

async function loadText(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
}

function splitSideBlocks(items = []) {
    if (!items.length) {
        return { flow: [], rail: null };
    }

    return {
        flow: items.slice(0, -1),
        rail: items[items.length - 1]
    };
}

function isLikelyHtml(value) {
    return typeof value === "string" && value.trim().startsWith("<");
}

function isLikelyImageUrl(value) {
    return typeof value === "string" && IMAGE_PATTERN.test(value.trim());
}

function isLikelyHtmlFragmentUrl(value) {
    return typeof value === "string" && HTML_FRAGMENT_PATTERN.test(value.trim());
}

function normalizeBlock(item) {
    if (typeof item === "string") {
        const value = item.trim();

        if (isLikelyHtml(value)) {
            return { embed: value };
        }

        if (isLikelyImageUrl(value)) {
            return { image: value };
        }

        if (isLikelyHtmlFragmentUrl(value)) {
            return { html: value };
        }

        return { text: value };
    }

    return item || null;
}

function makeBlock(className = "") {
    const block = document.createElement("section");
    block.className = ["site-block", "json-block", className].filter(Boolean).join(" ");
    return block;
}

function appendExecutableHtml(target, html) {
    const template = document.createElement("template");
    template.innerHTML = html;

    for (const oldScript of template.content.querySelectorAll("script")) {
        const newScript = document.createElement("script");

        for (const attr of oldScript.attributes) {
            newScript.setAttribute(attr.name, attr.value);
        }

        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
    }

    target.appendChild(template.content.cloneNode(true));
}

function renderImageBlock(item) {
    const block = makeBlock("image-block");
    const image = document.createElement("img");

    image.src = item.image || item.src || item.url;
    image.alt = item.alt || item.title || "";
    image.loading = item.loading || "lazy";
    image.decoding = "async";
    image.className = "block-image";

    if (item.width) image.width = item.width;
    if (item.height) image.height = item.height;

    if (item.href || item.link) {
        const link = document.createElement("a");
        link.href = item.href || item.link;
        link.target = item.target || "_blank";
        link.rel = item.rel || "noopener noreferrer";
        link.appendChild(image);
        block.appendChild(link);
    } else {
        block.appendChild(image);
    }

    return block;
}

function renderIframeBlock(item) {
    const block = makeBlock("iframe-block");
    const iframe = document.createElement("iframe");

    iframe.src = item.iframe || item.page || item.url;
    iframe.title = item.title || "Embedded content";
    iframe.loading = item.loading || "lazy";
    iframe.className = "block-iframe";
    iframe.referrerPolicy = item.referrerPolicy || "no-referrer-when-downgrade";

    if (item.allow) iframe.allow = item.allow;
    if (item.sandbox) iframe.sandbox = item.sandbox;

    block.appendChild(iframe);
    return block;
}

function renderEmbedBlock(item) {
    const block = makeBlock("embed-block");
    appendExecutableHtml(block, item.embed || item.ad || item.code || "");
    return block;
}

function renderTextBlock(item) {
    const block = makeBlock("text-block");

    if (item.title) {
        const title = document.createElement(item.headingLevel || "h3");
        title.textContent = item.title;
        block.appendChild(title);
    }

    const body = item.body || item.text || item.content;

    if (body) {
        const paragraph = document.createElement("p");
        paragraph.textContent = body;
        block.appendChild(paragraph);
    }

    return block;
}

async function renderBlock(target, rawItem) {
    const item = normalizeBlock(rawItem);
    if (!item) return;

    try {
        if (item.html) {
            const html = await loadText(item.html);
            appendExecutableHtml(target, html);
            return;
        }

        if (item.image || item.src || isLikelyImageUrl(item.url)) {
            target.appendChild(renderImageBlock(item));
            return;
        }

        if (item.embed || item.ad || item.code) {
            target.appendChild(renderEmbedBlock(item));
            return;
        }

        if (item.iframe || item.page || item.url) {
            target.appendChild(renderIframeBlock(item));
            return;
        }

        if (item.title || item.body || item.text || item.content) {
            target.appendChild(renderTextBlock(item));
        }
    } catch (error) {
        console.warn("Block failed:", item, error);
    }
}

async function renderBlocks(target, items = []) {
    target.replaceChildren();

    for (const item of items) {
        await renderBlock(target, item);
    }
}

async function renderRail(target, item) {
    target.replaceChildren();
    await renderBlock(target, item);
}

async function renderSidebars(runId, left, right) {
    if (runId !== sidebarRefreshRun) return;

    await renderBlocks(document.getElementById("blocks-left-flow"), left.flow);
    if (runId !== sidebarRefreshRun) return;

    await renderRail(document.getElementById("blocks-left-rail"), left.rail);
    if (runId !== sidebarRefreshRun) return;

    await renderBlocks(document.getElementById("blocks-right-flow"), right.flow);
    if (runId !== sidebarRefreshRun) return;

    await renderRail(document.getElementById("blocks-right-rail"), right.rail);
}

function stopSidebarRefresh() {
    if (sidebarRefreshTimer) {
        clearInterval(sidebarRefreshTimer);
        sidebarRefreshTimer = null;
    }

    sidebarRefreshRun += 1;
}

function startSidebarRefresh(left, right) {
    stopSidebarRefresh();

    const runId = sidebarRefreshRun;
    let isRefreshing = false;

    sidebarRefreshTimer = window.setInterval(async () => {
        if (isRefreshing || !document.getElementById("blocks-root")) return;

        isRefreshing = true;

        try {
            await renderSidebars(runId, left, right);
        } finally {
            isRefreshing = false;
        }
    }, SIDEBAR_REFRESH_INTERVAL_MS);
}

function renderShell(root) {
    root.innerHTML = `
        <div id="blocks-shell" class="blocks-shell">
            <aside class="col left blocks-side">
                <div id="blocks-left-flow" class="blocks-column blocks-side-flow"></div>
                <div id="blocks-left-rail" class="blocks-side-rail"></div>
            </aside>

            <main class="col center blocks-main">
                <div id="blocks-center" class="blocks-column"></div>
                <div id="blocks-reader"></div>
            </main>

            <aside class="col right blocks-side">
                <div id="blocks-right-flow" class="blocks-column blocks-side-flow"></div>
                <div id="blocks-right-rail" class="blocks-side-rail"></div>
            </aside>
        </div>
    `;
}

export class Blocks {
    static async start() {
        const root = document.getElementById("blocks-root");
        if (!root) return;

        renderShell(root);

        const left = splitSideBlocks(blocksData.left || []);
        const right = splitSideBlocks(blocksData.right || []);
        const center = blocksData.center || [];

        stopSidebarRefresh();
        const runId = sidebarRefreshRun;

        await renderSidebars(runId, left, right);

        if (!document.body.classList.contains("reader-active")) {
            await renderBlocks(document.getElementById("blocks-center"), center);
        }

        startSidebarRefresh(left, right);
    }
}
