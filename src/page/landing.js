import { Rotunda } from "../components/rotunda.js";
import { Search } from "../components/search.js";

async function safeStart(name, fn) {
    try {
        await fn();
    } catch (e) {
        console.warn(`${name} failed`, e);
    }
}

export class Landing {
    static async start() {
        const container = document.getElementById("reader-container");
        if (!container) return;

        container.innerHTML = `
        <div class="app-root">

            <!-- SEARCH (HIGHEST PRIORITY / EYE LEVEL) -->
            <header class="search-layer">
                <div class="landing-search"></div>
            </header>

            <!-- ROTUNDA (DISCOVERY LAYER) -->
            <section class="rotunda-layer">
                <div class="landing-rotunda"></div>
            </section>

            <!-- 3 COLUMN SYSTEM -->
            <div class="app-shell">

                <aside class="col left">
                    <div class="panel">
                        <h3>Library</h3>
                    </div>
                </aside>

                <main class="col center">
                    <div id="reader-view"></div>
                </main>

                <aside class="col right">
                    <div class="panel">
                        <h3>Tools</h3>
                    </div>
                </aside>

            </div>
        </div>
        `;

        await Promise.allSettled([
            safeStart("Search", () => Search.start()),
            safeStart("Rotunda", () => Rotunda.start())
        ]);
    }
}

// Listen for search clicks
window.addEventListener("open-reader", (e) => {
    const entry = e.detail;

    const reader = document.getElementById("reader-view");

    if (!reader) return;

    reader.innerHTML = `
        <div class="reader-loading">Loading...</div>
    `;

    window.dispatchEvent(new CustomEvent("load-reader", {
        detail: entry
    }));
});
