# Tadooer landing page

A static page that says what Tadooer is, who it is for, how it is run and
where the source lives (issue #176). No build step: `index.html`,
`styles.css` and `assets/` are the whole site.

- Copy follows the voice rules in `docs/design/README.md`: present tense,
  one idea per sentence, no sign-up invitation, no server address, no claim
  that is not on `main`. The footer carries the date the claims were checked;
  update it when the page changes.
- Brand files in `assets/` are copies of `apps/web/public/favicon.svg`,
  `og.png` and `suite-icon.svg`. Regenerate them in Studio and copy, as
  `docs/design/brand-assets.json` says.
- Screenshots are from `docs/design/information-architecture.md`, captured on
  2026-10-12 from a fresh preview with sample tasks. Replace them with the
  same route and width when the interface changes.
- `landing.test.ts` checks the page against the voice rules and that every
  local asset and anchor exists. It runs with the root `pnpm test`.

## Publishing

The page is independent of the app: copy the folder to any static host, or
serve it from the edge in front of the app under a path that the app does
not use. It is not served by `apps/server`, whose static route returns the
app shell for unknown paths. Record the published location and the revision
in the issue when it goes live; rollback is redeploying the previous copy of
the folder.

Local check:

```sh
python3 -m http.server --directory apps/landing 8099
```
