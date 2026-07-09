import textBehind from "../data/text_behind.json";

const LAYER_CLASS = "site-ghost-text-layer";
const ITEM_CLASS = "site-ghost-text";
const READER_RAIL_QUERY = "(max-width: 900px)";

const homeSlots = [
    { x: 8, y: 12 }, { x: 32, y: 8 }, { x: 61, y: 15 }, { x: 84, y: 10 },
    { x: 15, y: 34 }, { x: 44, y: 30 }, { x: 72, y: 39 },
    { x: 9, y: 58 }, { x: 35, y: 66 }, { x: 66, y: 60 }, { x: 87, y: 72 },
    { x: 22, y: 84 }, { x: 54, y: 80 }
];

const readerRailSlots = [
    { x: 5, y: 16 }, { x: 13, y: 34 }, { x: 7, y: 58 }, { x: 15, y: 78 },
    { x: 85, y: 14 }, { x: 94, y: 31 }, { x: 88, y: 55 }, { x: 96, y: 76 }
];

let started = false;
let phraseIndex = 0;
let slotIndex = 0;
let timerId = null;

function phrases() {
    return Array.isArray(textBehind.phrases)
        ? textBehind.phrases.map(phrase => String(phrase).trim()).filter(Boolean)
        : [];
}

function ensureLayer() {
    let layer = document.querySelector(`.${LAYER_CLASS}`);

    if (!layer) {
        layer = document.createElement("div");
        document.body.prepend(layer);
    }

    layer.className = LAYER_CLASS;
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("role", "presentation");

    return layer;
}

function isReaderMobile() {
    return document.body.classList.contains("reader-active")
        && window.matchMedia(READER_RAIL_QUERY).matches;
}

function nextPosition() {
    const readerActive = document.body.classList.contains("reader-active");
    const slots = readerActive ? readerRailSlots : homeSlots;
    const slot = slots[slotIndex % slots.length];

    slotIndex += 1 + Math.floor(Math.random() * 2);

    if (readerActive) {
        const leftRail = slot.x < 50;
        const min = leftRail ? 3 : 84;
        const max = leftRail ? 16 : 97;

        return {
            x: Math.min(max, Math.max(min, slot.x + (Math.random() * 4 - 2))),
            y: Math.min(88, Math.max(8, slot.y + (Math.random() * 7 - 3.5)))
        };
    }

    return {
        x: Math.min(92, Math.max(4, slot.x + (Math.random() * 10 - 5))),
        y: Math.min(90, Math.max(7, slot.y + (Math.random() * 8 - 4)))
    };
}

function emitPhrase(layer, phraseList) {
    if (document.hidden || isReaderMobile()) return;

    const item = document.createElement("span");
    const position = nextPosition();

    item.className = ITEM_CLASS;
    item.textContent = phraseList[phraseIndex % phraseList.length];
    item.style.left = `${position.x}vw`;
    item.style.top = `${position.y}vh`;
    item.style.setProperty("--ghost-drift-x", `${Math.random() * 44 - 22}px`);
    item.style.setProperty("--ghost-drift-y", `${Math.random() * 34 - 17}px`);
    item.style.setProperty("--ghost-life", `${11000 + Math.random() * 7000}ms`);
    item.style.setProperty("--ghost-tilt", `${Math.random() * 8 - 4}deg`);

    phraseIndex += 1;

    layer.appendChild(item);
    item.addEventListener("animationend", () => item.remove(), { once: true });
    window.setTimeout(() => item.remove(), 20000);
}

export function startGhostText() {
    if (started || typeof document === "undefined") return;

    const phraseList = phrases();
    if (!phraseList.length) return;

    started = true;

    const layer = ensureLayer();
    const tick = () => emitPhrase(layer, phraseList);

    tick();
    timerId = window.setInterval(tick, 2400);

    window.addEventListener("pagehide", () => {
        if (timerId) window.clearInterval(timerId);
        timerId = null;
        started = false;
    }, { once: true });
}
