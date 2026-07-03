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
            <div class="search-box is-compact">
                <input class="search-input" type="search" placeholder="Search..." />
                <div class="search-results" hidden></div>
            </div>
        `;

        const box = mount.querySelector(".search-box");
        const input = mount.querySelector(".search-input");
        const results = mount.querySelector(".search-results");

        let index = [];

        try {
            const response = await fetch(SEARCH_INDEX_URL);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            index = (await response.json()).entries || [];
        } catch (error) {
            console.warn("Search index failed to load.", error);
        }

        // -----------------------------
        // HOVER → EXPAND
        // -----------------------------
        box.addEventListener("mouseenter", () => {
            box.classList.remove("is-compact");
            input.focus();
        });

        // -----------------------------
        // LEAVE → COLLAPSE (if empty)
        // -----------------------------
        box.addEventListener("mouseleave", () => {
            if (!input.value) {
                box.classList.add("is-compact");
                hide(results);
            }
        });

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

        input.addEventListener("focus", () => {
            box.classList.remove("is-compact");
        });
    }
}
