import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// Responsive / layout review across the public pages at representative widths.
// Asserts no horizontal overflow, correct header behavior per breakpoint, and
// captures a screenshot of every page/viewport for visual inspection.

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 }
] as const;

const PAGES = [
  { path: "/", id: "home" },
  { path: "/quick", id: "quick" },
  { path: "/verify", id: "verify" },
  { path: "/history", id: "history" },
  { path: "/terms", id: "terms" },
  { path: "/privacy", id: "privacy" }
] as const;

const SHOT_DIR = resolve(process.cwd(), "output/playwright/review");

async function hasHorizontalOverflow(page: Page): Promise<{ overflow: boolean; scrollW: number; innerW: number }> {
  return page.evaluate(() => {
    const scrollW = document.documentElement.scrollWidth;
    const innerW = window.innerWidth;
    return { overflow: scrollW > innerW + 1, scrollW, innerW };
  });
}

test.beforeAll(async () => {
  await mkdir(SHOT_DIR, { recursive: true });
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const p of PAGES) {
      test(`${p.id} — no horizontal overflow`, async ({ page }) => {
        await page.goto(p.path, { waitUntil: "networkidle" });
        await page.screenshot({ path: `${SHOT_DIR}/${p.id}-${vp.name}.png`, fullPage: false });

        const { overflow, scrollW, innerW } = await hasHorizontalOverflow(page);
        expect(overflow, `horizontal overflow on ${p.path}: scrollWidth ${scrollW} > innerWidth ${innerW}`).toBe(
          false
        );
      });
    }
  });
}

test.describe("header behavior", () => {
  test("desktop: nav on a single row, hamburger hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });

    const result = await page.evaluate(() => {
      const links = [...document.querySelectorAll(".main-nav a")];
      const wrap = document.querySelector(".nav-menu-wrap");
      const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      return {
        linkCount: links.length,
        navRows: rows,
        burgerVisible: !!wrap && getComputedStyle(wrap as Element).display !== "none"
      };
    });

    expect(result.linkCount).toBe(6);
    expect(result.navRows, "nav must be on a single row").toBe(1);
    expect(result.burgerVisible, "hamburger must be hidden on desktop").toBe(false);
  });

  test("mobile: nav hidden, hamburger opens a 6-item menu that closes on outside click", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "networkidle" });

    const navHidden = await page.evaluate(() => {
      const nav = document.querySelector(".main-nav");
      return !nav || getComputedStyle(nav).display === "none";
    });
    expect(navHidden, "desktop nav must be hidden on mobile").toBe(true);

    const toggle = page.locator(".nav-toggle");
    await expect(toggle).toBeVisible();

    await toggle.click();
    const menu = page.locator(".nav-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".nav-menu-item")).toHaveCount(6);

    // Menu stays within the viewport.
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }

    // Outside click closes it.
    await page.mouse.click(10, 400);
    await expect(menu).toHaveCount(0);
  });

  test("mobile: hamburger menu links navigate", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "networkidle" });

    await page.locator(".nav-toggle").click();
    await page.locator(".nav-menu-item", { hasText: "Quick Scan" }).click();
    await expect(page).toHaveURL(/\/quick$/);
  });
});

// WCAG 1.4.10 Reflow / 1.4.4 Resize text. Browser zoom scales CSS pixels, so
// zooming a 1280px window to 200% makes media queries see 640px, and to 400%
// makes them see 320px (the reflow floor). Emulate by narrowing the viewport —
// this triggers the same responsive layout the real zoom would.
test.describe("zoom reflow (WCAG 1.4.10 / 1.4.4)", () => {
  const ZOOMS = [
    { name: "200% (1280 desktop)", width: 640, height: 900 },
    { name: "400% reflow floor", width: 320, height: 800 }
  ] as const;

  for (const z of ZOOMS) {
    test.describe(z.name, () => {
      test.use({ viewport: { width: z.width, height: z.height } });

      for (const p of PAGES) {
        test(`${p.id} — reflows without horizontal scroll`, async ({ page }) => {
          await page.goto(p.path, { waitUntil: "networkidle" });

          const { overflow, scrollW, innerW } = await hasHorizontalOverflow(page);
          expect(
            overflow,
            `horizontal scroll at ${z.name} on ${p.path}: scrollWidth ${scrollW} > innerWidth ${innerW}`
          ).toBe(false);

          // No loss of content: the page heading and a way into the nav remain.
          await expect(page.locator("h1").first()).toBeVisible();
          const navReachable = await page.evaluate(() => {
            const nav = document.querySelector(".main-nav");
            const toggle = document.querySelector(".nav-toggle");
            const navVisible = nav ? getComputedStyle(nav).display !== "none" : false;
            const toggleVisible = toggle
              ? getComputedStyle(toggle.closest(".nav-menu-wrap") as Element).display !== "none"
              : false;
            return navVisible || toggleVisible;
          });
          expect(navReachable, `navigation not reachable at ${z.name} on ${p.path}`).toBe(true);
        });
      }
    });
  }
});
