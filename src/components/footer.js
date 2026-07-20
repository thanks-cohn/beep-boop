export class Footer {
    static start() {
        const footer = document.getElementById("footer");
        if (!footer) return;

        footer.replaceChildren();
        footer.className = "site-footer";

        const brand = document.createElement("div");
        brand.className = "site-footer-brand";
        brand.textContent = "Doku-Doujin";

        const top = document.createElement("button");
        top.className = "site-footer-top";
        top.type = "button";
        top.textContent = "Back to top";
        top.addEventListener("click", () => {
            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        });

        footer.append(brand, top);
    }
}
