import { revealSettingsTarget } from "./settings-focus.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X, type LucideIcon } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx";

export interface SettingsGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly content: ReactNode;
}

interface SearchResult {
  readonly group: SettingsGroup;
  readonly label: string;
  readonly target: HTMLElement;
}

/** Mounted panels retain unsaved form values and their existing save boundaries. */
export function SettingsLayout({
  groups,
  searchLabel = "Search settings",
}: {
  readonly groups: readonly SettingsGroup[];
  readonly searchLabel?: string;
}) {
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);

  const search = (value: string) => {
    setQuery(value);
    const needle = value.trim().toLocaleLowerCase();
    const found: SearchResult[] = [];
    if (needle !== "") {
      for (const panel of root.current?.querySelectorAll<HTMLElement>(
        "[data-settings-panel]",
      ) ?? []) {
        const group = groups.find(
          ({ id }) => id === panel.dataset.settingsPanel,
        );
        if (group === undefined) continue;
        const seen = new Set<string>();
        for (const target of panel.querySelectorAll<HTMLElement>(
          'label, legend, [data-slot="section-heading-title"]',
        )) {
          const caption = target.cloneNode(true) as HTMLElement;
          caption
            .querySelectorAll(
              "input, select, textarea, button, svg, [role=checkbox]",
            )
            .forEach((control) => control.remove());
          const label = caption.textContent.replace(/\s+/g, " ").trim();
          if (
            label === "" ||
            seen.has(label) ||
            !`${group.label} ${label}`.toLocaleLowerCase().includes(needle)
          )
            continue;
          seen.add(label);
          found.push({ group, label, target });
        }
      }
    }
    setResults(found.slice(0, 12));
  };

  const reveal = (result: SearchResult) => {
    pendingFocus.current = result.target;
    setActive(result.group.id);
    setQuery("");
    setResults([]);
  };
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null || query !== "" || !target.isConnected) return;
    pendingFocus.current = null;
    return revealSettingsTarget(target);
  }, [active, query]);

  return (
    <div ref={root} className="settings-layout">
      <form
        role="search"
        className="settings-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0] !== undefined) reveal(results[0]);
        }}
      >
        <Search
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={input}
          value={query}
          aria-label={searchLabel}
          placeholder={searchLabel}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") search("");
            if (event.key === "ArrowDown" && results.length > 0) {
              event.preventDefault();
              root.current
                ?.querySelector<HTMLButtonElement>(
                  ".settings-search-results button",
                )
                ?.focus();
            }
          }}
        />
        {query !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => {
              search("");
              input.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </form>
      {query.trim() !== "" && (
        <div className="settings-search-results">
          <p className="sr-only" role="status">
            {results.length === 0
              ? "No matching settings"
              : `${String(results.length)} matching settings`}
          </p>
          {results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No matching settings.
            </p>
          ) : (
            <ul aria-label="Matching settings">
              {results.map((result, index) => (
                <li key={`${result.group.id}-${String(index)}`}>
                  <button type="button" onClick={() => reveal(result)}>
                    <span>{result.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.group.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Tabs value={active} onValueChange={setActive}>
        <TabsList aria-label="Settings categories">
          {groups.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              aria-label={label}
              title={label}
              className="max-md:min-w-12 max-md:flex-1 max-md:px-2"
            >
              <Icon aria-hidden="true" className="size-4 max-md:size-6" />
              <span className="max-md:hidden">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map(({ id, label, content }) => (
          <TabsContent
            key={id}
            value={id}
            forceMount
            data-settings-panel={id}
            className="settings-panel data-[state=inactive]:hidden"
          >
            <h2 className="text-xl font-medium text-foreground">{label}</h2>
            {content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
