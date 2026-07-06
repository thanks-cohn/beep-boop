import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import rotunda from "../data/rotunda.json";
import storage from "../data/storage.json";
import "../styles/rotunda.css";

function openReader(card) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: {
            source: card.source,
            work: card.slug,
            chapter: card.chapter
        }
    }));
}

function installRotundaArrows(container) {
    const stepPx = 180;
    const holdSpeedPxPerSecond = 360;
    let direction = 0;
    let animationFrame = 0;
    let lastTime = 0;

    function stopHold() {
        direction = 0;
        lastTime = 0;
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }
    }

    function animateHold(time) {
        if (!direction) return;
        if (!lastTime) lastTime = time;

        const delta = Math.min(48, time - lastTime);
        lastTime = time;
        container.scrollLeft += direction * holdSpeedPxPerSecond * (delta / 1000);
        animationFrame = requestAnimationFrame(animateHold);
    }

    function createArrow(className, label, arrowDirection) {
        const button = document.createElement("button");
        button.className = `rotunda-arrow ${className}`;
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.textContent = arrowDirection < 0 ? "‹" : "›";

        button.addEventListener("click", () => {
            container.scrollBy({ left: arrowDirection * stepPx, behavior: "smooth" });
        });

        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            direction = arrowDirection;
            lastTime = 0;
            if (!animationFrame) {
                animationFrame = requestAnimationFrame(animateHold);
            }
        });

        for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) {
            button.addEventListener(eventName, stopHold);
        }

        return button;
    }

    container.append(
        createArrow("rotunda-arrow-left", "Slide rotunda left", -1),
        createArrow("rotunda-arrow-right", "Slide rotunda right", 1)
    );
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

        const track = document.createElement("div");
        track.className = "rotunda-track";

        for (const card of cards) {
            const button = document.createElement("button");
            button.className = "rotunda-card";
            button.type = "button";
            button.setAttribute("aria-label", `Open ${card.title} volume 1 chapter 1`);

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

            button.addEventListener("click", () => openReader(card));

            frame.append(img, overlay);
            button.append(frame, title);
            track.appendChild(button);
        }

        container.replaceChildren(track);
        installRotundaArrows(container);
    }
}
