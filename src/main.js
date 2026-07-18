import "./styles/landing.css";
import { Page } from "./page/page.js";
import { Footer } from "./components/footer.js";
import { startGhostText } from "./effects/ghost_text.js";
import { withRetry } from "./utils/retry.js";
import { loadReaderState } from "./recovery/state.js";
import { TagPreferences } from "./preferences.js";
import { installNavigation, setRouteResolver } from "./navigation.js";
import { AuthState } from "./auth-state.js";

let appRecoveryVisible = false;

function recoveryMarkup() {
    const saved = loadReaderState();
    const retryUrl = saved?.work && saved?.chapter
        ? `/?source=${encodeURIComponent(saved.source || "e")}&work=${encodeURIComponent(saved.work)}&chapter=${encodeURIComponent(saved.chapter)}`
        : window.location.href;
    return `
        <div class="app-recovery-screen" role="status" aria-live="polite">
            <div class="app-recovery-card">
                <h2>Restoring your session…</h2>
                <p>We kept the page intact where possible and are reconnecting quietly.</p>
                <div class="app-recovery-actions">
                    <button type="button" class="app-recovery-retry">Try Again</button>
                    <a href="${retryUrl}">Refresh Page</a>
                </div>
            </div>
        </div>`;
}

function showAppRecovery(error) {
    console.error("Application recovery screen shown.", error);
    document.documentElement.dataset.appState = "error";
    if (appRecoveryVisible) return;
    appRecoveryVisible = true;
    const host = document.createElement("div");
    host.className = "app-recovery-host";
    host.innerHTML = recoveryMarkup();
    document.body.append(host);
    host.querySelector(".app-recovery-retry")?.addEventListener("click", () => {
        host.remove();
        appRecoveryVisible = false;
        boot();
    }, { once: true });
}

async function boot() {
    try {
        document.documentElement.dataset.appState = "booting";
        startGhostText().catch(error => console.warn("Ghost text failed to start.", error));
        await withRetry(() => Page.start(), {
            retries: 10,
            onRetry: ({ attempt }) => {
                document.documentElement.dataset.appState = "recovering";
                const shell = document.querySelector(".startup-shell span");
                if (shell && attempt >= 2) shell.textContent = "Restoring your session…";
            }
        });
        Footer.start();
        document.documentElement.dataset.appState = "ready";
        document.querySelector(".app-recovery-host")?.remove();
        appRecoveryVisible = false;
        window.__finishStartup?.();
    } catch (error) {
        showAppRecovery(error);
        window.__finishStartup?.();
    }
}

window.addEventListener("error", event => {
    console.error("Contained application error.", event.error || event.message);
});
window.addEventListener("unhandledrejection", event => {
    console.error("Contained unhandled promise rejection.", event.reason);
});
window.addEventListener("online", () => {
    if (document.documentElement.dataset.appState === "error") boot();
}, { passive: true });
window.addEventListener("offline", () => {
    document.documentElement.dataset.network = "offline";
}, { passive: true });
window.addEventListener("online", () => {
    delete document.documentElement.dataset.network;
}, { passive: true });

setRouteResolver(() => Page.start().catch(showAppRecovery));
installNavigation();
AuthState.start().catch(error => console.warn("Auth state unavailable.", error));
TagPreferences.loadForCurrentUser().catch(error => console.warn("Tag preferences unavailable.", error));
boot().catch(showAppRecovery);
