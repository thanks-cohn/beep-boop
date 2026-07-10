import fetchData from "../data/fetch.json";
import { Storage } from "./storage.js";

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

const workCache = new Map();

function catalogWork(workSlug, catalog = fetchData) {
    return (catalog.works || []).find(work => work.slug === workSlug);
}

function cacheKey(workSlug, catalog) {
    return `${catalog.version || "catalog"}:${catalog.default?.source || ""}:${workSlug}`;
}

export async function loadWork(workSlug, catalog = fetchData) {
    const work = catalogWork(workSlug, catalog);
    if (!work) return null;

    if (Array.isArray(work.chapters) && work.chapters.length > 0) {
        return work;
    }

    const key = cacheKey(workSlug, catalog);
    if (workCache.has(key)) return workCache.get(key);

    const url = manifestUrl(work.manifest);
    const source = work.source || catalog.default?.source || fetchData.default?.source || "e";
    const resolvedUrl = url || `${Storage.work(source, work.slug)}/item.json`;

    const promise = fetch(resolvedUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Work manifest failed: ${response.status}`);
            }
            return response.json();
        })
        .then(manifest => ({
            ...manifest,
            ...work,
            chapters: manifest.chapters || work.chapters || []
        }));

    workCache.set(key, promise);
    return promise;
}

export function workSource(work, fallback = "e") {
    return work?.source || fetchData.default?.source || fallback;
}
