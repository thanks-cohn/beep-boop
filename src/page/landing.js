import { Rotunda } from "../components/rotunda.js";
import { Search } from "../components/search.js";
import { Blocks } from "../components/blocks.js";
import textBehind from "../data/text_behind.json";


function startSiteGhostText() {
    const layer = document.querySelector(".site-ghost-text-layer");
    if (!layer) return;

    const phrases = Array.isArray(textBehind.phrases) ? textBehind.phrases.filter(Boolean) : [];
    if (!phrases.length) return;

    const slots = [
        { x: 8, y: 9 }, { x: 38, y: 7 }, { x: 68, y: 12 },
        { x: 14, y: 29 }, { x: 48, y: 27 }, { x: 76, y: 34 },
        { x: 7, y: 52 }, { x: 36, y: 55 }, { x: 64, y: 50 },
        { x: 18, y: 76 }, { x: 53, y: 80 }, { x: 81, y: 72 }
    ];
    let phraseIndex = 0;
    let slotIndex = 0;

    const emitPhrase = () => {
        if (document.body.classList.contains("reader-active")) return;

        const burstCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < burstCount; i++) {
            const slot = slots[slotIndex % slots.length];
            slotIndex += 1 + Math.floor(Math.random() * 2);

            const item = document.createElement("span");
            item.className = "site-ghost-text";
            item.textContent = phrases[phraseIndex % phrases.length];
            phraseIndex += 1;

            item.style.left = `${Math.min(86, Math.max(4, slot.x + (Math.random() * 8 - 4)))}vw`;
            item.style.top = `${Math.min(88, Math.max(6, slot.y + (Math.random() * 7 - 3.5)))}vh`;
            item.style.setProperty("--ghost-drift-x", `${Math.random() * 48 - 24}px`);
            item.style.setProperty("--ghost-drift-y", `${Math.random() * 28 - 14}px`);
            item.style.setProperty("--ghost-life", `${9000 + Math.random() * 5500}ms`);

            layer.appendChild(item);
            item.addEventListener("animationend", () => item.remove(), { once: true });
        }
    };

    emitPhrase();
    window.setInterval(emitPhrase, 2200);
}

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
        window.setInterval(() => {
            if (!hero.length) return;
            heroIndex = (heroIndex + 1) % hero.length;
            heroBox.textContent = hero[heroIndex];
        }, 4200);
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
    static async start() {
        const container = document.getElementById("reader-container");
        if (!container) return;

        document.body.classList.remove("reader-active");

        container.innerHTML = `
        <div class="app-root">
            <div class="site-ghost-text-layer" aria-hidden="true"></div>

            <header class="landing-header" aria-label="Animeplex site header">
                <a class="landing-brand" href="/" aria-label="Animeplex home">Animeplex</a>
                <div class="landing-search" aria-label="Site search"></div>
            </header>

            <section class="rotunda-layer">
                <div class="landing-rotunda"></div>
            </section>

            <section class="ticker-layer" aria-label="Animeplex updates">
                <div class="header-ticker">
                    <div class="header-ticker-track" id="header-ticker-track"></div>
                </div>
            </section>

            <section id="blocks-root"></section>
        </div>
        `;

        startSiteGhostText();
        await safeStart("search", Search.start);
        await safeStart("rotunda", Rotunda.start);
        await safeStart("blocks", Blocks.start);
        await safeStart("header ticker", startHeaderTicker);
    }
}
