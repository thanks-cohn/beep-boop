// src/page/landing.js

import { Rotunda } from "../components/rotunda.js";
import { Search } from "../components/search.js";
import { Blocks } from "../blocks/blocks.js";

export class Landing {

    static async start() {

        const container = document.getElementById("reader-container");

        if (!container) {
            throw new Error("Missing #reader-container");
        }

        container.innerHTML = `

            <section id="landing-page">

                <section id="landing-hero">

                    <div id="rotunda-container"></div>

                    <div id="search-container"></div>

                </section>

                <section id="landing-blocks"></section>

            </section>

        `;

        await Rotunda.render();

        await Search.render();

        await Blocks.render();

    }

}
