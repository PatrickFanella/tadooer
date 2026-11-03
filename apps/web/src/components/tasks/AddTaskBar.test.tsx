import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddTaskBar, type AddTaskBarProps } from "./AddTaskBar.tsx";

const render = (overrides: Partial<AddTaskBarProps> = {}) =>
  renderToStaticMarkup(
    <AddTaskBar
      busy={false}
      online={true}
      csrfToken={undefined}
      onSubmit={() => Promise.resolve()}
      {...overrides}
    />,
  );

describe("AddTaskBar (issue #194)", () => {
  it("sends markers by default while online", () => {
    const html = render();
    expect(html).toContain('aria-label="Add a task"');
    expect(html).toContain('data-markers="on"');
    expect(html).toContain('name="structured"');
    expect(html).toContain('name="title"');
    expect(html).toContain("Try +Project #tag 30m @tomorrow 09:00");
    expect(html).not.toContain("Offline: plain capture");
    expect(html).not.toContain('name="notes"');
  });

  it("captures plainly offline and says so", () => {
    const html = render({ online: false });
    expect(html).toContain('data-markers="offline"');
    expect(html).not.toContain('name="structured"');
    expect(html).toContain("Offline: plain capture");
  });

  it("offers the paste dialog only with a session token", () => {
    expect(render()).not.toContain("Paste a list");
    expect(render({ csrfToken: "token" })).not.toContain("Paste a list");
    // The More line is closed by default; it holds the paste button.
    expect(render({ csrfToken: "token" })).toContain('aria-expanded="false"');
  });
});
