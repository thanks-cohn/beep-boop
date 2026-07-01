import { normalize } from "../utils/normalize.js";

const SEARCH_INDEX_URL = "/data/search.index.json";

function emitOpen(entry) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: entry
    }));
}

function renderResults(container, results) {
    container.replaceChildren();

    for (const result of results) {
        const link = document.createElement("a");

        link.className = "search-result";
        link.href = "#"; // IMPORTANT: no navigation
        link.textContent = result.display;

        link.addEventListener("click", (e) => {
            e.preventDefault();
            emitOpen(result);
        });

        container.appendChild(link);
    }
}

export class Search {
    static async start() {
        const mount = document.querySelector(".landing-search");

        if (!mount) return;

        mount.innerHTML = `
            <div class="search-box">
                <input class="search-input" type="search" placeholder="Search..." />
                <div class="search-results"></div>
            </div>
        `;

        const input = mount.querySelector(".search-input");
        const results = mount.querySelector(".search-results");

        const index = await fetch(SEARCH_INDEX_URL).then(r => r.json());

        input.addEventListener("input", () => {
            const q = input.value.toLowerCase();
            const tokens = q.split(" ").filter(Boolean);

            const matches = (index.entries || []).filter(e =>
                tokens.every(t => e.normalized?.includes(t))
            );

            renderResults(results, matches.slice(0, 12));
        });
    }
}
