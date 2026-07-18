const KEY = "doku-doujin:reader-recovery:v1";

export function saveReaderState(state = {}) {
    try {
        const payload = {
            version: 1,
            savedAt: Date.now(),
            work: state.work,
            chapter: state.chapter,
            source: state.source || "e",
            scrollY: Math.max(0, Math.round(window.scrollY || 0))
        };
        if (payload.work && payload.chapter) sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("Could not save reader recovery state.", error);
    }
}

export function loadReaderState(maxAgeMs = 1000 * 60 * 60 * 12) {
    try {
        const payload = JSON.parse(sessionStorage.getItem(KEY) || "null");
        if (!payload || payload.version !== 1 || Date.now() - payload.savedAt > maxAgeMs) return null;
        return payload;
    } catch (error) {
        console.warn("Could not load reader recovery state.", error);
        return null;
    }
}

export function restoreScrollPosition(state) {
    if (!state?.scrollY) return;
    let attempts = 0;
    const apply = () => {
        attempts += 1;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (maxScroll >= state.scrollY || attempts > 20) window.scrollTo({ top: Math.min(state.scrollY, maxScroll), behavior: "auto" });
        else requestAnimationFrame(apply);
    };
    requestAnimationFrame(apply);
}
