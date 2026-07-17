# Reader virtualization manual verification

1. Run `npm run dev`, open a chapter with a 200-page test manifest, and open the browser console.
2. Run `__animePlexReaderDiagnostics()` and confirm `loadedImages` never exceeds 21 (except for a moment while an image load is being cancelled).
3. Scroll steadily to the end and back to the beginning. Confirm images reload, the continuous scroll remains smooth, and placeholders do not collapse or move the viewport.
4. In the Network panel, confirm distant image requests are not initiated and previously visited distant pages have no `<img>` child in the Elements panel.
5. Simulate an image failure, confirm the error message appears once, then click it and confirm exactly one retry is made.
6. Switch chapters quickly while requests are throttled. Confirm the old chapter never replaces the new one and its observers, timers, listeners, and image elements are removed.
7. Repeat with responsive mobile dimensions and, when available, iPhone Safari and Android Chrome. Check the console for errors and verify the top and bottom navigation controls.
