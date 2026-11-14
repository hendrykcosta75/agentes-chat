import { Dialog as RDialog } from "radix-ui";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "../cx";
import { Kbd } from "./Kbd";

export interface PaletteItem {
  key: string;
  /** "Ir para", "Pedir a um agente". Consecutive items share the heading. */
  group: string;
  label: string;
  /** "canal", "agente · PM", "configurações". */
  sub?: string;
  /** A small leading mark (an avatar, an icon). */
  mark?: ReactNode;
  /** Extra words to match ("settings", the handle). */
  keywords?: string;
  /** Shown only for a typed query (an agent's tabs, a setting's options): the open palette stays short. */
  searchOnly?: boolean;
  onSelect: () => void;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Items whose label, sub or keywords contain every word of the query (accents and case ignored).
 * With no query, everything but the `searchOnly` ones.
 */
export function filterPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items.filter((i) => !i.searchOnly);
  return items.filter((i) => {
    const hay = fold(`${i.label} ${i.sub ?? ""} ${i.keywords ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * ⌘K: go anywhere or ask an agent. Glass over the app; type to filter,
 * arrows to move, Enter to go, Esc to close. `extra(q)` adds items built from
 * the query ("Pedir à Ada: …"), after the filtered ones.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  extra,
  label,
  placeholder,
  listLabel,
  emptyText,
  closeHint = "esc",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  extra?: (query: string) => PaletteItem[];
  label: string;
  placeholder: string;
  listLabel: string;
  emptyText: (query: string) => ReactNode;
  closeHint?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);
  const shown = useMemo(() => [...filterPalette(items, q), ...(extra ? extra(q) : [])], [items, extra, q]);
  const current = Math.min(active, Math.max(0, shown.length - 1));
  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    item.onSelect();
  };
  const optionId = (i: number) => `${listId}-${i}`;
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="ac-palette__scrim" />
        <RDialog.Content
          className="ac-palette ac-glass"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          <RDialog.Title className="ac-visually-hidden">{label}</RDialog.Title>
          <div className="ac-palette__q">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="ac-palette__icon">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m12.5 12.5 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              ref={input}
              role="combobox"
              aria-label={label}
              aria-expanded={shown.length > 0}
              aria-controls={listId}
              aria-activedescendant={shown.length > 0 ? optionId(current) : undefined}
              aria-autocomplete="list"
              placeholder={placeholder}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (shown.length === 0) return;
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setActive((current + step + shown.length) % shown.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(shown[current]);
                }
              }}
            />
            <Kbd>{closeHint}</Kbd>
          </div>
          <div className="ac-palette__list" role="listbox" id={listId} aria-label={listLabel}>
            {shown.length === 0 ? (
              <p className="ac-palette__empty">{emptyText(q)}</p>
            ) : (
              shown.map((item, i) => {
                const heading = item.group !== shown[i - 1]?.group;
                return (
                  <div key={item.key} role="presentation">
                    {heading && (
                      <div className="ac-menu__heading" role="presentation">
                        {item.group}
                      </div>
                    )}
                    <div
                      id={optionId(i)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={i === current}
                      data-active={i === current || undefined}
                      className={cx("ac-menu__item", "ac-palette__item")}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(item)}
                      onKeyDown={() => {}}
                    >
                      <span className="ac-menu__leading ac-palette__mark">{item.mark}</span>
                      <span className="ac-palette__label">{item.label}</span>
                      {item.sub && <span className="ac-palette__sub">{item.sub}</span>}
                      {i === current && <Kbd className="ac-palette__enter">↵</Kbd>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
