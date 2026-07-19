import "./styles/landing.css";
import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";
import { startGhostText } from "./effects/ghost_text.js";

async function boot() {
    try {
        startGhostText().catch(error => console.warn("Ghost text failed to start.", error));
        await Page.start();
        Footer.start();
        document.documentElement.dataset.appState = "ready";
        window.__finishStartup?.();
    } catch (error) {
        console.error("Page failed to start.", error);

        const container = document.getElementById("reader-container");

        if (container && !container.childElementCount) {
            container.innerHTML = `
                <div class="startup-shell" role="status" aria-live="polite" aria-busy="true">
                    <span>Doku-Doujin</span><br><span class="startup-status">Reconnecting…</span>
                </div>
            `;
        }
        document.documentElement.dataset.appState = "error";
        window.__finishStartup?.();
    }
}

boot().catch(error => {
    console.error("Unexpected startup failure.", error);
    const container = document.getElementById("reader-container");
    if (container && !container.childElementCount) container.innerHTML = `<div class="startup-shell" role="status" aria-live="polite" aria-busy="true"><span>Doku-Doujin</span><br><span class="startup-status">Reconnecting…</span></div>`;
    document.documentElement.dataset.appState = "error";
    window.__finishStartup?.();
});
