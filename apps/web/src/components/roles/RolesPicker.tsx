import type { OrgRole } from "@agenteschat/client";
import { personalHelperRole } from "@agenteschat/client/lib/personal-view";
import { isEveryone, sortRoles } from "@agenteschat/client/lib/roles";
import { isPersonal } from "@agenteschat/client/lib/workspace-mode";
import { Button, Icon, Menu, MenuCheckboxItem, MenuHeading, MenuNote, MenuSeparator, RoleMark } from "@agenteschat/ui";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/components/org-context";
import "./roles.css";

/**
 * Picks roles (ADR 0085) from a menu that stays open: only the ones the person may give (below their own). The
 * trigger is a field-like button that names what's picked ("Membro" with none: everyone's base alone, ADR 0090),
 * or `trigger` (a "+" on a person's row). `disabled`: while what it's for runs (an approval).
 */
export function RolesPicker({
  roles,
  value,
  onChange,
  label,
  trigger,
  size,
  side,
  align = "end",
  disabled = false,
}: {
  roles: readonly OrgRole[];
  value: readonly string[];
  onChange: (roleIds: string[]) => void;
  /** What the menu is for (its accessible name). */
  label: string;
  trigger?: ReactNode;
  size?: "sm";
  /** Beside the trigger instead of under it (a profile card opens it to its right). */
  side?: "bottom" | "right";
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const picked = sortRoles(roles.filter((r) => value.includes(r.id)));
  // Each picked cargo by its mark and name; none, Todos' mark and "Membro".
  const everyone = roles.find(isEveryone);
  const shown = picked.length ? picked : everyone ? [{ ...everyone, name: t("roles.member") }] : [];
  return (
    <Menu
      label={label}
      side={side}
      align={align}
      trigger={
        trigger ?? (
          <Button size={size} className="roles-picker" aria-label={label} disabled={disabled}>
            <span className="roles-picker__value">
              {shown.length
                ? shown.map((r) => (
                    <span key={r.id} className="roles-picker__item ac-iconline">
                      <RoleMark color={r.color} icon={r.icon} size={18} />
                      <span>{r.name}</span>
                    </span>
                  ))
                : t("roles.member")}
            </span>
            <Icon name="chevronDown" size={16} />
          </Button>
        )
      }
    >
      <MenuHeading>{label}</MenuHeading>
      <RoleChoices roles={roles} value={value} onChange={onChange} disabled={disabled} />
    </Menu>
  );
}

/**
 * The roles the viewer may give, as checkable items of a menu that stays open (the kit's checkbox at each one's end),
 * and the note about everyone's base role and the cargos above theirs: the picker's own list, and a person's "Cargos"
 * in their row's menu. `disabled`: every item, while a change saves. `invite`: what an invitation or a link gives, not
 * what someone holds, so a cargo picked there that the viewer can't give (someone higher's choice) shows too, checked
 * and marked, to take out and never to tick again.
 */
export function RoleChoices({
  roles,
  value,
  onChange,
  disabled = false,
  invite = false,
}: {
  roles: readonly OrgRole[];
  value: readonly string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
  invite?: boolean;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  // Read as the menu opens: one taken out keeps its place until it closes.
  const [held] = useState(() => (invite ? value : []));
  const listed = sortRoles(roles.filter((r) => !isEveryone(r) && (r.givable || held.includes(r.id))));
  const givable = listed.filter((r) => r.givable);
  const above = roles.some((r) => !isEveryone(r) && !r.givable && !held.includes(r.id));
  // A personal workspace says it in the invitation's plain words (ADR 0159), naming its helper role as it's called.
  const helper = isPersonal(org) ? personalHelperRole(roles) : null;
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...new Set([...value, id])] : value.filter((v) => v !== id));
  return (
    <>
      {listed.map((r) => (
        <MenuCheckboxItem
          key={r.id}
          checked={value.includes(r.id)}
          disabled={disabled || (!r.givable && !value.includes(r.id))}
          leading={<RoleMark color={r.color} icon={r.icon} size={18} />}
          hint={r.givable ? undefined : t("rolesPage.aboveYou")}
          onCheckedChange={(on) => toggle(r.id, on)}
        >
          {r.name}
        </MenuCheckboxItem>
      ))}
      {listed.length > 0 && <MenuSeparator />}
      <MenuNote>
        {!givable.length
          ? t("members.noRolesToGive")
          : helper
            ? t("members.everyoneNotePersonal", { role: helper.name })
            : above
              ? t("common.joinSentences", { a: t("members.everyoneNote"), b: t("members.rolesAbove") })
              : t("members.everyoneNote")}
      </MenuNote>
    </>
  );
}
