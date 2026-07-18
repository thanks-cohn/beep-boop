import { Landing } from "./landing.js";
import { Reader } from "./reader.js";
import { Account } from "../account.js";

let routeCleanup = null;
function disposeRoute() { routeCleanup?.(); routeCleanup = null; Account.dispose?.(); }

export class Page {

    static async start() {

        disposeRoute();
        const params = new URLSearchParams(window.location.search);

        if (window.location.pathname === "/account" || window.location.pathname === "/account/") {
            history.replaceState({}, "", "/?account=profile");
        } else if (window.location.pathname === "/account/bookmarks") {
            history.replaceState({}, "", "/?account=bookmarks");
        } else if (window.location.pathname === "/account/settings") {
            history.replaceState({}, "", "/?account=settings");
        }

        const account = new URLSearchParams(window.location.search).get("account");
        if (account) {
            await Account.render();
            return;
        }

        const work = params.get("work");
        const chapter = params.get("chapter");

        if (work && chapter) {
            await Reader.start(work, chapter);
            return;
        }

        await Landing.start();

    }

}
