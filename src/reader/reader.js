export class Reader {

    static async start() {

        console.log("Reader initialized.");

        const container = document.getElementById("reader-container");

        if (!container) {
            throw new Error("Missing #reader-container");
        }

        container.innerHTML = `
            <div class="reader">

                <h2>Animeplex Reader</h2>

                <p>Reader booted successfully.</p>

            </div>
        `;

    }

}
