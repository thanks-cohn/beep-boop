import { normalize } from "../utils/normalize.js";

const SEARCH_INDEX_URL = "/data/search.index.json";
let hideTimer = null;

function hide(results) {
    results.hidden = true;
    results.innerHTML = "";
}

function scheduleHide(results) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hide(results), 2500);
}

function emitOpen(entry) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: entry
    }));
}

function renderResults(container, results, input) {
    container.innerHTML = "";
    container.hidden = results.length === 0;

    for (const r of results) {
        const el = document.createElement("div");
        el.className = "search-result";
        el.textContent = r.display;

        el.addEventListener("click", () => {
            hide(container);
            input.value = "";
            emitOpen(r);
        });

        container.appendChild(el);
    }
}

export class Search {
    static async start() {
        const mount = document.querySelector(".landing-search");
        if (!mount) return;

        mount.innerHTML = `
            <div class="search-box">
                <span class="search-icon" aria-hidden="true">⌕</span>
                <input class="search-input" type="search" placeholder="Search Animeplex..." aria-label="Search Animeplex" autocomplete="off" />
                <div class="search-results" role="listbox" hidden></div>
            </div>
        `;

        const input = mount.querySelector(".search-input");
        const results = mount.querySelector(".search-results");

        const index = (await fetch(SEARCH_INDEX_URL).then(r => r.json())).entries || [];

        // -----------------------------
        // INPUT SEARCH
        // -----------------------------
        input.addEventListener("input", () => {
            const q = normalize(input.value);
            const tokens = q.split(" ").filter(Boolean);

            if (!tokens.length) {
                hide(results);
                return;
            }

            const matches = index.filter(e =>
                tokens.every(t => e.normalized?.includes(t))
            );

            renderResults(results, matches.slice(0, 12), input);
            scheduleHide(results);
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                input.value = "";
                hide(results);
                input.blur();
            }
        });
    }
}
