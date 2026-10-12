import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingList } from "./loading-list.tsx";

describe("LoadingList", () => {
  it("is a polite status region when labelled", () => {
    const html = renderToStaticMarkup(
      <LoadingList label="Loading the week plan" rows={2} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Loading the week plan");
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(4);
  });

  it("is hidden from assistive technology without a label", () => {
    const html = renderToStaticMarkup(<LoadingList rows={1} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
  });
});
