# Workspace styling

`apps/web/src/tokens.css` owns the palette, semantic colors, typography,
radii, motion and workspace dimensions. `styles.css` imports those tokens
and exposes them through Tailwind v4. `docs/design/tokens.css` imports the
same file for the design specimen; it no longer repeats the values.

## Change the whole UI

| Change                                               | Token or shared component                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Dark or light colors                                 | Palette in `tokens.css`; the light override uses `html[data-theme="light"]` |
| Primary action and hover                             | `--primary`, `--primary-hover`, `--primary-foreground`                      |
| Page, sidebar and toolbar surfaces                   | `--background`, `--sidebar-background`, `--toolbar-background`              |
| Body, control and metadata type                      | `--text-base`, `--text-sm`, `--text-xs`; `--font-sans` and `--font-mono`    |
| Desktop sidebar and collapsed rail                   | `--sidebar-width`, `--sidebar-rail-width`                                   |
| Mobile task detail sheet height                      | `--detail-sheet-height`                                                     |
| Header and mobile navigation height                  | `--header-height`, `--mobile-nav-height`                                    |
| Task column and details column widths                | `--content-width`, `--detail-width`                                         |
| Task row height, corners and spacing                 | `--task-height`, `--task-radius`, `--task-gap`                              |
| Task resting, hover and selection fills              | `--task-background`, `--task-hover`, `--task-selected`                      |
| Sidebar item height                                  | `--nav-item-height`                                                         |
| Default input, select and button size                | `--control-height`; the `h-control` and `size-control` utilities            |
| Capture bar height                                   | `--capture-height`; the `min-h-capture` utility                             |
| Page gutters and section spacing                     | `--spacing-page`, `--spacing-section`                                       |
| Button variants                                      | `components/ui/button.tsx`                                                  |
| Inputs, selects, dialogs and other shared primitives | `components/ui/`                                                            |

For example, edit these existing declarations in `tokens.css` to make all task
lists more compact and give the task column more room:

```css
:root {
  --task-height: 2.75rem;
  --content-width: 72rem;
  --spacing-page: 1.5rem;
}
```

Smaller button variants remain explicit exceptions, such as row overflow
menus. Phone rules maintain safe-area padding and touch targets.

## Compose components

Use Tailwind utilities for layout and semantic color roles:
`flex items-center gap-2 text-muted-foreground`, `bg-card`, `border-input`,
`text-primary` and `hover:bg-primary-hover`. Use `gap-section`, `p-page`,
`h-control`, `min-h-task` and `min-h-capture` when a dimension has a token.
Avoid literal palette values and repeated arbitrary dimensions.

`workspace-frame` controls the desktop columns. `workspace-content` provides
a centered content width. `WorkspaceShell` owns responsive navigation and
quick-capture focus. `Header`, `Sidebar`, `TaskRow`, `AddTaskBar` and
`ViewSection` are the shared places to change their respective structures.
The existing BEM class names remain hooks for interactive state, nesting,
responsive rules and tests. Put a new state rule beside its existing rule;
do not append another theme override at the end of the stylesheet.

The navigation drawer starts at 64rem, where the task detail panel also becomes
a sheet. The smaller toolbar layout starts at 40rem. Change those media queries
together if changing the responsive structure. CSS custom properties cannot
be used directly as media-query breakpoints.

## Coverage and limits

Palette tokens reach existing routes, dialogs and forms through semantic
roles. Default controls and task rows use shared size tokens. Some older
specialized forms, planner geometry and small control variants retain local
measurements; this change does not pretend every measurement is a token.
The separate landing page and native setup pages do not import the planner's
stylesheet.

The visual reference is Super Productivity v20. Tadooer retains its own
Catppuccin/Dracula colors and self-hosted Inter and Atkinson fonts. The
[feature comparison](../product/super-productivity-v16-v20-comparison.md)
records which controls have an equivalent workflow and which are absent.
