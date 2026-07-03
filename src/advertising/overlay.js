import overlayConfig from "../data/overlay.json";

const STORAGE_KEY = "animeplex-overlay-index";

function getNextUrl() {
    const urls = overlayConfig.urls || [];
    if (!urls.length) return null;

    const current = Number(localStorage.getItem(STORAGE_KEY) || "0");
    const url = urls[current % urls.length];

    localStorage.setItem(STORAGE_KEY, String((current + 1) % urls.length));
    return url;
}

function createOverlay() {
    const overlay = document.createElement("button");
    overlay.className = "site-click-overlay";
    overlay.type = "button";

    overlay.innerHTML = `
        <span class="site-click-overlay-box">
            <strong>${overlayConfig.label || "Feature"}</strong>
            <em>${overlayConfig.message || "Click to continue"}</em>
        </span>
    `;

    overlay.addEventListener("click", () => {
        const url = getNextUrl();
        overlay.remove();

        if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
        }

        Overlay.schedule();
    });

    document.body.appendChild(overlay);
}

export class Overlay {
    static timer = null;

    static start() {
        if (!overlayConfig.enabled) return;
        Overlay.schedule();
    }

    static schedule() {
        clearTimeout(Overlay.timer);

        const delay = Math.max(5, overlayConfig.intervalSeconds || 120) * 1000;

        Overlay.timer = setTimeout(() => {
            if (!document.querySelector(".site-click-overlay")) {
                createOverlay();
            }
        }, delay);
    }
}
