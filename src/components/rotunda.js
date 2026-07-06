import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import rotunda from "../data/rotunda.json";
import storage from "../data/storage.json";
import "../styles/rotunda.css";

const ROTUNDA_VISIBLE_EDGE = 3;
const ROTUNDA_SWIPE_THRESHOLD = 42;

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

export class Rotunda {
    static async start() {
        const container = document.querySelector(".landing-rotunda");
        if (!container) return;

        const environment = storage.active;
        const sources = storage[environment]?.sources ?? {};
        const works = rotunda.works ?? [];
        const cards = [];

        for (const work of works) {
            try {
                const chapter = work.chapters?.[0];

                if (!chapter) {
                    console.warn(`Rotunda: skipping "${work.slug}" (no chapters).`);
                    continue;
                }

                if (!sources[work.source]) {
                    console.warn(`Rotunda: skipping "${work.slug}" (unknown source).`);
                    continue;
                }

                const manifestUrl = Storage.manifest(work.source, work.slug, chapter);
                const response = await fetch(manifestUrl, { cache: "no-store" });

                if (!response.ok) {
                    console.warn(`Rotunda: skipping "${work.slug}" (${response.status}).`);
                    continue;
                }

                let manifest = await response.json();
                manifest = resolveManifest(manifest, work.source, work.slug, chapter);

                cards.push({
                    title: work.display,
                    slug: work.slug,
                    source: work.source,
                    chapter,
                    image: `${manifest.base_url}/thumb.webp`
                });
            } catch (error) {
                console.warn(`Rotunda: failed to load "${work.slug}".`, error);
            }
        }

        console.log(`Rotunda loaded ${cards.length} works.`);

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

        for (const [index, card] of cards.entries()) {
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
            track.appendChild(button);
            cardButtons.push(button);
        }

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
