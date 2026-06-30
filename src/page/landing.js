import "../styles/landing.css";

export class Landing {

    static async start() {

        const app = document.getElementById("reader-container");

        app.innerHTML = `
        <main class="landing">

        <header class="landing-header">

        <div class="landing-logo">
        AnimePlex
        </div>

        <nav class="landing-nav">

        <button>Library</button>
        <button>History</button>
        <button>Favorites</button>
        <button>Downloads</button>
        <button>Settings</button>

        </nav>

        <div class="landing-search">

        <input
        type="text"
        placeholder="Search works..."
        >

        </div>




        <div class="landing-profile">

        Profile

        </div>

        </header>

        <section class="landing-featured">

        <div class="featured-info">

        <span>FEATURED</span>

        <h1>Title</h1>

        <p>Description</p>

        </div>

        </section>

        <section class="landing-rotunda">

        </section>

        <section class="landing-continue">

        <aside class="continue-left">

        </aside>

        <main class="continue-center">

        </main>

        <aside class="continue-right">

        </aside>

        </section>

        <section class="landing-latest">

        </section>

        <section class="landing-popular">

        </section>

        <footer class="landing-footer">

        </footer>

        </main>
        `;

    }

}
