import { normalize } from "../utils/normalize.js";

const SEARCH_INDEX_URL = "/data/search.index.json";
let hideTimer = null;
let searchIndexPromise = null;

function loadSearchIndex() {
    if (!searchIndexPromise) {
        searchIndexPromise = fetch(SEARCH_INDEX_URL)
            .then(response => {
                if (!response.ok) throw new Error(`Search index failed: ${response.status}`);
                return response.json();
            })
            .then(data => data.entries || []);
    }

    return searchIndexPromise;
}

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

function renderResults(container, matches) {
    container.hidden = matches.length === 0;
    container.replaceChildren(...matches.map((entry, index) => {
        const el = document.createElement("div");
        el.className = "search-result";
        el.textContent = entry.display;
        el.dataset.resultIndex = String(index);
        return el;
    }));
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

        let activeMatches = [];

        input.addEventListener("focus", () => {
            loadSearchIndex().catch(error => console.warn("search index failed", error));
        }, { once: true });

        results.addEventListener("click", event => {
            if (!(event.target instanceof Element)) return;
            const result = event.target.closest(".search-result");
            if (!result) return;

            const entry = activeMatches[Number(result.dataset.resultIndex)];
            if (!entry) return;

            hide(results);
            input.value = "";
            emitOpen(entry);
        });

        // -----------------------------
        // INPUT SEARCH
        // -----------------------------
        input.addEventListener("input", async () => {
            const query = input.value;
            const q = normalize(query);
            const tokens = q.split(" ").filter(Boolean);

            if (!tokens.length) {
                activeMatches = [];
                hide(results);
                return;
            }

            const index = await loadSearchIndex();

            if (query !== input.value) return;

            activeMatches = [];
            for (const entry of index) {
                if (tokens.every(token => entry.normalized?.includes(token))) {
                    activeMatches.push(entry);
                    if (activeMatches.length === 12) break;
                }
            }

            renderResults(results, activeMatches);
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
