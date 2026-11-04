import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewIntro } from "./ViewIntro.tsx";
import {
  ViewSection,
  ViewSectionBody,
  ViewSectionHeader,
} from "./ViewSection.tsx";

describe("view parts (issue #196)", () => {
  it("gives a view its description and actions without a second h1", () => {
    const markup = renderToStaticMarkup(
      <ViewIntro
        description="Calendar events and planned tasks."
        actions={<button type="button">Today</button>}
      />,
    );
    expect(markup).toContain('data-slot="view-intro"');
    expect(markup).toContain("Calendar events and planned tasks.");
    expect(markup).toContain('data-slot="view-intro-actions"');
    expect(markup).not.toContain("<h1");
  });

  it("renders a labelled section instead of a card", () => {
    const markup = renderToStaticMarkup(
      <ViewSection aria-labelledby="day-order">
        <ViewSectionHeader>
          <h2 id="day-order">Day order</h2>
        </ViewSectionHeader>
        <ViewSectionBody>rows</ViewSectionBody>
      </ViewSection>,
    );
    expect(markup).toMatch(
      /^<section data-slot="view-section"[^>]*aria-labelledby="day-order"/,
    );
    expect(markup).toContain('data-slot="view-section-header"');
    expect(markup).toContain('data-slot="view-section-body"');
    expect(markup).not.toContain('data-slot="card"');
  });
});
