// src/page/landing.js

export class Landing {

    static async start() {

        const container = document.getElementById("reader-container");

        if (!container) {
            throw new Error("Missing #reader-container");
        }

        container.innerHTML = `

            <section id="landing-page">

                <section id="landing-rotunda">

                </section>

                <section id="landing-search">

                </section>

                <section id="landing-blocks">

                </section>

            </section>

        `;

    }

}
