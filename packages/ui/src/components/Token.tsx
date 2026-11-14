import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { Tip } from "./Tip";

export interface TokenProps {
  children: ReactNode;
  /** E.g. a small avatar. */
  leading?: ReactNode;
  /** "Remover Ada". */
  removeLabel?: string;
  onRemove?: () => void;
  /** `sm`: inside a field (a search's filters), clear of its edges. */
  size?: "sm";
  /**
   * `invalid`: it can't go as it is, in the danger tone; `soft`: it's fine but won't count (already in, already
   * invited), quiet. `note` says which.
   */
  state?: "invalid" | "soft";
  /** A word or two after the label: why it's `invalid` or `soft` ("confira", "já convidado"). */
  note?: ReactNode;
  /** It stays whatever the person does: no ✕ (its `tip` says why). */
  fixed?: boolean;
  /** Where it comes from or why it stays, in a tip on the token, and for screen readers after its label. */
  tip?: ReactNode;
  /** Just added by something else (a cargo bringing its channels): it fades in, at once with reduced motion. */
  fresh?: boolean;
}

/** A picked item (a participant, a member) with a button to remove it (none without `onRemove`: it stays). */
export function Token({ children, leading, removeLabel, onRemove, size, state, note, fixed, tip, fresh }: TokenProps) {
  const token = (
    <span
      className={cx("ac-token", size && `ac-token--${size}`)}
      data-state={state}
      data-fixed={fixed || undefined}
      data-fresh={fresh || undefined}
    >
      {leading}
      <span className="ac-token__label">{children}</span>
      {note && <span className="ac-token__note">{note}</span>}
      {tip && <span className="ac-visually-hidden">{tip}</span>}
      {onRemove && !fixed && (
        <button type="button" className="ac-token__remove" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      )}
    </span>
  );
  if (!tip) return token;
  return (
    <Tip tip={tip} look="ac-msg__note-tip ac-glass" className="ac-token__tip">
      {token}
    </Tip>
  );
}

export function TokenList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className="ac-tokens" aria-label={label}>
      {children}
    </ul>
  );
}
