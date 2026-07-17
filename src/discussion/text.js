const URL_PATTERN = /https?:\/\/[^\s<]+/giu;

export function appendPlainTextWithLinks(container, value) {
    const text = String(value ?? "");
    let position = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
        container.append(document.createTextNode(text.slice(position, match.index)));
        let parsed;
        try { parsed = new URL(match[0]); } catch { parsed = null; }
        if (parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
            const link = document.createElement("a");
            link.href = parsed.href;
            link.target = "_blank";
            link.rel = "nofollow ugc noopener noreferrer";
            link.textContent = match[0];
            container.append(link);
        } else container.append(document.createTextNode(match[0]));
        position = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(position)));
}
