import { fetchWithRetry } from "../utils/retry.js";
// src/fetch/fetch.js

import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";

const FETCH_FILE = "/src/data/fetch.json";

export class Fetch {

    static #cache = null;

    static async load() {

        if (this.#cache) {
            return this.#cache;
        }

        this.#cache = await fetchWithRetry(FETCH_FILE, {}, { parse: "json", retries: 10 });

        return this.#cache;

    }

    static async works() {

        const data = await this.load();

        return data.works ?? [];

    }

    static async work(slug) {

        const works = await this.works();

        return works.find(work => work.slug === slug) ?? null;

    }

    static async chapter(workSlug, chapterPath) {

        const work = await this.work(workSlug);

        if (!work) {
            throw new Error(`Unknown work "${workSlug}"`);
        }

        const url = Storage.manifest(

            work.source,
            work.slug,
            chapterPath

        );

        let manifest = await fetchWithRetry(url, {}, { parse: "json", retries: 10 });
        manifest = resolveManifest(manifest, work.source, work.slug, chapterPath);
        return manifest;

    }

    static image(manifest, page) {

        const file =

            `${String(page).padStart(manifest.padding, "0")}.${manifest.extension}`;

        return `${manifest.base_url}/${file}`;

    }

}
