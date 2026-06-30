// src/fetch/fetch.js

import { Storage } from "../storage/storage.js";

const FETCH_FILE = "/src/data/fetch.json";

export class Fetch {

    static #cache = null;

    static async load() {

        if (this.#cache) {
            return this.#cache;
        }

        const response = await fetch(FETCH_FILE, {

            cache: "no-store"

        });

        if (!response.ok) {
            throw new Error(`Unable to load ${FETCH_FILE}`);
        }

        this.#cache = await response.json();

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

        const response = await fetch(url, {

            cache: "no-store"

        });

        if (!response.ok) {
            throw new Error(`Unable to load ${url}`);
        }

        return response.json();

    }

    static image(manifest, page) {

        const file =

            `${String(page).padStart(manifest.padding, "0")}.${manifest.extension}`;

        return `${manifest.base_url}/${file}`;

    }

}
