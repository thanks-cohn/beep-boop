import fetchData from "../data/fetch.json";
import { Storage } from "./storage.js";
import { fetchJsonWithRetry } from "../utils/retry.js";

const HTTP_URL = /^https?:\/\//i;
const workManifestUrls = import.meta.glob("../data/works/*.json", {
    eager: true,
    query: "?url",
    import: "default"
});

function dataUrl(path) {
    const normalizedPath = path.replace(/^\/+/, "");
    const bundledUrl = workManifestUrls[`../data/${normalizedPath}`];
    return bundledUrl || `/data/${normalizedPath}`;
}

function manifestUrl(manifest) {
    if (!manifest) return null;
    if (HTTP_URL.test(manifest)) return manifest;
    return dataUrl(manifest.replace(/^\/+/, ""));
}

const WORK_CACHE_MAX = 40;
const workCache = new Map();

function cachePromise(key, promise) {
    workCache.delete(key);
    workCache.set(key, promise);
    while (workCache.size > WORK_CACHE_MAX) workCache.delete(workCache.keys().next().value);
    promise.catch(() => {
        if (workCache.get(key) === promise) workCache.delete(key);
    });
    return promise;
}

function catalogWork(workSlug, catalog = fetchData) {
    return (catalog.works || []).find(work => work.slug === workSlug);
}

function cacheKey(workSlug, catalog) {
    return `${catalog.version || "catalog"}:${catalog.default?.source || ""}:${workSlug}`;
}

export async function loadWork(workSlug, catalog = fetchData, options = {}) {
    const work = catalogWork(workSlug, catalog);
    if (!work) return null;

    if (Array.isArray(work.chapters) && work.chapters.length > 0) {
        return work;
    }

    const key = cacheKey(workSlug, catalog);
    if (options.cache !== false && workCache.has(key)) {
        const cached = workCache.get(key);
        workCache.delete(key);
        workCache.set(key, cached);
        return cached;
    }

    const url = manifestUrl(work.manifest);
    const source = work.source || catalog.default?.source || fetchData.default?.source || "e";
    const resolvedUrl = url || `${Storage.work(source, work.slug)}/item.json`;

    const promise = fetchJsonWithRetry(resolvedUrl, { signal: options.signal, retries: 6, baseDelay: 300, maxDelay: 8000, dedupeKey: `work:${key}` })
        .then(manifest => ({
            ...manifest,
            ...work,
            chapters: manifest.chapters || work.chapters || []
        }));

    return options.cache === false ? promise : cachePromise(key, promise);
}

export function workSource(work, fallback = "e") {
    return work?.source || fetchData.default?.source || fallback;
}
