import "./styles/landing.css";
import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";
import { startGhostText } from "./effects/ghost_text.js";

async function boot() {
    try {
        startGhostText().catch(error => console.warn("Ghost text failed to start.", error));
        await Page.start();
        Footer.start();
    } catch (error) {
        console.error("Page failed to start.", error);

        const container = document.getElementById("reader-container");

        if (container) {
            container.innerHTML = `
                <div class="reader-error">
                    <h2>Unable to load page.</h2>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    }
}

boot();
