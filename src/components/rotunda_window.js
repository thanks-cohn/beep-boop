export const ROTUNDA_MAX_MOUNTED = 20;
export const ROTUNDA_VISIBLE_EDGE = 3;

export function normalizeRotundaIndex(index, total) {
    if (!total) return 0;
    return ((index % total) + total) % total;
}

// Alternating offsets make the active and nearest cards resolve first. A Set avoids
// duplicates when a circular catalog is smaller than the mounted-card allowance.
export function rotundaWindow(absoluteActiveIndex, total, maximum = ROTUNDA_MAX_MOUNTED) {
    if (total <= 0 || maximum <= 0) return [];
    const entries = [];
    const seen = new Set();
    const limit = Math.min(total, maximum);
    for (let radius = 0; entries.length < limit; radius += 1) {
        const offsets = radius === 0 ? [0] : [-radius, radius];
        for (const distance of offsets) {
            const index = normalizeRotundaIndex(absoluteActiveIndex + distance, total);
            if (seen.has(index)) continue;
            seen.add(index);
            entries.push({ index, distance, visible: Math.abs(distance) <= ROTUNDA_VISIBLE_EDGE });
            if (entries.length === limit) break;
        }
    }
    return entries;
}
