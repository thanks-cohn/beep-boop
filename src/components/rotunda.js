import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import { loadWork } from "../storage/work_manifest.js";
import rotunda from "../data/rotunda.json";
import storage from "../data/storage.json";
import "../styles/rotunda.css";

const ROTUNDA_VISIBLE_EDGE = 3;
const ROTUNDA_SWIPE_THRESHOLD = 42;

function warnDev(message, error) {
    if (!import.meta.env.DEV) return;
    if (error) console.warn(message, error);
    else console.warn(message);
}

function openReader(card) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: {
            source: card.source,
            work: card.slug,
            chapter: card.chapter
        }
    }));
}

function normalizeIndex(index, total) {
    if (!total) return 0;
    return (index + total) % total;
}

function signedDistance(index, activeIndex, total) {
    if (!total) return 0;

    let distance = index - activeIndex;
    const half = total / 2;

    if (distance > half) distance -= total;
    if (distance < -half) distance += total;

    return distance;
}

function clampRotundaPosition(distance) {
    if (distance > ROTUNDA_VISIBLE_EDGE) return ROTUNDA_VISIBLE_EDGE;
    if (distance < -ROTUNDA_VISIBLE_EDGE) return -ROTUNDA_VISIBLE_EDGE;
    return distance;
}

function installRotundaControls(container, moveBy) {
    const controls = document.createElement("div");
    controls.className = "rotunda-controls";
    controls.setAttribute("aria-label", "Rotunda navigation");

    const makeArrow = (direction, label, glyph) => {
        const button = document.createElement("button");
        button.className = `rotunda-arrow rotunda-arrow-${direction < 0 ? "left" : "right"}`;
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.textContent = glyph;

        button.addEventListener("click", event => {
            event.preventDefault();
            moveBy(direction);
        });

        return button;
    };

    controls.append(
        makeArrow(-1, "Show previous rotunda work", "‹"),
        makeArrow(1, "Show next rotunda work", "›")
    );
    container.appendChild(controls);
}

function uniqueUrls(urls) {
    return [...new Set(urls.filter(Boolean))];
}

function rotundaWorkDefaults(work, sources, defaultSource) {
    const source = work.source || defaultSource;
    if (!sources[source]) {
        warnDev(`Rotunda: skipping "${work.slug}" (unknown source).`);
        return null;
    }

    const sourceThumb = `${Storage.work(source, work.slug)}/thumb.webp`;
    return { source, sourceThumb };
}

const firstPageThumbnailCache = new Map();

async function firstPageThumbnail(card) {
    const manifestUrl = Storage.manifest(card.source, card.slug, card.chapter);
    if (firstPageThumbnailCache.has(manifestUrl)) return firstPageThumbnailCache.get(manifestUrl);

    const promise = fetch(manifestUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(json => {
            const manifest = resolveManifest(json, card.source, card.slug, card.chapter);
            const padding = manifest.padding ?? 3;
            const extension = manifest.extension || "webp";

            return `${manifest.base_url}/${String(1).padStart(padding, "0")}.${extension}`;
        });

    firstPageThumbnailCache.set(manifestUrl, promise);
    return promise;
}

function installThumbnailFallback(img, button, card) {
    let nextIndex = 1;
    let triedFirstPage = false;

    const setImage = url => {
        img.style.visibility = "visible";
        img.src = url;
        button.style.setProperty("--rotunda-reflection-image", `url("${url}")`);
    };

    img.addEventListener("error", async () => {
        img.style.visibility = "hidden";

        const nextUrl = card.imageCandidates[nextIndex];
        if (nextUrl) {
            warnDev(`Rotunda: thumbnail failed for "${card.slug}"; trying fallback. ${img.src}`);
            nextIndex += 1;
            setImage(nextUrl);
            return;
        }

        if (triedFirstPage) {
            warnDev(`Rotunda: all thumbnails failed for "${card.slug}".`);
            return;
        }

        triedFirstPage = true;

        try {
            warnDev(`Rotunda: thumbnail failed for "${card.slug}"; trying first page fallback.`);
            setImage(await firstPageThumbnail(card));
        } catch (error) {
            warnDev(`Rotunda: first page thumbnail fallback failed for "${card.slug}".`, error);
        }
    });
}

export class Rotunda {
    static async start() {
        const container = document.querySelector(".landing-rotunda");
        if (!container) return;

        const environment = storage.active;
        const sources = storage[environment]?.sources ?? {};
        const works = rotunda.works ?? [];
        const defaultSource = rotunda.default?.source || "e";
        const cards = (await Promise.all(works.map(async work => {
            const defaults = rotundaWorkDefaults(work, sources, defaultSource);
            if (!defaults) return null;

            try {
                const resolvedWork = await loadWork(work.slug, rotunda);
                const source = resolvedWork?.source || defaults.source;

                if (!sources[source]) {
                    warnDev(`Rotunda: skipping "${work.slug}" (unknown source).`);
                    return null;
                }

                const chapter = resolvedWork?.chapters?.[0];

                if (!chapter) {
                    warnDev(`Rotunda: skipping "${work.slug}" (no chapters).`);
                    return null;
                }

                const sourceThumb = source === defaults.source
                    ? defaults.sourceThumb
                    : `${Storage.work(source, work.slug)}/thumb.webp`;
                const imageCandidates = uniqueUrls([
                    work.thumb,
                    resolvedWork.thumb,
                    sourceThumb
                ]);

                return {
                    title: resolvedWork.display || work.display || work.slug,
                    slug: work.slug,
                    source,
                    chapter,
                    imageCandidates,
                    image: imageCandidates[0] || sourceThumb
                };
            } catch (error) {
                warnDev(`Rotunda: failed to load "${work.slug}".`, error);
                return null;
            }
        }))).filter(Boolean);

        if (import.meta.env.DEV) console.log(`Rotunda loaded ${cards.length} works.`);

        const viewport = document.createElement("div");
        viewport.className = "rotunda-scroll-viewport";

        const track = document.createElement("div");
        track.className = "rotunda-track";

        const cardButtons = [];
        let activeIndex = 0;
        let touchStartX = null;
        let touchStartY = null;
        let touchMoved = false;
        let isRotundaHovered = false;

        const setActiveCard = index => {
            activeIndex = normalizeIndex(index, cardButtons.length);
            track.style.setProperty("--rotunda-active-index", activeIndex);

            cardButtons.forEach((button, buttonIndex) => {
                const distance = signedDistance(buttonIndex, activeIndex, cardButtons.length);
                const position = clampRotundaPosition(distance);
                const absPosition = Math.abs(position);
                const isActive = distance === 0;

                button.dataset.rotundaPosition = String(position);
                button.dataset.rotundaDistance = String(absPosition);
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-current", isActive ? "true" : "false");
                button.tabIndex = absPosition <= 2 ? 0 : -1;
            });
        };

        const moveBy = direction => {
            setActiveCard(activeIndex + direction);
        };

        const isTypingTarget = target => {
            if (!(target instanceof Element)) return false;
            const tagName = target.tagName.toLowerCase();
            return tagName === "input" ||
                tagName === "textarea" ||
                tagName === "select" ||
                target.isContentEditable ||
                Boolean(target.closest("[contenteditable='true']"));
        };

        const handleRotundaKeydown = event => {
            if (!isRotundaHovered || isTypingTarget(event.target)) return;

            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!direction) return;

            // Keyboard coverflow movement is hover-scoped so page/search arrow-key behavior
            // stays untouched until the user is intentionally over the rotunda showcase.
            event.preventDefault();
            moveBy(direction);
        };

        container.addEventListener("pointerenter", () => {
            isRotundaHovered = true;
        });

        container.addEventListener("pointerleave", () => {
            isRotundaHovered = false;
        });

        window.addEventListener("keydown", handleRotundaKeydown);

        for (const card of cards) {
            const button = document.createElement("button");
            button.className = "rotunda-card";
            button.type = "button";
            button.setAttribute("aria-label", `Open ${card.title} volume 1 chapter 1`);
            button.style.setProperty("--rotunda-reflection-image", `url("${card.image}")`);

            const frame = document.createElement("div");
            frame.className = "rotunda-cover-frame";

            const img = document.createElement("img");
            img.className = "rotunda-cover";
            img.src = card.image;
            img.alt = card.title;
            installThumbnailFallback(img, button, card);

            const overlay = document.createElement("div");
            overlay.className = "rotunda-overlay";
            overlay.innerHTML = `
                <span class="rotunda-overlay-title">${card.title}</span>
                <span class="rotunda-overlay-action">Start Volume 1 · Chapter 1</span>
            `;

            const title = document.createElement("div");
            title.className = "rotunda-title";
            title.textContent = card.title;

            button.addEventListener("click", () => {
                if (touchMoved) return;
                openReader(card);
            });

            frame.append(img, overlay);
            button.append(frame, title);
            cardButtons.push(button);
        }

        track.append(...cardButtons);

        viewport.addEventListener("pointerdown", event => {
            if (event.pointerType === "mouse") return;
            touchStartX = event.clientX;
            touchStartY = event.clientY;
            touchMoved = false;
        });

        viewport.addEventListener("pointerup", event => {
            if (touchStartX === null || touchStartY === null) return;

            const deltaX = event.clientX - touchStartX;
            const deltaY = event.clientY - touchStartY;
            touchStartX = null;
            touchStartY = null;

            if (Math.abs(deltaX) < ROTUNDA_SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) {
                return;
            }

            touchMoved = true;
            moveBy(deltaX < 0 ? 1 : -1);
            window.setTimeout(() => {
                touchMoved = false;
            }, 0);
        });

        viewport.appendChild(track);
        container.replaceChildren(viewport);
        setActiveCard(0);
        installRotundaControls(container, moveBy);
    }
}
