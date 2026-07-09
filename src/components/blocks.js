import blocksData from "../data/blocks.json";

const IMAGE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const HTML_PATTERN = /\.html?(\?.*)?$/i;

async function loadText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

function normalizeBlock(item) {
    if (typeof item !== "string") return item || null;

    const value = item.trim();
    if (value.startsWith("<")) return { embed: value };
    if (IMAGE_PATTERN.test(value)) return { image: value };
    if (HTML_PATTERN.test(value)) return { html: value };
    return { text: value };
}

function block(className) {
    const element = document.createElement("section");
    element.className = ["site-block", className].filter(Boolean).join(" ");
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
    const element = block("image-block");
    const image = document.createElement("img");
    image.className = "block-image";
    image.src = item.image || item.src || item.url;
    image.alt = item.alt || item.title || "";
    image.loading = item.loading || "lazy";
    image.decoding = "async";

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
    const element = block("text-block");
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
            const element = block("embed-block");
            appendHtml(element, item.embed || item.code);
            target.appendChild(element);
        } else if (item.iframe || item.page) {
            const element = block("iframe-block");
            const iframe = document.createElement("iframe");
            iframe.className = "block-iframe";
            iframe.src = item.iframe || item.page;
            iframe.title = item.title || "Embedded content";
            iframe.loading = "lazy";
            element.appendChild(iframe);
            target.appendChild(element);
        } else if (item.title || item.body || item.text || item.content) {
            target.appendChild(textBlock(item));
        }
    } catch (error) {
        console.warn("Block failed:", item, error);
    }
}

async function renderBlocks(target, items = []) {
    target.replaceChildren();
    for (const item of items) await renderBlock(target, item);
}

function renderShell(root) {
    root.innerHTML = `
        <div id="blocks-shell" class="blocks-shell">
            <aside class="blocks-side"><div id="blocks-left" class="blocks-column"></div></aside>
            <main class="blocks-main"><div id="blocks-center" class="blocks-column"></div><div id="blocks-reader"></div></main>
            <aside class="blocks-side"><div id="blocks-right" class="blocks-column"></div></aside>
        </div>
    `;
}

export class Blocks {
    static async start() {
        const root = document.getElementById("blocks-root");
        if (!root) return;

        renderShell(root);
        await renderBlocks(document.getElementById("blocks-left"), blocksData.left || []);
        await renderBlocks(document.getElementById("blocks-right"), blocksData.right || []);

        if (!document.body.classList.contains("reader-active")) {
            await renderBlocks(document.getElementById("blocks-center"), blocksData.center || []);
        }
    }
}
