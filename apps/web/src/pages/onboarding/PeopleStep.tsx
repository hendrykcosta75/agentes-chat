import type { BatchInviteResult } from "@agenteschat/client";
import { useAllInvitations, useInviteMany, useMembers, useRoles } from "@agenteschat/client";
import { everyoneOf, isEveryone, roleSummary, sortRoles } from "@agenteschat/client/lib/roles";
import { Button, Icon, Locked } from "@agenteschat/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type ChipAddress, ChipNote, ChipRole, chipsFrom, EmailChips } from "@/components/invite/EmailChips";
import { InviteLinkPanel } from "@/components/invite/InviteLinkPanel";
import { useToast } from "@/lib/toast";
import "@/components/invite/invite.css";

/*
 * The last step of a team's rail (ADR 0162, amended 2026-11-11): the people who work there, invited with the invite
 * dialog's own pieces (ADR 0090): the address chips, each with its role, and the workspace's link to copy (renewing or
 * turning it off belongs to Members, not to a workspace still being set up). Its button sends the invitations and
 * finishes the onboarding; "Invite later" finishes it with none. A server that sends no email invites through the link
 * only, as the dialog does.
 */

/** The role picker's value for no role: a member (the invite dialog's). */
const MEMBER = "member";

export function PeopleStep({
  orgId,
  org,
  email,
  byLink,
  leaving,
  onSent,
  onLater,
}: {
  orgId: string;
  /** The workspace's name, in the chips' "already in" note. */
  org: string;
  /** The person's own address: already in. */
  email: string;
  /** The server sends no email: the link only. */
  byLink: boolean;
  /** The workspace is opening: every way out waits. */
  leaving: boolean;
  /** The invitations went: the page finishes the onboarding. */
  onSent: () => void;
  /** No invitations now: the page finishes the onboarding. */
  onLater: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const members = useMembers(orgId).data ?? [];
  const invitations = useAllInvitations(orgId, !byLink).data ?? [];
  const orgRoles = useRoles(orgId).data?.roles ?? [];
  const invite = useInviteMany(orgId);
  const [chips, setChips] = useState<ChipAddress[]>([]);
  const [draft, setDraft] = useState("");
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [link, setLink] = useState(false);

  // Who is in already, and who has an invitation waiting: said on their chip and left out of the send.
  const inAlready = new Set([email.toLowerCase(), ...members.map((m) => m.email.toLowerCase())]);
  const waiting = new Set(invitations.filter((i) => i.status === "pending").map((i) => i.email.toLowerCase()));
  const stateOf = (c: ChipAddress) =>
    !c.valid ? "bad" : inAlready.has(c.email) ? "member" : waiting.has(c.email) ? "invited" : "ok";
  // What's typed and not a chip yet counts, as leaving the field would make it one.
  const all = draft.trim() ? [...chips, ...chipsFrom(draft, chips)] : chips;
  const ready = all.filter((c) => stateOf(c) === "ok");
  const bad = all.some((c) => !c.valid);
  const leftOut = all.some((c) => stateOf(c) === "member" || stateOf(c) === "invited");

  // Membro, then each role this person may give, as the invite dialog offers them.
  const everyone = everyoneOf(orgRoles);
  const roleOptions = [
    { value: MEMBER, label: t("roles.member"), description: t("members.chips.memberHint") },
    ...sortRoles(orgRoles.filter((r) => !isEveryone(r) && r.givable)).map((r) => ({
      value: r.id,
      label: r.name,
      description: roleSummary(t, i18n.language, r, everyone),
    })),
  ];
  const roleOf = (address: string) => {
    const id = roles[address];
    return id && roleOptions.some((o) => o.value === id) ? id : MEMBER;
  };

  const send = async () => {
    if (all !== chips) {
      setChips(all);
      setDraft("");
    }
    if (ready.length === 0 || invite.isPending || leaving) return;
    let results: BatchInviteResult[];
    try {
      results = await invite.mutateAsync({
        invites: ready.map((c) => {
          const id = roleOf(c.email);
          return { email: c.email, roleIds: id === MEMBER ? [] : [id] };
        }),
      });
    } catch {
      // Said by the failed write's toast; everything stays to send again.
      return;
    }
    const sent = results.filter((r) => r.status === "invited");
    if (sent.length === 1) toast.show(t("members.dialog.sent", { email: sent[0]?.email }));
    else if (sent.length > 1) toast.show(t("members.dialog.sentMany", { count: sent.length }));
    // An address the server reads as none stays, marked, to fix or take out; the rest went.
    const fix = new Set(results.filter((r) => r.status === "invalid_email").map((r) => r.email));
    if (fix.size === 0) return onSent();
    for (const address of fix) toast.show(t("members.batch.invalid_email", { email: address }), "error");
    setChips((list) =>
      list.filter((c) => !c.valid || fix.has(c.email)).map((c) => (fix.has(c.email) ? { ...c, valid: false } : c)),
    );
  };

  if (byLink)
    return (
      <>
        <div className="onb__answer">
          <InviteLinkPanel />
          <ol className="invite-how">
            {(["how1", "how2", "how3"] as const).map((k, i) => (
              <li key={k}>
                <span className="invite-how__n" aria-hidden="true">
                  {i + 1}
                </span>
                {t(`members.dialog.linkStep.${k}`)}
              </li>
            ))}
          </ol>
        </div>
        <div className="onb__actions">
          <Button variant="primary" block kbd={["↵"]} data-enter="" loading={leaving} onClick={onLater}>
            {t("onboarding.flow.ai.enter")}
          </Button>
        </div>
      </>
    );

  const busy = invite.isPending || leaving;
  return (
    <>
      <Locked when={busy}>
        <div className="onb__answer">
          <label className="ac-visually-hidden" htmlFor="onb-people-emails">
            {t("members.dialog.emails")}
          </label>
          <EmailChips
            id="onb-people-emails"
            chips={chips}
            draft={draft}
            onDraftChange={setDraft}
            onAdd={(text) => setChips((list) => [...list, ...chipsFrom(text, list)])}
            onRemove={(chip) => setChips((list) => list.filter((c) => c.email !== chip.email))}
            placeholder={t("members.emailsPlaceholder")}
            morePlaceholder={t("members.dialog.moreEmails")}
            describedBy="onb-people-help"
            onEnterEmpty={() => void send()}
            soft={(chip) => stateOf(chip) !== "ok"}
            aside={(chip) => {
              const state = stateOf(chip);
              if (state === "member") return <ChipNote>{t("members.chips.member", { org })}</ChipNote>;
              if (state === "invited") return <ChipNote>{t("members.chips.invited")}</ChipNote>;
              return (
                <ChipRole
                  email={chip.email}
                  value={roleOf(chip.email)}
                  options={roleOptions}
                  onChange={(v) => setRoles((prev) => ({ ...prev, [chip.email]: v }))}
                />
              );
            }}
          />
          <p id="onb-people-help" className="invite-help" data-bad={bad || undefined}>
            {bad
              ? t("members.dialog.checkMarked")
              : leftOut
                ? t("members.dialog.leftOut")
                : t("members.dialog.pasteHelp")}
          </p>
          {link ? (
            <InviteLinkPanel />
          ) : (
            <div className="invite-orlink ac-mediarow">
              <span className="ac-mediarow__face">
                <span className="invite-tile" aria-hidden="true">
                  <Icon name="link" size={18} />
                </span>
              </span>
              <span className="ac-mediarow__head">
                <b>{t("members.dialog.orLink.title")}</b>
              </span>
              <span className="ac-mediarow__end ac-mediarow__end--wrap">
                <Button size="sm" onClick={() => setLink(true)}>
                  {t("members.dialog.orLink.open")}
                </Button>
              </span>
              <span className="ac-mediarow__body invite-orlink__text">{t("members.dialog.orLink.text")}</span>
            </div>
          )}
        </div>
      </Locked>
      <div className="onb__actions">
        <Button
          variant="primary"
          block
          kbd={["↵"]}
          data-enter=""
          disabled={ready.length === 0 || leaving}
          loading={invite.isPending}
          onClick={() => void send()}
        >
          {ready.length > 0 ? t("members.dialog.send", { count: ready.length }) : t("onboarding.flow.people.send")}
        </Button>
        <p className="onb__skip">
          <button type="button" className="ac-link" disabled={busy} onClick={onLater}>
            {t("onboarding.flow.people.later")}
          </button>
        </p>
      </div>
    </>
  );
}
