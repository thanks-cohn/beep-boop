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

                const filename =
                    `${String(1).padStart(manifest.padding, "0")}.${manifest.extension}`;

                cards.push({
                    title: work.display,
                    slug: work.slug,
                    source: work.source,
                    chapter,
                    image: `${manifest.base_url}/${filename}`
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
    }
}
