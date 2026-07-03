export class Footer {
    static start() {
        const footer = document.getElementById("footer");
        if (!footer) return;

        footer.replaceChildren();

        const left = document.createElement("div");
        left.className = "site-footer-left";
        left.textContent = "v1.2.0-wip";

        const center = document.createElement("div");
        center.className = "site-footer-center";
        center.textContent = "Animeplex";

        const right = document.createElement("div");
        right.className = "site-footer-right";

        const top = document.createElement("button");
        top.type = "button";
        top.textContent = "Back to top";
        top.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        right.appendChild(top);

        footer.append(left, center, right);
    }
}
