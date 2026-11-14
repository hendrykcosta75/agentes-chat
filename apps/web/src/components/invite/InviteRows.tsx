import type { Channel, OrgRole } from "@agenteschat/client";
import { daysBetween, formatShortDate, heldWhole, joinNames, relativeTime } from "@agenteschat/client/lib/format";
import { sortRoles } from "@agenteschat/client/lib/roles";
import { Icon, type IconName } from "@agenteschat/ui";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

/** "agora", "há 2 h", "ontem", "em 22 out": when something happened, to follow a verb. */
export function whenWords(t: TFunction, locale: string, iso: string, now = new Date()) {
  if (daysBetween(iso, now) > 1) return t("members.when.on", { date: formatShortDate(locale, iso) });
  return relativeTime(t, locale, iso, now);
}

/**
 * A request, an invitation, a link or a suggestion as a MediaRow: the face and who or what it is on one line, its
 * actions at that line's end (under everything where the list is narrow), and what it is and its state under them at
 * the row's width.
 */
export function Who({
  face,
  name,
  sub,
  children,
}: {
  face: ReactNode;
  name: string;
  sub: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="ac-mediarow__face">{face}</span>
      <span className="ac-mediarow__head">
        <b className="members-row__name">{name}</b>
      </span>
      <span className="ac-mediarow__body">
        <span className="members-row__line">
          {sub && <span className="small muted members-row__sub">{sub}</span>}
          {children}
        </span>
      </span>
    </>
  );
}

/** A row's state, as an icon and words ("Expira em 5 dias", "Pediu pelo link há 3 h"). */
export function State({ icon, tone, children }: { icon: IconName; tone?: "soon" | "ok"; children: ReactNode }) {
  return (
    <span className="members-row__state ac-iconline" data-tone={tone}>
      <Icon name={icon} size={14} />
      <span>{children}</span>
    </span>
  );
}

/** What an invitation or a link gives, by name: its cargos, its channels (#general first when said) and its agents. */
export interface Gives {
  roleIds?: readonly string[];
  channelIds: readonly string[];
  agentIds: readonly string[];
}

/**
 * "Suporte · #general e #suporte · Max": the cargos (when `roles`), the channels and the agents an invitation, a link
 * or a request's link gives, each part's names joined, the parts by "·". `general`: #general said first. A channel or
 * an agent no longer there is left out.
 */
export function givesText(
  t: TFunction,
  gives: Gives,
  look: {
    roles: readonly OrgRole[];
    channels: readonly Pick<Channel, "id" | "name">[];
    agentName: (id: string) => string | undefined;
    general?: boolean;
    member?: boolean;
  },
) {
  const cargos = sortRoles(look.roles.filter((r) => (gives.roleIds ?? []).includes(r.id))).map((r) => r.name);
  const general = look.general ? look.channels.find((c) => c.name === "general") : undefined;
  const channels = [
    ...(general ? [`#${general.name}`] : []),
    ...gives.channelIds.flatMap((id) => {
      const c = look.channels.find((x) => x.id === id);
      return c && c.id !== general?.id ? [heldWhole(`#${c.name}`)] : [];
    }),
  ];
  const agents = gives.agentIds.flatMap((id) => look.agentName(id) ?? []);
  return [
    gives.roleIds ? (cargos.length ? joinNames(cargos, t) : look.member ? t("roles.member") : null) : null,
    channels.length ? joinNames(channels, t) : null,
    agents.length ? joinNames(agents, t) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
