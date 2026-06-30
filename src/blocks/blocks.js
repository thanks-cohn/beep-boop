// src/blocks/blocks.js

export class Blocks {

    static async start() {

        const container = document.getElementById("landing-blocks");

        if (!container) {
            throw new Error("Missing #landing-blocks");
        }

        container.replaceChildren();

        //
        // Temporary blocks.
        // Later these will come from the CSV.
        //

        this.header({
            title: "Popular Works"
        });

        this.body({
            text: "Popular works will appear here."
        });

        this.header({
            title: "Latest Chapters"
        });

        this.body({
            text: "Latest chapters will appear here."
        });

    }

    static header({ title }) {

        const container = document.getElementById("landing-blocks");

        const block = document.createElement("section");

        block.className = "block block-header";

        block.innerHTML = `
            <h2>${title}</h2>
        `;

        container.appendChild(block);

    }

    static body({ text }) {

        const container = document.getElementById("landing-blocks");

        const block = document.createElement("section");

        block.className = "block block-body";

        block.innerHTML = `
            <p>${text}</p>
        `;

        container.appendChild(block);

    }

}
