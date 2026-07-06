import "./styles/landing.css";
import { Overlay } from "./advertising/overlay.js";
import { installPageAdvertisements } from "./components/ads.js";

import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";

async function boot() {
    console.log("AnimePlex");

    try {
        installPageAdvertisements();
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

Overlay.start();
