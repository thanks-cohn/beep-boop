import { Rotunda } from "../components/rotunda.js";
import { Search } from "../components/search.js";
import { Blocks } from "../components/blocks.js";


async function startHeaderTicker() {
    const ticker = document.getElementById("header-ticker-track");
    if (!ticker) return;

    try {
        const response = await fetch("/header-ticker.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const hero = Array.isArray(data.hero) ? data.hero : [];

        ticker.replaceChildren();

        for (let i = 0; i < 3; i++) {
            const rowData = rows[i] || {};
            const items = Array.isArray(rowData.items) ? rowData.items : ["Animeplex"];
            const line = items.filter(Boolean).join("     ✦     ");

            const row = document.createElement("div");
            row.className = `header-ticker-row header-ticker-row-${i + 1}`;
            row.style.setProperty("--ticker-speed", rowData.speed || `${26 + i * 10}s`);
            row.textContent = `${line}     ✦     ${line}`;
            ticker.appendChild(row);
        }

        const heroBox = document.createElement("div");
        heroBox.className = "header-ticker-hero";
        heroBox.textContent = hero[0] || "ANIMEPLEX";
        ticker.appendChild(heroBox);

        let heroIndex = 0;
        window.setInterval(() => {
            if (!hero.length) return;
            heroIndex = (heroIndex + 1) % hero.length;
            heroBox.textContent = hero[heroIndex];
        }, 4200);
    } catch (error) {
        console.warn("header ticker failed", error);
        ticker.textContent = "Animeplex ✦ Latest chapters ✦ Search the library";
    }
}

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

        document.body.classList.remove("reader-active");

        container.innerHTML = `
        <div class="app-root">
            <div class="landing-brand-row">
                <div class="landing-brand-top">ANIPLEX</div>
            </div>

            <header class="search-layer">
                <div class="header-ticker" aria-hidden="true">
                    <div class="header-ticker-track" id="header-ticker-track"></div>
                </div>

                <div class="header-center">
                    <div class="landing-search"></div>
                </div>
            </header>

            <section class="rotunda-layer">
                <div class="landing-rotunda"></div>
            </section>

            <section id="blocks-root"></section>
        </div>
        `;

        await safeStart("search", Search.start);
        await safeStart("rotunda", Rotunda.start);
        await safeStart("blocks", Blocks.start);
        await safeStart("header ticker", startHeaderTicker);
    }
}
