import advertisementConfig from "../data/advertisement.json";

const loadedProviderScripts = new Set();
const delegateCHHosts = new Set();
const PAGE_AD_OVERLAY_ID = "site-ad-overlay-root";
const DESKTOP_VIDEO_SLIDER_PLACEMENT = "desktop-video-slider";
const DEFAULT_LEFT_VIDEO_SLIDER_DELAY_MS = 10000;
let leftVideoSliderTimer = null;

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
        debug(ad, "serve request failed", error);
    }
}

function ensurePageAdOverlay() {
    let overlay = document.getElementById(PAGE_AD_OVERLAY_ID);

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = PAGE_AD_OVERLAY_ID;
        overlay.className = "site-ad-overlay-root";
        overlay.setAttribute("aria-label", "Advertisement overlay layer");
        document.body.appendChild(overlay);
    }

    return overlay;
}

function placementLayerClass(placement, side = "") {
    if (placement === DESKTOP_VIDEO_SLIDER_PLACEMENT) {
        return [
            "site-ad-layer",
            "site-ad-layer-video-slider",
            side ? `site-ad-layer-video-slider-${side}` : ""
        ].filter(Boolean).join(" ");
    }

    return "site-ad-layer site-ad-layer-page";
}

function layerKey(placement, side = "") {
    return [placement, side].filter(Boolean).join(":");
}

function removeLayer(overlay, placement, side = "") {
    overlay
        .querySelectorAll(`[data-ad-layer-key="${layerKey(placement, side)}"]`)
        .forEach(layer => layer.remove());
}

function clearLeftVideoSliderTimer() {
    if (leftVideoSliderTimer) {
        window.clearTimeout(leftVideoSliderTimer);
        leftVideoSliderTimer = null;
    }
}

function getLeftVideoSliderDelay(ad) {
    const configuredDelay = ad.leftDelayMs ?? ad.delayedLeftMs ?? ad.appearAfterMs;
    const delay = Number(configuredDelay);

    return Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_LEFT_VIDEO_SLIDER_DELAY_MS;
}

function insertPageAdLayer(overlay, ad, placement, side = "") {
    const key = layerKey(placement, side);
    if (overlay.querySelector(`[data-ad-layer-key="${key}"]`)) return null;

    const slot = renderAdSlot(ad, `site-ad-slot site-ad-${placement}${side ? ` site-ad-${placement}-${side}` : ""}`);
    if (!slot) return null;

    const layer = document.createElement("div");
    layer.className = placementLayerClass(placement, side);
    layer.dataset.adPlacement = placement;
    layer.dataset.adLayerKey = key;
    if (side) layer.dataset.adSide = side;
    layer.appendChild(slot);
    overlay.appendChild(layer);

    debug(ad, "page advertisement inserted", placement, side || "default");
    return layer;
}

export function getAdsByPlacement(placement) {
    return normalizeAds().filter(ad => ad.placement === placement && isEnabledAd(ad));
}

export function renderAdSlot(ad, extraClassName = "") {
    if (!isEnabledAd(ad)) return null;

    ensureDelegateCH(ad);
    ensureProviderScript(ad);

    const slot = document.createElement("div");
    slot.className = ["reader-ad-slot", extraClassName].filter(Boolean).join(" ");
    slot.dataset.adId = ad.id || ad.placement || "advertisement";

    const inner = document.createElement("div");
    inner.className = "reader-ad-inner";

    const ins = document.createElement("ins");
    ins.className = ad.className;
    ins.dataset.zoneid = String(ad.zoneId);

    inner.appendChild(ins);
    slot.appendChild(inner);

    window.setTimeout(() => serve(ad), 0);

    return slot;
}

export function installPageAdvertisements() {
    const overlay = ensurePageAdOverlay();
    const isDesktop = currentDevice() === "desktop";

    clearLeftVideoSliderTimer();

    if (!isDesktop) {
        removeLayer(overlay, DESKTOP_VIDEO_SLIDER_PLACEMENT, "right");
        removeLayer(overlay, DESKTOP_VIDEO_SLIDER_PLACEMENT, "left");
    }

    for (const placement of [
        DESKTOP_VIDEO_SLIDER_PLACEMENT,
        "desktop-fullpage-interstitial",
        "mobile-fullpage-interstitial"
    ]) {
        for (const ad of getAdsByPlacement(placement)) {
            if (placement === DESKTOP_VIDEO_SLIDER_PLACEMENT) {
                insertPageAdLayer(overlay, ad, placement, "right");

                const delay = getLeftVideoSliderDelay(ad);
                leftVideoSliderTimer = window.setTimeout(() => {
                    leftVideoSliderTimer = null;
                    if (currentDevice() !== "desktop") return;
                    insertPageAdLayer(overlay, ad, placement, "left");
                }, delay);

                debug(ad, "left desktop video slider scheduled", delay);
                continue;
            }

            insertPageAdLayer(overlay, ad, placement);
        }
    }
}
