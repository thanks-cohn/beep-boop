import assert from "node:assert/strict";
import test from "node:test";
import { ROTUNDA_MAX_MOUNTED, rotundaWindow } from "../src/components/rotunda_window.js";

for (const total of [0, 1, 6, 20, 21, 500]) {
    test(`bounded, unique circular window for ${total} works`, () => {
        for (const active of [-1001, -1, 0, 1, 499, 1001]) {
            const window = rotundaWindow(active, total);
            assert.equal(window.length, Math.min(total, ROTUNDA_MAX_MOUNTED));
            assert.equal(new Set(window.map(entry => entry.index)).size, window.length);
            assert.ok(window.every(entry => entry.index >= 0 && entry.index < total));
            assert.ok(window.filter(entry => entry.visible).length <= 7);
        }
    });
}

test("wraps both directions and prioritizes nearby works", () => {
    assert.deepEqual(rotundaWindow(0, 30).slice(0, 5).map(entry => entry.index), [0, 29, 1, 28, 2]);
    assert.equal(rotundaWindow(-1, 30)[0].index, 29);
    assert.equal(rotundaWindow(30, 30)[0].index, 0);
});
