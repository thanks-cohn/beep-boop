import { Storage } from "../storage/storage.js";
import { resolveManifest } from "../storage/manifest_resolver.js";
import fetchData from "../data/fetch.json";
import { getAdsByPlacement, renderAdSlot } from "../components/ads.js";

function getWorkRecord(workSlug) {
    return (fetchData.works || []).find(work => work.slug === workSlug);
}

function getChapterList(workSlug) {
    const work = getWorkRecord(workSlug);
    return work?.chapters || [];
}

function openChapter(source, work, chapter) {
    window.dispatchEvent(new CustomEvent("open-reader", {
        detail: { source, work, chapter }
    }));
}

function chapterLabel(chapter) {
    return String(chapter)
        .replaceAll("_", " ")
        .replaceAll("/", " / ");
}

function buildReaderNavBar(source, work, chapter, options = {}) {
    const chapters = getChapterList(work);
    const currentIndex = chapters.indexOf(chapter);

    const homeBar = document.createElement("div");
    homeBar.className = ["reader-home-bar", options.className].filter(Boolean).join(" ");

    const homeButton = document.createElement("button");
    homeButton.className = "reader-home-button";
    homeButton.type = "button";
    homeButton.textContent = "⌂ Home";
    homeButton.addEventListener("click", () => {
        document.body.classList.remove("reader-active");
        window.location.href = "/";
    });

    const prevButton = document.createElement("button");
    prevButton.className = "reader-home-button";
    prevButton.type = "button";
    prevButton.textContent = "← Previous";
    prevButton.disabled = currentIndex <= 0;
    prevButton.addEventListener("click", () => {
        if (currentIndex > 0) {
            openChapter(source, work, chapters[currentIndex - 1]);
        }
    });

    const select = document.createElement("select");
    select.className = "reader-chapter-select";

    for (const item of chapters) {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = chapterLabel(item);
        option.selected = item === chapter;
        select.appendChild(option);
    }

    select.addEventListener("change", () => {
        openChapter(source, work, select.value);
    });

    const nextButton = document.createElement("button");
    nextButton.className = "reader-home-button";
    nextButton.type = "button";
    nextButton.textContent = "Next →";
    nextButton.disabled = currentIndex < 0 || currentIndex >= chapters.length - 1;
    nextButton.addEventListener("click", () => {
        if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
            openChapter(source, work, chapters[currentIndex + 1]);
        }
    });

    const lastButton = document.createElement("button");
    lastButton.className = "reader-home-button";
    lastButton.type = "button";
    lastButton.textContent = "Last";
    lastButton.disabled = chapters.length === 0 || currentIndex === chapters.length - 1;
    lastButton.addEventListener("click", () => {
        if (chapters.length > 0) {
            openChapter(source, work, chapters[chapters.length - 1]);
        }
    });

    const leftGroup = document.createElement("div");
    leftGroup.className = "reader-bar-left";

    const middleGroup = document.createElement("div");
    middleGroup.className = "reader-bar-middle";

    const rightGroup = document.createElement("div");
    rightGroup.className = "reader-bar-right";

    leftGroup.appendChild(homeButton);

    middleGroup.appendChild(prevButton);
    middleGroup.appendChild(select);
    middleGroup.appendChild(nextButton);

    rightGroup.appendChild(lastButton);

    homeBar.appendChild(leftGroup);
    homeBar.appendChild(middleGroup);
    homeBar.appendChild(rightGroup);

    return homeBar;
}

function buildReaderTopBar(source, work, chapter) {
    return buildReaderNavBar(source, work, chapter);
}

function getBetweenReaderPagesAd() {
    return getAdsByPlacement("between-reader-pages")[0] || null;
}

function shouldInsertReaderAd(ad, pageNumber, totalPages) {
    const everyPages = Number(ad?.everyPages || 0);

    return everyPages > 0 &&
        pageNumber < totalPages &&
        pageNumber % everyPages === 0;
}


function installReaderChromeAutohide(bar) {
    let hideTimer = null;

    function showThenHide() {
        bar.classList.remove("reader-nav-hidden");

        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (document.body.classList.contains("reader-active")) {
                bar.classList.add("reader-nav-hidden");
            }
        }, 1400);
    }

    if (window.__readerNavScrollHandler) {
        window.removeEventListener("scroll", window.__readerNavScrollHandler);
    }

    window.__readerNavScrollHandler = showThenHide;
    window.addEventListener("scroll", window.__readerNavScrollHandler, { passive: true });

    bar.addEventListener("mouseenter", showThenHide);
    bar.addEventListener("focusin", showThenHide);

    showThenHide();
}

async function renderManifestInto(root, manifestUrl, source, work, chapter) {
    if (!root || !manifestUrl) {
        console.warn("Reader: missing root or manifestUrl.");
        return;
    }

    document.body.classList.add("reader-active");

    let manifest = await fetch(manifestUrl).then(r => {
        if (!r.ok) {
            throw new Error(`Manifest failed: ${r.status}`);
        }
        return r.json();
    });

    manifest = resolveManifest(manifest, source, work, chapter);

    const wrapper = document.createElement("div");
    wrapper.className = "reader-pages";

    const readerBar = buildReaderTopBar(source, work, chapter);
    wrapper.appendChild(readerBar);
    installReaderChromeAutohide(readerBar);

    const anchor = document.createElement("div");
    anchor.id = "chapter-start";
    wrapper.appendChild(anchor);

    const betweenPagesAd = getBetweenReaderPagesAd();

    for (let i = 1; i <= manifest.pages; i++) {
        const img = document.createElement("img");

        img.className = "reader-page";

        img.loading = (i <= 3) ? "eager" : "lazy";
        img.decoding = "async";

        img.style.background = "#050505";
        img.style.display = "block";
        img.style.width = "100%";
        img.style.minHeight = "100vh";

        img.onload = () => {
            img.style.minHeight = "";
            img.style.background = "transparent";
        };

        img.onerror = () => {
            img.style.background = "#222";
        };

        img.src =
            `${manifest.base_url}/` +
            `${String(i).padStart(manifest.padding, "0")}.${manifest.extension}`;

        wrapper.appendChild(img);

        if (shouldInsertReaderAd(betweenPagesAd, i, manifest.pages)) {
            const adSlot = renderAdSlot(betweenPagesAd);

            if (adSlot) {
                wrapper.appendChild(adSlot);
            }
        }
    }

    const bottomReaderBar = buildReaderNavBar(source, work, chapter, {
        className: "reader-bottom-bar"
    });
    wrapper.appendChild(bottomReaderBar);

    root.replaceChildren(wrapper);

    setTimeout(() => {
        anchor.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 50);
}

export class Reader {
    static async start(work, chapter) {
        const container = document.getElementById("reader-container");

        if (!container) return;

        const source =
            new URLSearchParams(window.location.search).get("source") || "e";

        const manifestUrl = Storage.manifest(source, work, chapter);

        try {
            await renderManifestInto(container, manifestUrl, source, work, chapter);
        } catch (err) {
            console.error("Reader failed:", err);

            container.innerHTML = `
                <div class="reader-error">
                    <h2>Failed to load chapter</h2>
                </div>
            `;
        }
    }
}

window.addEventListener("open-reader", async (e) => {
    const entry = e.detail;
    const root = document.getElementById("blocks-reader") || document.getElementById("blocks-root");

    if (!root) {
        console.warn("Reader: blocks-root missing. Refusing to wipe page.");
        return;
    }

    const source = entry.source || "e";
    const work = entry.work || entry.slug || entry.work_slug;
    const chapter = entry.chapter || entry.chapter_path;

    const manifestUrl =
        entry.manifest_url || Storage.manifest(source, work, chapter);

    try {
        await renderManifestInto(root, manifestUrl, source, work, chapter);
    } catch (err) {
        console.error("Reader failed:", err);

        root.innerHTML = `
            <div class="reader-error">
                <h2>Failed to load chapter</h2>
            </div>
        `;
    }
});
