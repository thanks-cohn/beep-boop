export class Footer {
    static start() {
        const footer = document.getElementById("footer");
        if (!footer) return;

        footer.className = "site-footer";
        footer.replaceChildren();

        const brand = document.createElement("div");
        brand.className = "site-footer-brand";
        brand.innerHTML = `<strong>Doku-Doujin</strong><span>AnimePlex reader build v1.2.0-wip</span>`;

        const links = document.createElement("nav");
        links.className = "site-footer-links";
        links.setAttribute("aria-label", "Footer links");
        links.innerHTML = `
            <a href="/">Home</a>
        `;

        const note = document.createElement("p");
        note.className = "site-footer-note";
        note.textContent = "Fast, dark, low-distraction chapter reading.";

        footer.append(brand, links, note);

        let top = document.querySelector(".back-to-top");
        if (!top) {
            top = document.createElement("button");
            top.type = "button";
            top.className = "back-to-top";
            top.setAttribute("aria-label", "Back to top of page");
            top.textContent = "↑ Top";
            document.body.appendChild(top);
        }

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        top.addEventListener("click", () => window.scrollTo({
            top: 0,
            behavior: reduceMotion.matches ? "auto" : "smooth"
        }));

        const update = () => top.classList.toggle("is-visible", window.scrollY > Math.max(500, window.innerHeight * 0.75));
        window.addEventListener("scroll", update, { passive: true });
        update();
    }
}
