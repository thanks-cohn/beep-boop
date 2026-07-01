import { Storage } from "../storage/storage.js";

export class Reader {
    static async start(work, chapter) {
        const container = document.getElementById("reader-container");

        if (!container) return;

        container.innerHTML = `<div class="reader-loading">Loading...</div>`;

        try {
            const source =
                new URLSearchParams(window.location.search).get("source") || "e";

            const manifestUrl = Storage.manifest(source, work, chapter);

            const manifest = await fetch(manifestUrl).then(r => r.json());

            const pages = [];

            for (let i = 1; i <= manifest.pages; i++) {
                const file = `${String(i).padStart(manifest.padding, "0")}.${manifest.extension}`;

                const img = document.createElement("img");
                img.src = `${manifest.base_url}/${file}`;
                img.className = "reader-page";
                img.loading = "lazy";

                pages.push(img);
            }

            container.innerHTML = `
                <div class="reader">
                    <h2>${work}</h2>
                    <h3>${chapter}</h3>
                    <div class="reader-pages"></div>
                </div>
            `;

            const root = container.querySelector(".reader-pages");

            for (const img of pages) {
                root.appendChild(img);
            }

            window.scrollTo({ top: 0, behavior: "instant" });

        } catch (err) {
            console.error("Reader failed:", err);

            container.innerHTML = `
                <div class="reader-error">
                    <h2>Failed to load chapter</h2>
                </div>
            `;
        }
    }
}

window.addEventListener("load-reader", async (e) => {
    const entry = e.detail;

    const container = document.getElementById("reader-view");

    if (!container) return;

    const manifestUrl = entry.manifest_url;

    const manifest = await fetch(manifestUrl).then(r => r.json());

    container.innerHTML = "";

    for (let i = 1; i <= manifest.pages; i++) {
        const img = document.createElement("img");

        img.loading = "lazy";
        img.decoding = "async";

        img.src = `${manifest.base_url}/${String(i).padStart(manifest.padding, "0")}.${manifest.extension}`;

        container.appendChild(img);
    }

    container.scrollIntoView({ behavior: "smooth", block: "start" });
});

