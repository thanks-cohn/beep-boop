import advertisementConfig from "../data/advertisement.json";

const loadedProviderScripts = new Set();
const delegateCHHosts = new Set();

function currentDevice() {
    return window.matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop";
}

function debug(ad, ...args) {
    if (ad?.debug) {
        console.debug(`[ads:${ad.id || ad.placement}]`, ...args);
    }
}

function normalizeAds() {
    return Array.isArray(advertisementConfig) ? advertisementConfig : [];
}

function adSupportsDevice(ad) {
    const devices = Array.isArray(ad.devices) && ad.devices.length
        ? ad.devices
        : ["desktop", "mobile"];

    return devices.includes(currentDevice());
}

function isEnabledAd(ad) {
    return Boolean(
        ad &&
        ad.enabled &&
        ad.providerScript &&
        ad.className &&
        ad.zoneId &&
        adSupportsDevice(ad)
    );
}

function ensureDelegateCH(ad) {
    if (!ad.delegateCHHost || delegateCHHosts.has(ad.delegateCHHost)) return;

    const meta = document.createElement("meta");
    meta.httpEquiv = "Delegate-CH";
    meta.content = [
        "Sec-CH-UA",
        "Sec-CH-UA-Mobile",
        "Sec-CH-UA-Arch",
        "Sec-CH-UA-Model",
        "Sec-CH-UA-Platform",
        "Sec-CH-UA-Platform-Version",
        "Sec-CH-UA-Bitness",
        "Sec-CH-UA-Full-Version-List",
        "Sec-CH-UA-Full-Version"
    ].map(header => `${header} ${ad.delegateCHHost}`).join("; ") + ";";

    document.head.appendChild(meta);
    delegateCHHosts.add(ad.delegateCHHost);
    debug(ad, "Delegate-CH meta injected", ad.delegateCHHost);
}

function ensureProviderScript(ad) {
    if (loadedProviderScripts.has(ad.providerScript)) return;

    const script = document.createElement("script");
    script.async = true;
    script.type = "application/javascript";
    script.src = ad.providerScript;
    script.onerror = () => debug(ad, "provider script blocked or failed", ad.providerScript);

    document.head.appendChild(script);
    loadedProviderScripts.add(ad.providerScript);
    debug(ad, "provider script requested", ad.providerScript);
}

function serve(ad) {
    try {
        (window.AdProvider = window.AdProvider || []).push({ serve: {} });
        debug(ad, "serve requested");
    } catch (error) {
        if (ad?.debug) console.debug(error);
    }
}

function createIns(ad) {
    const ins = document.createElement("ins");
    ins.className = String(ad.className);
    ins.dataset.zoneid = String(ad.zoneId);
    return ins;
}

export function getAdsByPlacement(placement) {
    return normalizeAds().filter(ad => ad.placement === placement && isEnabledAd(ad));
}

export function renderAdSlot(ad, extraClassName = "") {
    if (!isEnabledAd(ad)) return null;

    ensureDelegateCH(ad);
    ensureProviderScript(ad);

    const repeatCount = Math.max(1, Number(ad.repeatCount || 1));
    const slot = document.createElement("div");
    slot.className = ["reader-ad-slot", extraClassName].filter(Boolean).join(" ");
    slot.dataset.adId = ad.id || ad.placement || "advertisement";

    const inner = document.createElement("div");
    inner.className = ["reader-ad-inner", repeatCount > 1 ? "reader-ad-grid" : ""].filter(Boolean).join(" ");

    for (let index = 0; index < repeatCount; index++) {
        inner.appendChild(createIns(ad));
    }

    slot.appendChild(inner);

    window.setTimeout(() => {
        for (let index = 0; index < repeatCount; index++) {
            serve(ad);
        }
    }, 0);

    return slot;
}

export function installPageAdvertisements() {
    for (const placement of [
        "desktop-video-slider",
        "desktop-fullpage-interstitial",
        "mobile-fullpage-interstitial"
    ]) {
        for (const ad of getAdsByPlacement(placement)) {
            const slot = renderAdSlot(ad, `site-ad-slot site-ad-${placement}`);
            if (slot) {
                document.body.appendChild(slot);
                debug(ad, "page advertisement inserted", placement);
            }
        }
    }
}
