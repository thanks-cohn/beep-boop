import "./styles/landing.css";
import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";
import { startGhostText } from "./effects/ghost_text.js";
import { withRetry } from "./utils/retry.js";

async function boot() {
    try {
        startGhostText().catch(error => console.warn("Ghost text failed to start.", error));
        await withRetry(() => Page.start(), {
            retries: 10,
            onRetry: ({ attempt }) => {
                document.documentElement.dataset.appState = "recovering";
                const shell = document.querySelector(".startup-shell span");
                if (shell && attempt >= 2) shell.textContent = "Reconnecting…";
            }
        });
        Footer.start();
        document.documentElement.dataset.appState = "ready";
        window.__finishStartup?.();
    } catch (error) {
        console.error("Page failed to start.", error);

        const container = document.getElementById("reader-container");

        if (container) {
            container.innerHTML = `
                <div class="reader-error">
                    <h2>Unable to load page.</h2>
                    <p>We tried reconnecting automatically but could not finish loading.</p><button type="button" onclick="window.location.reload()">Try again</button>
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
    if (container) container.innerHTML = `<div class="reader-error"><h2>Unable to load page.</h2><p>We tried reconnecting automatically but could not finish loading.</p><button type="button" onclick="window.location.reload()">Try again</button></div>`;
    document.documentElement.dataset.appState = "error";
    window.__finishStartup?.();
});
