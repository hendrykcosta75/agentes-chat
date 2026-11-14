import { Popover as RPopover } from "radix-ui";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "../cx";
import { EDGE_ROOM } from "../floating";
import { Icon } from "../icons/Icon";
import { matchesWords } from "../search";
import { useFieldControl, useLocked } from "./Field";
import { Token, type TokenProps } from "./Token";

/** A token in the field: what `Token` shows, by its key. */
export interface ChipFieldToken extends Omit<TokenProps, "children" | "onRemove" | "size"> {
  key: string;
  label: ReactNode;
}

/** A row of the field's list. */
export interface ChipFieldOption {
  value: string;
  label: string;
  leading?: ReactNode;
  description?: ReactNode;
  /** Consecutive rows with the same group get its heading. */
  group?: string;
  /** Shown, never picked (it says why in its description). */
  disabled?: boolean;
  /** In the field already: its check shows, and choosing it again takes it out. */
  picked?: boolean;
  /** Not picked here: choosing it goes somewhere else (`onPick` decides where), a chevron says so. */
  goes?: boolean;
  /** More words a search finds it by (its description's, as plain text). */
  words?: string;
}

export interface ChipFieldProps {
  /** The input's id; inside a `Field`, the field's. */
  id?: string;
  tokens: readonly ChipFieldToken[];
  /** A token's ✕, or Backspace in an empty input (the last one that isn't fixed). */
  onRemove: (key: string) => void;
  placeholder: string;
  /** Once there are tokens ("Mais e-mails…"). */
  morePlaceholder?: string;
  /** What's typed and not a token yet, for a screen that counts it. Uncontrolled without it. */
  draft?: string;
  onDraftChange?: (draft: string) => void;
  /**
   * Typed words become tokens: Enter, a comma, a semicolon, Tab or leaving the input hands them over, and a pasted
   * list goes at once. Without it, typing searches `options`.
   */
  onCommit?: (text: string) => void;
  /** The list under the field, filtered by what's typed: Enter, Tab or a click picks the row in focus. */
  options?: readonly ChipFieldOption[];
  onPick?: (option: ChipFieldOption) => void;
  /** The list's accessible name. */
  listLabel?: string;
  /** What the list says when nothing matches what's typed. */
  empty?: (query: string) => ReactNode;
  /** A group's heading; default: the group as given. */
  groupLabel?: (group: string) => string;
  /** Enter with nothing typed and no list open. */
  onEnterEmpty?: () => void;
  /** The list opened or closed: what it shows may load only once it's wanted. */
  onOpenChange?: (open: boolean) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputMode?: "email" | "text";
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

/** What a paste must hold to become tokens at once: more than one word, or an address with its name. */
const LIST = /[\s,;<]/;

/** Consecutive rows by `group`. */
function groupsOf(options: readonly ChipFieldOption[]) {
  const out: [string | undefined, ChipFieldOption[]][] = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last[0] === o.group) last[1].push(o);
    else out.push([o.group, [o]]);
  }
  return out;
}

/**
 * Tokens in a field-like box, an input after the last one (the invite dialog's Para, Canais and Agentes). It grows
 * with its tokens and never scrolls inside. Typed text becomes tokens (`onCommit`), or searches a list that floats
 * under the field at its width (`options`), so nothing below moves. Backspace in an empty input takes the last
 * removable token back. Combobox semantics: arrows move through the list, Enter or Tab picks, Esc closes it, the focus
 * staying in the input.
 */
export function ChipField({
  id,
  tokens,
  onRemove,
  placeholder,
  morePlaceholder,
  draft: given,
  onDraftChange,
  onCommit,
  options,
  onPick,
  listLabel,
  empty,
  groupLabel = (group) => group,
  onEnterEmpty,
  onOpenChange,
  inputRef,
  inputMode = "text",
  disabled = false,
  className,
  ...rest
}: ChipFieldProps) {
  const wiring = useFieldControl({
    id,
    "aria-describedby": rest["aria-describedby"],
    "aria-invalid": rest["aria-invalid"],
  });
  const listId = useId();
  // Inside a `Locked` that runs it's off too: the fieldset reaches its input and ✕, not its box or its floating list.
  const locked = useLocked();
  const off = disabled || locked;
  const [own, setOwn] = useState("");
  const draft = given ?? own;
  const setDraft = (value: string) => {
    setOwn(value);
    onDraftChange?.(value);
  };
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const box = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listed = options !== undefined;
  const shown = listed && open && !off;
  const query = onCommit ? "" : draft.trim();
  const rows = useMemo(
    () => (options ?? []).filter((o) => !query || matchesWords(`${o.label} ${o.words ?? ""} ${o.group ?? ""}`, query)),
    [options, query],
  );
  const groups = useMemo(() => groupsOf(rows), [rows]);
  const optionId = (i: number) => `${listId}-o${i}`;

  // Typing goes back to the first match; the row in focus stays in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the query changes
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (shown) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });
  useEffect(() => {
    if (off) setOpen(false);
  }, [off]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: told when it changes, not when the callback does
  useEffect(() => {
    onOpenChange?.(shown);
  }, [shown]);

  const commit = (text: string) => {
    if (text.trim()) onCommit?.(text);
    setDraft("");
  };
  const choose = (o: ChipFieldOption | undefined) => {
    if (!o || o.disabled) return;
    onPick?.(o);
    if (o.goes) setOpen(false);
    else setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = rows.length - 1;
    if (listed && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (!shown) return setOpen(true);
      setActive((a) => (e.key === "ArrowDown" ? Math.min(last, a + 1) : Math.max(0, a - 1)));
    } else if (e.key === "Enter") {
      if (shown && rows[active]) {
        e.preventDefault();
        choose(rows[active]);
      } else if (onCommit && draft.trim()) {
        e.preventDefault();
        commit(draft);
      } else if (!draft.trim() && onEnterEmpty) {
        e.preventDefault();
        onEnterEmpty();
      }
    } else if (onCommit && (e.key === "," || e.key === ";")) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Tab" && draft.trim()) {
      // The focus still moves on: what was typed goes in on the way.
      if (onCommit) commit(draft);
      else if (shown) choose(rows[active]);
    } else if (e.key === "Backspace" && !draft) {
      const removable = [...tokens].reverse().find((t) => !t.fixed);
      if (removable) onRemove(removable.key);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!onCommit) return;
    const text = e.clipboardData.getData("text");
    if (!LIST.test(text.trim())) return;
    e.preventDefault();
    commit(`${draft} ${text}`);
  };

  let index = -1;
  return (
    <RPopover.Root open={shown} onOpenChange={(o) => !o && setOpen(false)}>
      <RPopover.Anchor asChild>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a press on the box's empty room focuses its input */}
        <div
          ref={box}
          className={cx("ac-chipfield", className)}
          data-focus={focused || undefined}
          aria-invalid={wiring["aria-invalid"]}
          aria-disabled={off || undefined}
          onMouseDown={(e) => {
            if (off || (e.target instanceof Element && e.target.closest("button"))) return;
            if (e.target !== input.current) e.preventDefault();
            input.current?.focus();
            if (listed) setOpen(true);
          }}
        >
          {tokens.map(({ key, label, ...token }) => (
            <Token key={key} {...token} onRemove={() => onRemove(key)}>
              {label}
            </Token>
          ))}
          <input
            ref={input}
            id={wiring.id}
            className="ac-chipfield__input"
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={false}
            disabled={off}
            value={draft}
            placeholder={tokens.length && morePlaceholder ? morePlaceholder : placeholder}
            aria-describedby={wiring["aria-describedby"]}
            aria-invalid={wiring["aria-invalid"]}
            {...(listed
              ? {
                  role: "combobox",
                  "aria-expanded": shown,
                  "aria-controls": listId,
                  "aria-autocomplete": "list" as const,
                  "aria-activedescendant": shown && rows.length ? optionId(active) : undefined,
                }
              : {})}
            onChange={(e) => {
              setDraft(e.target.value);
              if (listed) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setOpen(false);
              if (onCommit) commit(draft);
            }}
          />
        </div>
      </RPopover.Anchor>
      {listed && (
        <RPopover.Portal>
          <RPopover.Content
            className="ac-menu ac-tz__menu ac-chipfield__menu"
            align="start"
            sideOffset={4}
            collisionPadding={EDGE_ROOM}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              if (e.target instanceof Node && box.current?.contains(e.target)) e.preventDefault();
            }}
            onFocusOutside={(e) => {
              if (e.target instanceof Node && box.current?.contains(e.target)) e.preventDefault();
            }}
            // The focus stays in the input: a press on a row picks it without taking it.
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="ac-tz__list" role="listbox" id={listId} aria-label={listLabel} aria-multiselectable="true">
              {rows.length === 0 && <p className="ac-tz__empty">{empty?.(query)}</p>}
              {groups.map(([group, list], g) => {
                const items = list.map((o) => {
                  index += 1;
                  const i = index;
                  return (
                    // biome-ignore lint/a11y/useFocusableInteractive: rows are reached through aria-activedescendant
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the keys
                    <div
                      key={o.value}
                      id={optionId(i)}
                      role="option"
                      aria-selected={o.picked === true}
                      aria-disabled={o.disabled || undefined}
                      data-active={i === active || undefined}
                      className="ac-tz__option ac-search__option"
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(o)}
                    >
                      {o.leading && (
                        <span className="ac-menu__leading" aria-hidden="true">
                          {o.leading}
                        </span>
                      )}
                      <span className="ac-menu__label">
                        <span>{o.label}</span>
                        {o.description && <span className="ac-menu__desc">{o.description}</span>}
                      </span>
                      <span className="ac-tz__check" aria-hidden="true">
                        {o.goes ? (
                          <Icon name="chevronRight" size={16} />
                        ) : (
                          o.picked && (
                            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                              <path d="m5.5 10.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          )
                        )}
                      </span>
                    </div>
                  );
                });
                return group ? (
                  // biome-ignore lint/a11y/useSemanticElements: a listbox group
                  <div key={group} role="group" aria-label={groupLabel(group)}>
                    <div className="ac-menu__heading" aria-hidden="true">
                      {groupLabel(group)}
                    </div>
                    {items}
                  </div>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: ungrouped runs have nothing else to tell them apart
                  <div key={`~${g}`}>{items}</div>
                );
              })}
            </div>
          </RPopover.Content>
        </RPopover.Portal>
      )}
    </RPopover.Root>
  );
}
