import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

test("map controls wait for initialization before accepting input", {
    skip: !process.env.GEOSINT_TEST_URL,
}, async (t) => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({
        channel: process.env.GEOSINT_BROWSER_CHANNEL,
        headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    let releaseStyle;
    const styleReady = new Promise((resolve) => {
        releaseStyle = resolve;
    });
    t.after(() => releaseStyle());
    await page.route(
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        async (route) => {
            await styleReady;
            if (!page.isClosed()) {
                await route.fulfill({
                    json: { version: 8, sources: {}, layers: [] },
                });
            }
        },
    );
    await page.goto(process.env.GEOSINT_TEST_URL);
    await page.locator("#loader.done").waitFor({ state: "attached" });

    for (
        const id of [
            "btn-coord",
            "btn-zoom-in",
            "btn-zoom-out",
            "btn-satellite",
            "btn-expand",
            "btn-map-hide",
            "btn-reset",
        ]
    ) {
        assert.equal(await page.locator("#" + id).isDisabled(), true, id);
    }
    assert.equal(await page.locator("#dock-grip").getAttribute("aria-disabled"), "true");
    assert.equal(await page.locator("#dock-grip").getAttribute("tabindex"), "-1");

    releaseStyle();
    await page.waitForFunction(() => !document.getElementById("btn-coord").disabled);
    await page.locator("#btn-coord").click();
    assert.equal(await page.locator("#coord-input").isVisible(), true);
    assert.equal(await page.locator("#dock-grip").getAttribute("aria-disabled"), "false");
    assert.equal(await page.locator("#dock-grip").getAttribute("tabindex"), "0");
});
