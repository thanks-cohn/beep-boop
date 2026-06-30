export class Reader {

    static async start(work, chapter) {

        const container =
            document.getElementById("reader-container");

        container.innerHTML = `

            <section class="reader">

                <h2>${work}</h2>

                <p>${chapter}</p>

            </section>

        `;

    }

}
