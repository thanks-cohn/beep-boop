import overlayLinks from "../data/overlay_links.json";

const HIDDEN_UNTIL_KEY = "animeplex_overlay_hidden_until";
const INDEX_KEY = "animeplex_overlay_link_index";

function getNextLink() {
    const links = Array.isArray(overlayLinks.links)
        ? overlayLinks.links.filter(link => link?.url)
        : [];

    if (!overlayLinks.active || links.length === 0) {
        return null;
    }

    const index = Number(localStorage.getItem(INDEX_KEY) || 0);
    const safeIndex = Number.isFinite(index) ? index % links.length : 0;
    const link = links[safeIndex];

    localStorage.setItem(
        INDEX_KEY,
        String((safeIndex + 1) % links.length)
    );

    return link;
}

export class SiteOverlay {
    static start() {
        const hiddenUntil = Number(localStorage.getItem(HIDDEN_UNTIL_KEY) || 0);

        if (Date.now() < hiddenUntil) return;

        const link = getNextLink();
        if (!link) return;

        const hideMs = Number(overlayLinks.hide_ms || 120000);

        const overlay = document.createElement("a");
        overlay.className = "site-overlay-ad";
        overlay.href = link.url;
        overlay.target = "_blank";
        overlay.rel = "noopener noreferrer";
        overlay.setAttribute("aria-label", "Sponsored overlay");

        const mascot = document.createElement("div");
        mascot.className = "site-overlay-mascot";
        mascot.textContent = "꒰ᐢ. .ᐢ꒱";

        overlay.appendChild(mascot);

        overlay.addEventListener("click", () => {
            localStorage.setItem(
                HIDDEN_UNTIL_KEY,
                String(Date.now() + hideMs)
            );

            overlay.remove();
        });

        document.body.appendChild(overlay);
    }
}
