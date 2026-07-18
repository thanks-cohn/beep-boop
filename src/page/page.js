import { Landing } from "./landing.js";
import { Reader } from "./reader.js";
import { Account } from "../account.js";
import { createRouteLifecycle } from "../route-lifecycle.js";
import { setDiagnosticRoute } from "../diagnostics.js";

const lifecycle = createRouteLifecycle();
function disposeRoute() { Account.dispose?.(); Reader.dispose?.(); Landing.dispose?.(); }
export const RouteLifecycle = lifecycle;

export class Page {

    static async start() {

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
            const context = lifecycle.next(`account:${account}`, disposeRoute);
            setDiagnosticRoute({ name: "account", account, generation: context.generation });
            await Account.render(context);
            return;
        }

        const work = params.get("work");
        const chapter = params.get("chapter");

        if (work && chapter) {
            const context = lifecycle.next(`reader:${work}:${chapter}`, disposeRoute);
            setDiagnosticRoute({ name: "reader", work, chapter, generation: context.generation });
            await Reader.start(work, chapter, context);
            return;
        }

        const context = lifecycle.next("landing", disposeRoute);
        setDiagnosticRoute({ name: "landing", generation: context.generation });
        await Landing.start(context);

    }

}
