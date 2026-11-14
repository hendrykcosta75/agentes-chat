import { InfoHint } from "@agenteschat/ui";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

/** An ⓘ's accessible name ("About Show the agents in the notch") and the plain sentences it holds. */
export type Hint = { name: string; text: ReactNode };

/** The ⓘ for `label`, named after it in the reader's language and holding `text`. */
export const hintFor = (t: TFunction, label: string, text: ReactNode): Hint => ({
  name: t("common.about", { label }),
  text,
});

/** A tab's heading: title in Funnel Display, at most one line under it, an action on the right. */
export function PrefHead({ title, lead, action }: { title: string; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="dk-phead">
      <div>
        <h2>{title}</h2>
        {lead && <p className="dk-lead">{lead}</p>}
      </div>
      {action}
    </div>
  );
}

/** The small uppercase title over a card; what the card is for behind an ⓘ after it, never inside the heading. */
export function CardTitle({ children, hint }: { children: ReactNode; hint?: Hint }) {
  if (!hint) return <h3 className="dk-ctitle">{children}</h3>;
  return (
    <div className="dk-ctitle ac-hintline">
      <h3>{children}</h3>
      <InfoHint name={hint.name}>{hint.text}</InfoHint>
    </div>
  );
}

/** A neutral card of rows (never tinted by state). */
export const PrefCard = ({ children, padded }: { children: ReactNode; padded?: boolean }) => (
  <div className="dk-card" data-padded={padded || undefined}>
    {children}
  </div>
);

/**
 * One row: optional lead, a title with its ⓘ and one line under it, the control at the end. The line under the
 * title is for a state ("Turn on reach first."); what a setting does goes in the ⓘ.
 */
export function PrefRow({
  lead,
  title,
  hint,
  chip,
  desc,
  end,
  htmlFor,
  top,
  under,
}: {
  lead?: ReactNode;
  /** Omitted: a row of one small line, or of a button alone. */
  title?: ReactNode;
  /** What the setting does, behind an ⓘ right after the title; with `htmlFor`, its id is `<htmlFor>-hint`. */
  hint?: Hint;
  /** On the title's line, after the ⓘ (a tool's state, "Soon"). */
  chip?: ReactNode;
  desc?: ReactNode;
  end?: ReactNode;
  /** The control's id: the title becomes its label. */
  htmlFor?: string;
  top?: boolean;
  /** A full-width line under the row (a warning). */
  under?: ReactNode;
}) {
  const label =
    title == null ? null : htmlFor ? (
      <label htmlFor={htmlFor} className="dk-crow__title">
        {title}
      </label>
    ) : (
      <b className="dk-crow__title">{title}</b>
    );
  return (
    <div className="dk-crow" data-top={top || undefined}>
      {lead}
      <span className="dk-crow__text">
        {/* The ⓘ sits outside the label: the label stays the control's name, and a press on the ⓘ never
            reaches the control. */}
        {hint || chip ? (
          <span className="ac-hintline">
            {label}
            {hint && (
              <InfoHint name={hint.name} id={htmlFor && `${htmlFor}-hint`}>
                {hint.text}
              </InfoHint>
            )}
            {chip}
          </span>
        ) : (
          label
        )}
        {desc && <small>{desc}</small>}
      </span>
      {end && <span className="dk-crow__end">{end}</span>}
      {under && <div className="dk-crow__under">{under}</div>}
    </div>
  );
}
