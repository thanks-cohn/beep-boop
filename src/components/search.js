import { normalize } from "../utils/normalize.js";
import { fetchJsonWithRetry } from "../utils/retry.js";

const SEARCH_INDEX_URL = "/data/search.index.json";
let searchIndexPromise = null;

function loadSearchIndex() {
    if (!searchIndexPromise) {
        searchIndexPromise = fetchJsonWithRetry(SEARCH_INDEX_URL, {
            fetchOptions: { cache: "no-store" },
            retries: 6,
            baseDelay: 300,
            maxDelay: 8000,
            dedupeKey: "search-index"
        })
            .then(data => data.entries || []);
    }

    return searchIndexPromise;
}

function hide(results) {
    results.hidden = true;
    results.innerHTML = "";
}

function emitOpen(entry) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: entry
    }));
}

function renderResults(container, matches) {
    container.hidden = matches.length === 0;
    container.replaceChildren(...matches.map((entry, index) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "search-result";
        el.setAttribute("role", "option");
        el.textContent = entry.display;
        el.dataset.resultIndex = String(index);
        return el;
    }));
}

export class Search {
    static async start(options = {}) {
        const mount = options instanceof Element
            ? options
            : options.mount || document.querySelector(".landing-search");
        if (!mount) return;

        const context = options instanceof Element ? "landing" : options.context || "landing";
        const controller = new AbortController();
        const { signal } = controller;
        let hideTimer = null;

        mount.innerHTML = `
            <div class="search-box">
                <span class="search-icon" aria-hidden="true">⌕</span>
                <input class="search-input" type="search" placeholder="Search Doku-Doujin…" aria-label="Search Doku-Doujin" autocomplete="off" />
                <div class="search-results" role="listbox" hidden></div>
            </div>
        `;

        const input = mount.querySelector(".search-input");
        const results = mount.querySelector(".search-results");

        let activeMatches = [];
        let activeIndex = -1;

        const announceState = () => mount.dispatchEvent(new CustomEvent("search-state-change", {
            bubbles: true,
            detail: { open: !results.hidden, focused: document.activeElement === input }
        }));
        const close = () => {
            hide(results);
            activeIndex = -1;
            announceState();
        };

        input.addEventListener("focus", () => {
            loadSearchIndex().catch(error => console.warn("search index failed", error));
        }, { once: true, signal });

        input.addEventListener("blur", () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(close, 250);
            announceState();
        }, { signal });

        function openResult(result) {
            const entry = activeMatches[Number(result.dataset.resultIndex)];
            if (!entry) return;

            clearTimeout(hideTimer);
            close();
            input.value = "";
            emitOpen(entry);
        }

        // Pointerdown fires before another layer or focus change can swallow the click.
        results.addEventListener("pointerdown", event => {
            if (!(event.target instanceof Element)) return;

            const result = event.target.closest(".search-result");
            if (!result) return;

            event.preventDefault();
            event.stopPropagation();
            openResult(result);
        }, { signal });

        // Preserve keyboard-generated and synthetic clicks.
        results.addEventListener("click", event => {
            if (!(event.target instanceof Element)) return;

            const result = event.target.closest(".search-result");
            if (!result || event.detail !== 0) return;

            openResult(result);
        }, { signal });

        results.addEventListener("pointerenter", () => {
            clearTimeout(hideTimer);
        }, { signal });

        // -----------------------------
        // INPUT SEARCH
        // -----------------------------
        input.addEventListener("input", async () => {
            const query = input.value;
            const q = normalize(query);
            const tokens = q.split(" ").filter(Boolean);

            if (!tokens.length) {
                activeMatches = [];
                close();
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
            activeIndex = -1;
            clearTimeout(hideTimer);
            announceState();
        }, { signal });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                input.value = "";
                close();
                input.blur();
            } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && activeMatches.length) {
                event.preventDefault();
                activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + activeMatches.length) % activeMatches.length;
                results.querySelectorAll(".search-result").forEach((result, index) => {
                    result.classList.toggle("is-active", index === activeIndex);
                });
            } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                openResult(results.querySelector(`[data-result-index="${activeIndex}"]`));
            }
        }, { signal });

        mount.dataset.searchContext = context;
        return () => {
            controller.abort();
            clearTimeout(hideTimer);
            mount.replaceChildren();
        };
    }
}
