import "./styles/landing.css";

import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";
import { SiteOverlay } from "./components/site_overlay.js";

async function boot() {
    console.log("AnimePlex");

    try {
        await Page.start();
        Footer.start();
        SiteOverlay.start();
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
