import { Storage } from "./storage.js";

export function resolveManifest(manifest, source, slug, chapter) {
    if (!manifest) {
        throw new Error("resolveManifest(): manifest is null.");
    }

    const baseUrl = manifest.base_url || Storage.chapter(source, slug, chapter);

    return {
        ...manifest,
        base_url: baseUrl
    };
}
