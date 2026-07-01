import { normalize } from "../utils/normalize.js";

const SEARCH_INDEX_URL = "/data/search.index.json";
const MAX_RESULTS = 12;

async function loadSearchIndex() {
    const response = await fetch(SEARCH_INDEX_URL, { cache: "no-cache" });

    if (!response.ok) {
        throw new Error(`Search index failed: ${response.status}`);
    }

    return response.json();
}

function tokenize(query) {
    return normalize(query).split(" ").filter(Boolean);
}

function makeReaderUrl(entry) {
    if (entry.reader_url) {
        return entry.reader_url;
    }

    const source = encodeURIComponent(entry.source ?? "e");
    const work = encodeURIComponent(entry.work ?? entry.slug ?? "");
    const chapter = entry.chapter ? `&chapter=${encodeURIComponent(entry.chapter)}` : "";

    return `/reader?source=${source}&work=${work}${chapter}`;
}

function scoreEntry(entry, tokens) {
    const text = normalize(
        `${entry.display ?? ""} ${entry.normalized ?? ""} ${entry.work ?? ""} ${entry.slug ?? ""} ${entry.chapter ?? ""}`
    );

    let score = 0;

    for (const token of tokens) {
        if (text.split(" ").includes(token)) {
            score += 100;
        } else if (text.includes(token)) {
            score += 50;
        } else {
            score -= 20;
        }
    }

    if (entry.type === "work") {
        score += 10;
    }

    return score;
}

function search(index, query) {
    const tokens = tokenize(query);

    if (!tokens.length) {
        return [];
    }

    return (index.entries ?? [])
        .map(entry => ({ entry, score: scoreEntry(entry, tokens) }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map(result => result.entry);
}

function renderResults(container, results) {
    container.replaceChildren();

    for (const result of results) {
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = makeReaderUrl(result);
        link.textContent = result.display ?? result.slug ?? "Untitled";

        container.appendChild(link);
    }
}

export class Search {
    static async start() {
        const mount = document.querySelector(".landing-search");

        if (!mount) {
            console.warn("Search: no mount found.");
            return;
        }

        mount.innerHTML = `
            <div class="search-box">
                <input class="search-input" type="search" placeholder="Search works, volumes, chapters..." autocomplete="off">
                <div class="search-results"></div>
            </div>
        `;

        const input = mount.querySelector(".search-input");
        const results = mount.querySelector(".search-results");
        const index = await loadSearchIndex();

        input.addEventListener("input", () => {
            renderResults(results, search(index, input.value));
        });

        console.log(`Search loaded ${index.entries?.length ?? 0} entries.`);
    }
}
