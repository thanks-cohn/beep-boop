import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import { loadWork } from "../storage/work_manifest.js";
import rotunda from "../data/rotunda.json";
import storage from "../data/storage.json";
import { ROTUNDA_MAX_MOUNTED, rotundaWindow } from "./rotunda_window.js";
import "../styles/rotunda.css";

const ROTUNDA_METADATA_CACHE_MAX = 40;
const ROTUNDA_THUMBNAIL_CACHE_MAX = 40;
const ROTUNDA_REQUEST_CONCURRENCY = 4;
const ROTUNDA_SWIPE_THRESHOLD = 42;

function warnDev(message, error) {
    if (!import.meta.env.DEV) return;
    if (error) console.warn(message, error);
    else console.warn(message);
}

function uniqueUrls(urls) {
    return [...new Set(urls.filter(Boolean))];
}

class LruCache {
    constructor(maximum) {
        this.maximum = maximum;
        this.values = new Map();
    }

    get(key) {
        if (!this.values.has(key)) return undefined;
        const value = this.values.get(key);
        this.values.delete(key);
        this.values.set(key, value);
        return value;
    }

    set(key, value) {
        this.values.delete(key);
        this.values.set(key, value);
        while (this.values.size > this.maximum) {
            this.values.delete(this.values.keys().next().value);
        }
        return value;
    }

    delete(key) { this.values.delete(key); }
    clear() { this.values.clear(); }
    get size() { return this.values.size; }
}

function openReader(card) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: { source: card.source, work: card.slug, chapter: card.chapter }
    }));
}

function initialCard(work, sources, defaultSource) {
    const source = work.source || defaultSource;
    if (!sources[source]) {
        warnDev(`Rotunda: "${work.slug}" has an unknown source.`);
        return null;
    }
    const sourceThumb = `${Storage.work(source, work.slug)}/thumb.webp`;
    return {
        title: work.display || work.slug,
        slug: work.slug,
        source,
        chapter: work.chapters?.[0] || null,
        imageCandidates: uniqueUrls([work.thumb, sourceThumb])
    };
}

function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" ||
        target.isContentEditable || Boolean(target.closest("[contenteditable='true']"));
}

export class Rotunda {
    static cleanup = null;

    static async start() {
        Rotunda.cleanup?.();

        const container = document.querySelector(".landing-rotunda");
        if (!container) return;

        const environment = storage.active;
        const sources = storage[environment]?.sources ?? {};
        const works = rotunda.works ?? [];
        const defaultSource = rotunda.default?.source || "e";
        const metadataCache = new LruCache(ROTUNDA_METADATA_CACHE_MAX);
        const thumbnailCache = new LruCache(ROTUNDA_THUMBNAIL_CACHE_MAX);
        const mounted = new Map();
        let absoluteActiveIndex = 0;
        let generation = 0;
        let renderController = null;
        let destroyed = false;
        let hovered = false;
        let touchStart = null;
        let touchMoved = false;

        const viewport = document.createElement("div");
        viewport.className = "rotunda-scroll-viewport";
        const track = document.createElement("div");
        track.className = "rotunda-track";
        const status = document.createElement("div");
        status.className = "rotunda-status";
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
        viewport.append(track, status);
        container.replaceChildren(viewport);

        function clearImage(record) {
            record.imageAbort?.abort();
            record.imageAbort = null;
            record.img.onload = null;
            record.img.onerror = null;
            record.img.removeAttribute("src");
            record.button.style.removeProperty("--rotunda-reflection-image");
        }

        function unmount(record) {
            clearImage(record);
            record.button.onclick = null;
            record.button.remove();
        }

        function setThumbnail(record, card, signal) {
            clearImage(record);
            const controller = new AbortController();
            record.imageAbort = controller;
            signal.addEventListener("abort", () => controller.abort(), { once: true });
            let candidate = 0;
            let triedFirstPage = false;

            const assign = url => {
                if (!url || controller.signal.aborted) return;
                record.img.style.visibility = "visible";
                record.img.src = url;
                record.button.style.setProperty("--rotunda-reflection-image", `url("${url}")`);
            };
            record.img.onerror = async () => {
                if (controller.signal.aborted) return;
                record.img.style.visibility = "hidden";
                candidate += 1;
                if (card.imageCandidates[candidate]) {
                    assign(card.imageCandidates[candidate]);
                    return;
                }
                if (triedFirstPage || !card.chapter) return;
                triedFirstPage = true;
                const key = Storage.manifest(card.source, card.slug, card.chapter);
                let promise = thumbnailCache.get(key);
                if (!promise) {
                    promise = fetch(key, { signal: controller.signal })
                        .then(response => {
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            return response.json();
                        })
                        .then(json => {
                            const manifest = resolveManifest(json, card.source, card.slug, card.chapter);
                            return `${manifest.base_url}/${String(1).padStart(manifest.padding ?? 3, "0")}.${manifest.extension || "webp"}`;
                        })
                        .catch(error => {
                            if (thumbnailCache.get(key) === promise) thumbnailCache.delete(key);
                            throw error;
                        });
                    thumbnailCache.set(key, promise);
                }
                try { assign(await promise); }
                catch (error) {
                    if (error.name !== "AbortError") warnDev(`Rotunda: thumbnail fallbacks failed for "${card.slug}".`, error);
                }
            };
            assign(card.imageCandidates[0]);
        }

        function updateRecord(record, card, entry, signal) {
            record.card = card;
            record.button.dataset.logicalIndex = String(entry.index);
            record.button.dataset.rotundaPosition = entry.visible ? String(entry.distance) : "buffered";
            record.button.dataset.rotundaDistance = String(Math.abs(entry.distance));
            record.button.classList.toggle("is-active", entry.distance === 0);
            record.button.setAttribute("aria-current", entry.distance === 0 ? "true" : "false");
            record.button.setAttribute("aria-hidden", entry.visible ? "false" : "true");
            record.button.tabIndex = entry.visible && Math.abs(entry.distance) <= 2 ? 0 : -1;
            record.button.setAttribute("aria-label", card.chapter ? `Open ${card.title}` : card.title);
            record.img.alt = card.title;
            record.overlayTitle.textContent = card.title;
            record.title.textContent = card.title;
            setThumbnail(record, card, signal);
        }

        function mount(entry, card, signal) {
            const button = document.createElement("button");
            button.className = "rotunda-card";
            button.type = "button";
            const frame = document.createElement("div");
            frame.className = "rotunda-cover-frame";
            const img = document.createElement("img");
            img.className = "rotunda-cover";
            const overlay = document.createElement("div");
            overlay.className = "rotunda-overlay";
            const overlayTitle = document.createElement("span");
            overlayTitle.className = "rotunda-overlay-title";
            const action = document.createElement("span");
            action.className = "rotunda-overlay-action";
            action.textContent = "Start Volume 1 · Chapter 1";
            const title = document.createElement("div");
            title.className = "rotunda-title";
            overlay.append(overlayTitle, action);
            frame.append(img, overlay);
            button.append(frame, title);
            const record = { button, img, overlayTitle, title, card: null, imageAbort: null };
            button.onclick = () => {
                if (!touchMoved && record.card?.chapter) openReader(record.card);
            };
            updateRecord(record, card, entry, signal);
            track.append(button);
            return record;
        }

        function diagnostics(entries = rotundaWindow(absoluteActiveIndex, works.length)) {
            const records = [...mounted.values()];
            return {
                totalLogicalWorks: works.length,
                activeLogicalIndex: works.length ? ((absoluteActiveIndex % works.length) + works.length) % works.length : 0,
                absoluteActiveIndex,
                mountedDomCardCount: track.querySelectorAll(".rotunda-card").length,
                loadedImageCount: records.filter(record => record.img.hasAttribute("src")).length,
                visibleIndices: entries.filter(entry => entry.visible).map(entry => entry.index),
                bufferedIndices: entries.filter(entry => !entry.visible).map(entry => entry.index),
                metadataCacheSize: metadataCache.size,
                thumbnailCacheSize: thumbnailCache.size,
                renderGeneration: generation
            };
        }

        function assertBounds(entries) {
            if (!import.meta.env.DEV) return;
            const info = diagnostics(entries);
            const visible = entries.filter(entry => entry.visible).map(entry => entry.index);
            if (info.mountedDomCardCount > ROTUNDA_MAX_MOUNTED) console.warn("Rotunda mounted-card limit exceeded.", info);
            if (info.loadedImageCount > ROTUNDA_MAX_MOUNTED) console.warn("Rotunda loaded-image limit exceeded.", info);
            if (new Set(visible).size !== visible.length) console.warn("Rotunda has duplicate visible logical works.", info);
            if (track.querySelectorAll('[aria-current="true"]').length > 1) console.warn("Rotunda has multiple active cards.", info);
        }

        async function resolveEntry(entry, localGeneration, signal) {
            const work = works[entry.index];
            const cached = metadataCache.get(work.slug);
            if (cached) return cached;
            const base = initialCard(work, sources, defaultSource);
            if (!base) return null;
            try {
                const resolved = await loadWork(work.slug, rotunda, { signal, cache: false });
                if (signal.aborted || localGeneration !== generation) return null;
                const source = resolved?.source || base.source;
                const chapter = resolved?.chapters?.[0];
                if (!sources[source] || !chapter) return { ...base, chapter: null };
                const card = {
                    ...base,
                    title: resolved.display || base.title,
                    source,
                    chapter,
                    imageCandidates: uniqueUrls([work.thumb, resolved.thumb, `${Storage.work(source, work.slug)}/thumb.webp`])
                };
                metadataCache.set(work.slug, card);
                return card;
            } catch (error) {
                if (error.name !== "AbortError") warnDev(`Rotunda: failed to load "${work.slug}".`, error);
                return null;
            }
        }

        function render() {
            generation += 1;
            const localGeneration = generation;
            renderController?.abort();
            renderController = new AbortController();
            const signal = renderController.signal;
            const entries = rotundaWindow(absoluteActiveIndex, works.length);
            const wanted = new Set(entries.map(entry => entry.index));
            for (const [index, record] of mounted) {
                if (!wanted.has(index)) {
                    unmount(record);
                    mounted.delete(index);
                }
            }
            for (const entry of entries) {
                const base = metadataCache.get(works[entry.index].slug) || initialCard(works[entry.index], sources, defaultSource);
                if (!base) continue;
                const existing = mounted.get(entry.index);
                if (existing) updateRecord(existing, base, entry, signal);
                else mounted.set(entry.index, mount(entry, base, signal));
            }
            const activeEntry = entries.find(entry => entry.distance === 0);
            if (activeEntry) status.textContent = `${works[activeEntry.index].display || works[activeEntry.index].slug}. Work ${activeEntry.index + 1} of ${works.length}.`;
            else status.textContent = "No works available.";
            assertBounds(entries);

            let cursor = 0;
            const worker = async () => {
                while (!signal.aborted && cursor < entries.length) {
                    const entry = entries[cursor++];
                    const card = await resolveEntry(entry, localGeneration, signal);
                    if (!card || signal.aborted || localGeneration !== generation) continue;
                    const record = mounted.get(entry.index);
                    if (record) updateRecord(record, card, entry, signal);
                    if (entry.distance === 0) status.textContent = `${card.title}. Work ${entry.index + 1} of ${works.length}.`;
                }
                assertBounds(entries);
            };
            for (let i = 0; i < Math.min(ROTUNDA_REQUEST_CONCURRENCY, entries.length); i += 1) worker();
        }

        const moveBy = direction => {
            if (!works.length) return;
            absoluteActiveIndex += direction;
            render();
        };
        const keydown = event => {
            if (!hovered || isTypingTarget(event.target)) return;
            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!direction) return;
            event.preventDefault();
            moveBy(direction);
        };
        const pointerEnter = () => { hovered = true; };
        const pointerLeave = () => { hovered = false; };
        const pointerDown = event => {
            if (event.pointerType !== "mouse") touchStart = [event.clientX, event.clientY];
            touchMoved = false;
        };
        const pointerUp = event => {
            if (!touchStart) return;
            const [x, y] = touchStart;
            touchStart = null;
            const dx = event.clientX - x;
            const dy = event.clientY - y;
            if (Math.abs(dx) < ROTUNDA_SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
            touchMoved = true;
            moveBy(dx < 0 ? 1 : -1);
            window.setTimeout(() => { touchMoved = false; }, 0);
        };

        const controls = document.createElement("div");
        controls.className = "rotunda-controls";
        controls.setAttribute("aria-label", "Rotunda navigation");
        for (const [direction, label, glyph] of [[-1, "Show previous rotunda work", "‹"], [1, "Show next rotunda work", "›"]]) {
            const arrow = document.createElement("button");
            arrow.className = `rotunda-arrow rotunda-arrow-${direction < 0 ? "left" : "right"}`;
            arrow.type = "button";
            arrow.setAttribute("aria-label", label);
            arrow.textContent = glyph;
            arrow.onclick = () => moveBy(direction);
            controls.append(arrow);
        }
        container.append(controls);
        container.addEventListener("pointerenter", pointerEnter);
        container.addEventListener("pointerleave", pointerLeave);
        viewport.addEventListener("pointerdown", pointerDown);
        viewport.addEventListener("pointerup", pointerUp);
        window.addEventListener("keydown", keydown);

        if (import.meta.env.DEV) window.__rotundaDiagnostics = diagnostics;
        Rotunda.cleanup = () => {
            if (destroyed) return;
            destroyed = true;
            generation += 1;
            renderController?.abort();
            window.removeEventListener("keydown", keydown);
            container.removeEventListener("pointerenter", pointerEnter);
            container.removeEventListener("pointerleave", pointerLeave);
            viewport.removeEventListener("pointerdown", pointerDown);
            viewport.removeEventListener("pointerup", pointerUp);
            for (const record of mounted.values()) unmount(record);
            mounted.clear();
            metadataCache.clear();
            thumbnailCache.clear();
            container.replaceChildren();
            if (import.meta.env.DEV && window.__rotundaDiagnostics === diagnostics) delete window.__rotundaDiagnostics;
            Rotunda.cleanup = null;
        };
        render();
    }
}
