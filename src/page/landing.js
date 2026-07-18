import { fetchWithRetry } from "../utils/retry.js";
import { Rotunda } from "../components/rotunda.js";
import { Search } from "../components/search.js";
import { Blocks } from "../components/blocks.js";
let landingCleanup = null;
async function startHeaderTicker(context = {}) {
    const ticker = document.getElementById("header-ticker-track");
    if (!ticker) return;

    try {
        const data = await fetchWithRetry("/header-ticker.json", {}, { parse: "json", retries: 10 });
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const hero = Array.isArray(data.hero) ? data.hero : [];

        ticker.replaceChildren();

        for (let i = 0; i < 3; i++) {
            const rowData = rows[i] || {};
            const items = Array.isArray(rowData.items) ? rowData.items : [""];
            const line = items.filter(Boolean).join("     ✦     ");

            const row = document.createElement("div");
            row.className = `header-ticker-row header-ticker-row-${i + 1}`;
            row.style.setProperty("--ticker-speed", rowData.speed || `${26 + i * 10}s`);
            row.textContent = `${line}     ✦     ${line}`;
            ticker.appendChild(row);
        }

        const heroBox = document.createElement("div");
        heroBox.className = "header-ticker-hero";
        heroBox.textContent = hero[0] || "";
        ticker.appendChild(heroBox);

        let heroIndex = 0;
        const timer = window.setInterval(() => {
            if (!hero.length) return;
            heroIndex = (heroIndex + 1) % hero.length;
            heroBox.textContent = hero[heroIndex];
        }, 4200);
        context.addCleanup?.(() => window.clearInterval(timer));
    } catch (error) {
        console.warn("header ticker failed", error);
        ticker.textContent = "";
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
    static dispose() { landingCleanup?.(); landingCleanup = null; Rotunda.cleanup?.(); }
    static async start(context = {}) {
        Landing.dispose();
        const cleanups = [];
        const addCleanup = fn => { if (typeof fn === "function") cleanups.push(fn); };
        landingCleanup = () => { while (cleanups.length) cleanups.shift()?.(); };
        const childContext = { ...context, addCleanup: fn => { addCleanup(fn); context.addCleanup?.(fn); } };
        const container = document.getElementById("reader-container");
        if (!container) return;

        document.body.classList.remove("reader-active");

        container.innerHTML = `
        <div class="app-root">
            <header class="landing-header" aria-label="Doku-Doujin site header">
                <a class="landing-brand" href="/" aria-label="Doku-Doujin home">Doku-Doujin</a>
                <div class="landing-search" aria-label="Site search"></div>
                <a class="account-entry" href="/?account=profile">Account</a>
            </header>

            <section class="rotunda-layer">
                <div class="landing-rotunda"></div>
            </section>

            <section class="ticker-layer" aria-label="Doku-Doujin updates">
                <div class="header-ticker">
                    <div class="header-ticker-track" id="header-ticker-track"></div>
                </div>
            </section>

            <section id="blocks-root"></section>
        </div>
        `;

        const searchCleanup = await Search.start({ mount: container.querySelector(".landing-search"), context: "landing" }).catch(e => console.warn("search failed", e));
        addCleanup(searchCleanup);
        safeStart("rotunda", () => Rotunda.start(childContext)).then(addCleanup);
        safeStart("blocks", () => Blocks.start()).then(addCleanup);
        safeStart("header ticker", () => startHeaderTicker(childContext));
    }
}
