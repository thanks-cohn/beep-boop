# Rotunda Coverflow / Showcase Report

## 1. What changed

The landing-page rotunda was changed from a free-scrolling horizontal row into an index-driven coverflow/showcase. One work is now always marked as the active featured card, and the other cards are positioned around it with CSS transforms instead of pixel scrolling.

## 2. Why it changed

The old rotunda behaved like a basic scroll strip. The requested design needs a premium, cinematic showcase where one cover is clearly centered, larger, brighter, and visually dominant while nearby works recede with perspective. An active-index model makes the experience deterministic: every arrow click advances or reverses by exactly one work.

## 3. Files modified

- `src/components/rotunda.js`
- `src/styles/rotunda.css`
- `docs/rotunda-coverflow-report.md`

## 4. What each modified file does

### `src/components/rotunda.js`

This file loads the rotunda works, builds each card button, opens the reader for a clicked card, and owns the active coverflow state. It assigns each rendered card a `data-rotunda-position` value based on its signed distance from the active card. It also passes each cover image into a CSS custom property so the generated reflection can mirror the actual book cover instead of relying on a generic sheen.

### `src/styles/rotunda.css`

This file now provides the coverflow layout and premium visual treatment. Cards are absolutely positioned from the center of the rotunda and animated with `translate`, `scale`, `rotateY`, opacity, brightness, z-index, glow, and reflection styles.

### `docs/rotunda-coverflow-report.md`

This file documents the implementation, tuning points, behavior, visual effects, clipping strategy, mobile support, and testing.

## 5. How the active/featured rotunda work is tracked

`src/components/rotunda.js` keeps an `activeIndex` variable after rendering the cards. The `setActiveCard(index)` function normalizes the requested index so it wraps around the card list, stores it as `activeIndex`, and updates every card based on its signed distance from that active card.

Each card receives:

- `data-rotunda-position="0"` for the active center card.
- `data-rotunda-position="-1"` or `"1"` for immediate neighbors.
- `data-rotunda-position="-2"` or `"2"` for farther cards.
- `data-rotunda-position="-3"` or `"3"` for far edge cards after clamping.
- `aria-current="true"` only on the active card.
- `.is-active` only on the active card.

## 6. How arrow clicks move exactly one work at a time

The rotunda controls call `moveBy(direction)` on click. `direction` is `1` for the right arrow and `-1` for the left arrow. `moveBy()` calls `setActiveCard(activeIndex + direction)`, so each click changes the active index by exactly one work. There is no continuous pointer-hold scrolling or pixel-based `scrollBy()` behavior anymore.

## 7. How the center work is brought to the front

The active card is identified with `data-rotunda-position="0"` and `.is-active`. CSS gives it the largest scale, full opacity, highest brightness, and the highest z-index. Because all cards are absolutely positioned from the rotunda center, the active card is always translated to the middle and visually sits in front of the rest.

## 8. How the visual effects work

### Scaling

The active card uses the largest `--rotunda-scale`. Immediate neighbors use a smaller scale, and farther cards continue to shrink. These values are defined in `src/styles/rotunda.css` under the `data-rotunda-position` selectors.

### Z-index

The active card has the highest z-index. Neighbor cards have lower z-index values, and far cards have the lowest values. This makes the selected work visually dominant and prevents side cards from painting over it.

### Perspective and angle

The track has `perspective: 1200px`, and side cards use `rotateY()` through the `--rotunda-rotate` custom property. Left cards rotate one way, right cards rotate the opposite way, creating the coverflow perspective.

### Glow and shadow

All covers have a dark cinematic shadow. The active card receives a stronger shadow, purple glow, and brighter outline on `.rotunda-card.is-active .rotunda-cover-frame`.

### Reflection

Each card has a generated `::after` reflection beneath it. The reflection now uses the card cover image through `--rotunda-reflection-image`, then layers a soft purple/blue glass sheen over it. The reflection is vertically flipped, lightly blurred, masked with a longer fade, and blended like light on a glossy surface. The active card sets a much higher `--rotunda-reflection-opacity`, so its reflection reads clearly as the strongest, dreamiest reflection while side cards remain tasteful and softer.

## 9. How clipping was avoided

The rotunda container, viewport, and track use visible overflow where needed. This pass increased `.landing-rotunda` min-height, top padding, and bottom padding; increased `.rotunda-scroll-viewport` and `.rotunda-track` min-heights; and raised the card bottom offset. Those changes give the scaled active card, purple glow, title, reflection, and glossy floor light room to render without clipping, while preserving the active card scale.

## 10. How mobile/touch behavior was preserved

The rotunda keeps card buttons as normal clickable controls, so tapping a card still opens the correct work. The viewport uses `touch-action: pan-y` so vertical page scrolling remains natural on touch devices. A horizontal touch swipe on the rotunda changes the active work by one card, matching arrow behavior. Mobile CSS reduces card sizes and hides far cards to keep the showcase usable on narrow screens.

## 11. How to tune the effect later

Tune these values in `src/styles/rotunda.css`:

- **Active scale:** change `--rotunda-scale` in `.rotunda-card[data-rotunda-position="0"]`.
- **Side card scale:** change `--rotunda-scale` in the `-1`, `1`, `-2`, and `2` position rules.
- **Horizontal spread:** change `--rotunda-x` in the position rules.
- **Perspective angle:** change `--rotunda-rotate` in the side-card rules or `perspective` on `.rotunda-track`.
- **Transition speed:** change the `transform` transition on `.rotunda-card`.
- **Reflection opacity:** change `--rotunda-reflection-opacity` on each position rule, especially the active rule. The active value is intentionally high so the center cover has an obvious premium glass reflection.
- **Rotunda height/padding:** change `min-height` and `padding` on `.landing-rotunda`, `.rotunda-scroll-viewport`, and `.rotunda-track`.
- **Glow strength:** change the active `.rotunda-cover-frame` `box-shadow` values.

Tune these values in `src/components/rotunda.js`:

- **Visible edge distance:** change `ROTUNDA_VISIBLE_EDGE`.
- **Swipe sensitivity:** change `ROTUNDA_SWIPE_THRESHOLD`.

## 12. How it was tested

Testing performed:

- Ran a production build with `npm run build`.
- Verified that each card sets `--rotunda-reflection-image` from its cover source so the reflection mirrors the actual work cover.
- Verified in CSS that `.landing-rotunda`, `.rotunda-scroll-viewport`, and `.rotunda-track` have taller min-heights and visible overflow for the scaled card, title, glow, and reflection.
- Verified in CSS that card bottom offset and bottom padding provide extra floor space beneath the books without reducing the active scale.
- Verified in CSS that the active reflection has stronger opacity, less blur, a longer mask, and a glossy purple/blue overlay so it is visibly rendered beneath the center book.
- Reviewed the implementation to verify that the first card starts active through `setActiveCard(0)`.
- Verified in code that right-arrow clicks call `moveBy(1)` and left-arrow clicks call `moveBy(-1)`.
- Verified in code that card clicks still dispatch the same `open-reader` event with the clicked card's source, work slug, and chapter.
- Verified in CSS that the active card is centered, larger, brighter, highest z-index, and has the strongest glow/reflection.
- Verified in CSS that clipping is avoided with visible overflow and increased rotunda sizing.
- Verified in CSS/JS that mobile remains usable through smaller card sizing, hidden far cards, retained button clicks, vertical pan support, and one-card swipe navigation.

## 14. Header identity, ghost layer, ticker placement, and keyboard navigation update

This update restores the real landing header UI above the decorative atmosphere:

- `src/page/landing.js` now renders an explicit `ANIMEPLEX` home brand on the top-left and keeps the existing search mount on the top-right inside the highest header UI layer.
- The former top ticker role is split into a non-interactive `ghost-text-layer` in the header and a real ticker section placed after the rotunda, so the atmospheric words cannot replace, cover, or intercept the logo/search UI.
- `src/styles/landing.css` gives the brand and search a higher z-index than the ghost text, keeps the ghost text dim with `pointer-events: none`, and makes the ticker stable underneath the coverflow rotunda before the main columns.
- `src/components/rotunda.js` adds hover-scoped ArrowLeft/ArrowRight navigation. A window-level keydown listener only moves the coverflow while the pointer is over the rotunda, skips input/search/textarea/select/contenteditable targets, and prevents default only for handled rotunda arrow keys. Existing click arrows and mobile swipe navigation remain unchanged.

Affected files:

- `src/page/landing.js`
- `src/styles/landing.css`
- `src/components/rotunda.js`
- `docs/rotunda-coverflow-report.md`
