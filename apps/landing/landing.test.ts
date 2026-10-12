import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname);
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");

describe("landing page (issue #176)", () => {
  it("states what Tadooer is, who it is for, how it runs and where the source is", () => {
    expect(html).toContain("The plan, and the one thing now.");
    expect(html).toMatch(/one owner/i);
    expect(html).toContain('id="setup"');
    expect(html).toContain(
      "https://git.subcult.tv/subculture-collective/tadooer",
    );
    expect(html).toContain("docs/operations/baikal-setup.md");
  });

  it("keeps the voice rules: no sign-up, no server address, no hustle", () => {
    expect(html).not.toMatch(/sign up/i);
    expect(html).not.toMatch(/tadooer\.subcult\.tv/);
    expect(html).not.toMatch(/!\s*</);
    expect(html).not.toMatch(/get more done|supercharge|streak/i);
    expect(html).toMatch(/no hosted service and no sign-up/);
  });

  it("references only assets and anchors that exist", () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    );
    for (const ref of refs) {
      if (ref.startsWith("http")) continue;
      if (ref.startsWith("#")) {
        expect(html, ref).toContain(`id="${ref.slice(1)}"`);
        continue;
      }
      expect(existsSync(join(root, ref)), ref).toBe(true);
    }
  });

  it("uses dvh rather than vh for the viewport height", () => {
    expect(css).not.toMatch(/100vh/);
    expect(css).toContain("100dvh");
  });

  it("gives every image alt text and every section a heading", () => {
    for (const img of html.matchAll(/<img\b[^>]*>/g))
      expect(img[0], img[0]).toMatch(/\balt="/);
    for (const section of html.matchAll(
      /<section[^>]*aria-labelledby="([^"]+)"/g,
    ))
      expect(html).toContain(`id="${section[1] ?? ""}"`);
  });
});
