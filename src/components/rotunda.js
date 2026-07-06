import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import rotunda from "../data/rotunda.json";
import storage from "../data/storage.json";
import "../styles/rotunda.css";

const ROTUNDA_HOLD_INTERVAL_MS = 420;

function openReader(card) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: {
            source: card.source,
            work: card.slug,
            chapter: card.chapter
        }
    }));
}

function installRotundaControls(container, stepActiveCard) {
    let stepTimer = null;
    let activeDirection = 0;

    const stopStepping = () => {
        activeDirection = 0;

        if (stepTimer) {
            window.clearInterval(stepTimer);
            stepTimer = null;
        }
    };

    const startStepping = direction => {
        stopStepping();
        activeDirection = direction;
        stepActiveCard(direction);

        stepTimer = window.setInterval(() => {
            if (activeDirection) stepActiveCard(activeDirection);
        }, ROTUNDA_HOLD_INTERVAL_MS);
    };

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
            if (event.detail === 0) {
                stepActiveCard(direction);
            }
        });
        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            startStepping(direction);
        });
        button.addEventListener("pointerup", stopStepping);
        button.addEventListener("pointercancel", stopStepping);
        button.addEventListener("pointerleave", stopStepping);

        return button;
    };

    controls.append(
        makeArrow(-1, "Show previous rotunda work", "‹"),
        makeArrow(1, "Show next rotunda work", "›")
    );
    container.appendChild(controls);

    window.addEventListener("blur", stopStepping);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopStepping();
    });
}

function centerCard(card) {
    card.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest"
    });
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

        for (const [index, card] of cards.entries()) {
            const button = document.createElement("button");
            button.className = "rotunda-card";
            button.type = "button";
            button.setAttribute("aria-label", `Open ${card.title} volume 1 chapter 1`);
            button.dataset.rotundaIndex = String(index);

            const frame = document.createElement("div");
            frame.className = "rotunda-cover-frame";

            const img = document.createElement("img");
            img.className = "rotunda-cover";
            img.src = card.image;
            img.alt = card.title;

            const reflection = document.createElement("img");
            reflection.className = "rotunda-cover-reflection";
            reflection.src = card.image;
            reflection.alt = "";
            reflection.setAttribute("aria-hidden", "true");

            const overlay = document.createElement("div");
            overlay.className = "rotunda-overlay";
            overlay.innerHTML = `
                <span class="rotunda-overlay-title">${card.title}</span>
                <span class="rotunda-overlay-action">Start Volume 1 · Chapter 1</span>
            `;

            const title = document.createElement("div");
            title.className = "rotunda-title";
            title.textContent = card.title;

            button.addEventListener("click", () => openReader(card));

            frame.append(img, reflection, overlay);
            button.append(frame, title);
            track.appendChild(button);
            cardButtons.push(button);
        }

        let activeIndex = 0;

        const setActiveCard = (nextIndex, shouldCenter = true) => {
            if (!cardButtons.length) return;
            activeIndex = (nextIndex + cardButtons.length) % cardButtons.length;

            cardButtons.forEach((button, index) => {
                const isActive = index === activeIndex;
                button.classList.toggle("rotunda-card-active", isActive);
                button.setAttribute("aria-current", isActive ? "true" : "false");
            });

            if (shouldCenter) centerCard(cardButtons[activeIndex]);
        };

        const stepActiveCard = direction => setActiveCard(activeIndex + direction);

        viewport.appendChild(track);
        container.replaceChildren(viewport);
        installRotundaControls(container, stepActiveCard);
        setActiveCard(0, false);
    }
}
