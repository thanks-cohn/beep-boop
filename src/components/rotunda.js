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

function firstImageFromManifest(manifest, source, slug, chapter) {
    const resolved = resolveManifest(manifest, source, slug, chapter);
    const padding = Number(resolved.padding) || 3;
    const extension = resolved.extension || "webp";
    const filename = `${String(1).padStart(padding, "0")}.${extension}`;

    return `${resolved.base_url}/${filename}`;
}

export class Rotunda {
    static async start() {
        const container = document.querySelector(".landing-rotunda");
        if (!container) return;

        const environment = storage.active;
        const sources = storage[environment]?.sources ?? {};
        const works = rotunda.works ?? [];
        const cards = works
            .map(work => {
                const chapter = work.chapters?.[0];

                if (!chapter) {
                    console.warn(`Rotunda: skipping "${work.slug}" (no chapters).`);
                    return null;
                }

                if (!sources[work.source]) {
                    console.warn(`Rotunda: skipping "${work.slug}" (unknown source).`);
                    return null;
                }

                return {
                    title: work.display || work.slug,
                    slug: work.slug,
                    source: work.source,
                    chapter,
                    image: "",
                };
            })
            .filter(Boolean);

        console.log(`Rotunda rendering ${cards.length} works.`);

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
            img.alt = card.title;
            img.loading = "lazy";
            img.decoding = "async";

            const fallback = document.createElement("div");
            fallback.className = "rotunda-cover-fallback";
            fallback.textContent = card.title;

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

            frame.append(fallback, img, overlay);
            button.append(frame, title);
            track.appendChild(button);
        }

        container.replaceChildren(track);

        await Promise.all(cards.map(async (card, index) => {
            try {
                const manifestUrl = Storage.manifest(card.source, card.slug, card.chapter);
                const response = await fetch(manifestUrl, { cache: "no-store" });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const contentType = response.headers.get("content-type") || "";

                if (contentType && !contentType.includes("application/json")) {
                    throw new Error(`Expected JSON manifest, got "${contentType}".`);
                }

                const manifest = await response.json();
                const image = firstImageFromManifest(manifest, card.source, card.slug, card.chapter);
                const img = track.children[index]?.querySelector(".rotunda-cover");

                if (img) {
                    img.src = image;
                    img.addEventListener("load", () => {
                        img.classList.add("is-loaded");
                    }, { once: true });
                }
            } catch (error) {
                console.warn(`Rotunda: cover unavailable for "${card.slug}".`, error);
            }
        }));
    }
}
