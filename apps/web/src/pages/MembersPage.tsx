import type { MySuggestion, OrgRole, Person, RoleMailLoss } from "@agenteschat/client";
import {
  useAuthConfig,
  useCancelSuggestion,
  useMySuggestions,
  usePeople,
  useRoles,
  useSetMemberRoles,
  useSuggestPerson,
} from "@agenteschat/client";
import { errorCode, errorText } from "@agenteschat/client/lib/errors";
import { formatMonth, formatPercent, formatShortDate, namesText, relativeTime } from "@agenteschat/client/lib/format";
import { JOIN_NOTE_MAX, sendsEmail } from "@agenteschat/client/lib/join-requests";
import { can, makesAgents } from "@agenteschat/client/lib/permissions";
import { settingsSectionNameKey } from "@agenteschat/client/lib/personal-view";
import { grants, rolesOf } from "@agenteschat/client/lib/roles";
import { isEmail } from "@agenteschat/client/lib/text";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardHeader,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  Field,
  FilterBar,
  FilterChip,
  FoldRow,
  GroupHeading,
  Input,
  List,
  Locked,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuSub,
  overLimit,
  PageHeader,
  PlanMeter,
  planAttention,
  SwapLabel,
  Textarea,
} from "@agenteschat/ui";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/api/context";
import { AgentAvatar } from "@/components/AgentAvatar";
import { MenuEntries } from "@/components/DesktopMenus";
import { usePersonMenu } from "@/components/entity-menus";
import { useFilterCopy } from "@/components/filters";
import { useCopied } from "@/components/invite/copied";
import { State, Who, whenWords } from "@/components/invite/InviteRows";
import { LoadingList } from "@/components/Loading";
import { CreateAgentLink } from "@/components/new-agent/NewAgentDialog";
import { useOrg } from "@/components/org-context";
import { ProfileTrigger } from "@/components/ProfileCard";
import { MailLoss, mailTitle } from "@/components/roles/RolePeople";
import { RoleChoices } from "@/components/roles/RolesPicker";
import { RoleChip } from "@/components/roles/RolesSection";
import { useDirectory } from "@/hooks/useDirectory";
import { useTextLimit } from "@/hooks/useTextLimit";
import type { MenuEntry } from "@/lib/context-menu";
import { entityMenu } from "@/lib/entity-menu";
import { planMeterText, usageShown } from "@/lib/plan-usage";
import { useToast } from "@/lib/toast";
import { InviteActions } from "./InvitesPage";
import "./members.css";

type MenuItemEntry = Extract<MenuEntry, { kind: "item" }>;

/**
 * Configurações › Pessoas › Membros (ADR 0090, 0184): whoever may invite gets "Copiar link de convite" and "Convidar
 * pessoas" (the workspace's one invite dialog) on top, and what waits on them in the Convites tab; a member who may not
 * invite suggests someone here. Then the people and the agents.
 */
export function MembersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const { org, me } = useOrg();
  const toast = useToast();
  const dir = useDirectory(org.id);
  const manage = can(org, "manage_members");
  const invites = can(org, "invite_people");
  const setRolesOf = useSetMemberRoles(org.id);
  const peopleQuery = usePeople(org.id);
  const orgRoles = useRoles(org.id).data?.roles ?? [];
  const month = formatMonth(i18n.language, new Date());
  const [roles, setRoles] = useState<string[]>([]);
  const personEntries = usePersonMenu();
  const meterText = planMeterText(t, i18n.language);
  const allPeople = peopleQuery.data ?? [];
  const filterCopy = useFilterCopy();
  const authConfig = useAuthConfig();
  // On a server that sends no email, an owner makes the link for a member who forgot their password (ADR 0158).
  const makesPasswordLinks = org.role === "owner" && authConfig.data !== undefined && !authConfig.data.passwordReset;
  const [passwordLinkFor, setPasswordLinkFor] = useState<{ userId: string; name: string } | null>(null);
  // A person's ⋯ › Cargos: each tick saves; a cargo that takes a mailbox from an agent asks first (`mail`).
  const api = useApi();
  const [giving, setGiving] = useState(false);
  const [mail, setMail] = useState<{ lost: RoleMailLoss[]; answer: (yes: boolean) => void } | null>(null);
  const giveRoles = async (m: Person, roleIds: string[]) => {
    const added = roleIds.filter((id) => !(m.roleIds ?? []).includes(id));
    setGiving(true);
    try {
      const lost = (await Promise.all(added.map((id) => api.roles.mailLoss(org.id, id, [m.userId])))).flat();
      const yes = lost.length === 0 || (await new Promise<boolean>((answer) => setMail({ lost, answer })));
      if (!yes) return;
      setRolesOf.mutate(
        { userId: m.userId, roleIds, ...(added.length ? { mailLossSeen: lost.map((x) => x.accountId) } : {}) },
        { onError: (e) => toast.show(errorText(t, e), "error") },
      );
    } catch (e) {
      toast.show(errorText(t, e), "error");
    } finally {
      setGiving(false);
    }
  };
  // The filter's values: `owner`, or a role's id.
  const people = allPeople.filter(
    (m) =>
      roles.length === 0 || roles.some((r) => (r === "owner" ? m.role === "owner" : (m.roleIds ?? []).includes(r))),
  );
  // A personal workspace (ADR 0159): a few people need no filter by role, and its owner's own row leaves their roles
  // out (they say nothing to them); everyone else's keep theirs, and their menu gives one.
  const personal = isPersonal(org);

  return (
    <div className={`${embedded ? "settings__section" : "page"} members-page`}>
      <PageHeader
        level={embedded ? 2 : 1}
        title={t(settingsSectionNameKey(org, "members"))}
        meta={t(modeKey(org, "members.subtitle"), {
          count: people.length,
          people: people.length,
          agents: dir.agents.length,
          org: org.name,
        })}
        actions={invites && <InviteActions />}
      />

      <div className="ac-groups">
        {!invites && <Suggestions />}

        <section aria-labelledby="sec-people" className="section section--tight">
          <GroupHeading id="sec-people" title={t("members.people")} />
          {!personal && (
            <FilterBar
              label={t("members.filters")}
              clearText={filterCopy.clearAll}
              onClear={() => setRoles([])}
              filters={[
                {
                  key: "role",
                  active: roles.length > 0,
                  node: (
                    <FilterChip
                      label={t("members.roleFilter")}
                      icon="members"
                      multiple
                      options={[
                        { value: "owner", label: t("roles.owner") },
                        ...orgRoles.filter((r) => r.kind === "custom").map((r) => ({ value: r.id, label: r.name })),
                      ]}
                      value={roles}
                      onChange={setRoles}
                      valueText={(o) => o.label}
                      countText={(count) => t("members.rolesCount", { count })}
                      clearLabel={filterCopy.clearOf(t("members.roleFilter"))}
                    />
                  ),
                },
              ]}
            />
          )}
          {peopleQuery.isLoading && <LoadingList count={3} trailing />}
          <List>
            {people.map((m) => {
              const isMe = m.userId === me.user.id;
              const held = rolesOf(m, orgRoles);
              // The server says who is below whom; here the roles show in the menu when there's anything to give.
              const gives = manage && (m.role !== "owner" || org.role === "owner") && orgRoles.some((r) => r.givable);
              const ownRoles = personal && isMe && m.role === "owner";
              const linksPassword = !isMe && makesPasswordLinks;
              // The row's own menu: of the person's right-click menu, what acts on them here.
              const acts = personEntries(m).filter(
                (e): e is MenuItemEntry => e.kind === "item" && (e.id === "dm" || e.id === "remove"),
              );
              const out = acts.filter((e) => e.id === "remove");
              return (
                <div key={m.userId} className="ac-list__row members-person" {...entityMenu(() => personEntries(m))}>
                  <ProfileTrigger
                    actor={{ type: "person", id: m.userId }}
                    label={t("profile.of", { name: m.name })}
                    decorative
                  >
                    <Avatar
                      size="md"
                      name={m.name}
                      imageUrl={m.image}
                      presence={m.presence}
                      presenceLabel={t(`presence.${m.presence}`)}
                    />
                  </ProfileTrigger>
                  <span className="list-col">
                    <ProfileTrigger
                      actor={{ type: "person", id: m.userId }}
                      label={t("profile.of", { name: m.name })}
                      className="profile-trigger--name members-person__name ac-captop"
                    >
                      {m.name}
                      {isMe ? t("common.youSuffix") : ""}
                    </ProfileTrigger>
                    <span className="small muted members-person__ids">
                      {m.handle && <span>@{m.handle}</span>}
                      <span>{m.email}</span>
                    </span>
                  </span>
                  {!ownRoles && (m.role === "owner" || held.length > 0) && (
                    <span className="members-roles">
                      {m.role === "owner" && (
                        <Chip icon="audienceOwner" title={t("roles.ownerTitle")}>
                          {t("roles.owner")}
                        </Chip>
                      )}
                      {held.map((r) => (
                        <RoleChip key={r.id} role={r} />
                      ))}
                    </span>
                  )}
                  <span className="members-person__seen ac-captail ac-captop">
                    <span className="small muted">
                      {m.online
                        ? t("members.activeNow")
                        : m.lastSeenAt
                          ? t("members.seen", { when: relativeTime(t, i18n.language, m.lastSeenAt) })
                          : t("members.joined", { when: formatShortDate(i18n.language, m.joinedAt) })}
                    </span>
                  </span>
                  <span className="members-person__menu ac-captail ac-captop">
                    {(acts.length > 0 || gives || linksPassword) && (
                      <Menu
                        align="end"
                        label={t("members.moreOf", { name: m.name })}
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            icon="more"
                            aria-label={t("members.moreOf", { name: m.name })}
                          />
                        }
                      >
                        <MenuEntries entries={acts.filter((e) => e.id === "dm")} />
                        {gives && (
                          <MenuSub icon="shield" label={t("rolesPage.rolesCta")}>
                            <RoleChoices
                              roles={orgRoles}
                              value={m.roleIds ?? []}
                              disabled={setRolesOf.isPending || giving}
                              onChange={(roleIds) => void giveRoles(m, roleIds)}
                            />
                          </MenuSub>
                        )}
                        {linksPassword && (
                          <MenuItem
                            icon="key"
                            description={t("members.passwordLink.hint")}
                            onSelect={() => setPasswordLinkFor({ userId: m.userId, name: m.name })}
                          >
                            {t("members.passwordLink.item")}
                          </MenuItem>
                        )}
                        {out.length > 0 && (acts.length > out.length || gives || linksPassword) && <MenuSeparator />}
                        <MenuEntries entries={out} />
                      </Menu>
                    )}
                  </span>
                </div>
              );
            })}
          </List>
          <PasswordLinkDialog person={passwordLinkFor} onClose={() => setPasswordLinkFor(null)} />
          <Dialog
            open={mail !== null}
            onOpenChange={(open) => {
              if (open) return;
              mail?.answer(false);
              setMail(null);
            }}
            title={mail ? mailTitle(t, mail.lost) : ""}
            closeLabel={t("common.close")}
            width={440}
          >
            <DialogBody>{mail && <MailLoss lost={mail.lost} />}</DialogBody>
            <DialogFooter bar>
              <Button
                onClick={() => {
                  mail?.answer(false);
                  setMail(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  mail?.answer(true);
                  setMail(null);
                }}
              >
                {t("rolesPage.mail.giveAnyway")}
              </Button>
            </DialogFooter>
          </Dialog>
        </section>

        <section aria-labelledby="sec-agents" className="section section--tight">
          <GroupHeading id="sec-agents" title={t("members.agents")} aside={makesAgents(org) && <CreateAgentLink />} />
          <List>
            {dir.agents.length === 0 && <div className="ac-list__row muted">{t("members.noAgents")}</div>}
            {dir.agents.map((a) => {
              const owner = a.ownerUserId ? dir.memberById.get(a.ownerUserId) : undefined;
              // Its plan's limits, the budget under them only once it spent through the API (ADR 0063 §5).
              const shown = usageShown(a.brain, a.budgetUsedPercent ?? 0);
              const budget = shown.budget && a.budgetUsedPercent !== undefined;
              const attention = shown.plan && planAttention(shown.plan.usage, meterText);
              return (
                <FoldRow
                  key={a.id}
                  className="members-agent"
                  face={<AgentAvatar agentId={a.id} size="md" name={a.name} />}
                  title={
                    <>
                      <b>
                        {a.name}
                        {a.role ? ` · ${a.role}` : ""}
                      </b>
                      <span className="ac-mediarow__meta">
                        {owner ? t("members.ownerLine", { name: owner.name }) : t("members.noOwner")}
                      </span>
                    </>
                  }
                  end={
                    attention && (
                      <span className="ac-planword" data-level={attention.level}>
                        {attention.word}
                      </span>
                    )
                  }
                >
                  {shown.plan && (
                    <PlanMeter
                      compact
                      className="members-agent__usage"
                      usage={shown.plan.usage}
                      text={meterText}
                      label={shown.plan.account}
                    />
                  )}
                  {budget && (
                    <span className="small muted tabular">
                      {t("members.budgetLine", {
                        percent: formatPercent(i18n.language, a.budgetUsedPercent ?? 0),
                        month,
                      })}
                    </span>
                  )}
                  {!shown.plan && !budget && (
                    <span className="small muted">{a.brain?.account ?? t("presence.agentWhy.noAi")}</span>
                  )}
                  <div className="ac-acts">
                    <Button asChild variant="link">
                      <Link to="/org/$orgId/agents/$agentId" params={{ orgId: org.id, agentId: a.id }}>
                        {t("profile.viewProfile")}
                      </Link>
                    </Button>
                  </div>
                </FoldRow>
              );
            })}
          </List>
        </section>
      </div>
    </div>
  );
}

/**
 * Members › the person › "Make a new-password link" (ADR 0158): made when it opens, shown to copy and send where the
 * team talks. It works once, for an hour; making another ends this one.
 */
function PasswordLinkDialog({
  person,
  onClose,
}: {
  person: { userId: string; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const { org } = useOrg();
  const [copied, copy] = useCopied();
  const make = useMutation({
    mutationFn: (userId: string) => api.orgs.passwordLink(org.id, userId),
    meta: { silent: true },
  });
  const { mutate, reset } = make;
  useEffect(() => {
    if (person) mutate(person.userId);
    else reset();
  }, [person, mutate, reset]);
  const url = make.data?.url;
  return (
    <Dialog
      open={person !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("members.passwordLink.title", { name: person?.name ?? "" })}
      description={t("members.passwordLink.lead")}
      closeLabel={t("common.close")}
      width={460}
    >
      <DialogBody>
        {make.isError ? (
          <Alert>{errorText(t, make.error)}</Alert>
        ) : (
          <Field label={t("members.passwordLink.label")} id="password-link">
            <Input readOnly value={url ?? ""} placeholder={t("members.passwordLink.making")} />
          </Field>
        )}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="primary"
          disabled={!url}
          loading={make.isPending}
          onClick={() => url && copy("password-link", url)}
        >
          <SwapLabel
            icon="copy"
            altIcon="check"
            label={t("members.passwordLink.copy")}
            alt={t("common.copied")}
            showAlt={copied !== null}
          />
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** The people who may invite here (ADR 0085): the owners, and whoever holds a role that gives it. */
function invitersOf(people: readonly Person[], roles: readonly OrgRole[]) {
  return people
    .filter((p) => p.role === "owner" || rolesOf(p, roles).some((r) => grants(r.permissions).has("invite_people")))
    .map((p) => p.name);
}

/** What a suggestion's refusal says, about the person suggested (the server's codes, ADR 0090 §7). */
const SUGGEST_REFUSALS: Record<string, "member" | "invited" | "waiting" | "full" | "invalid" | undefined> = {
  "join.member": "member",
  "join.invited": "invited",
  "join.waiting": "waiting",
  "join.full": "full",
  "join.invalid_email": "invalid",
};

/**
 * A member who may not invite (ADR 0090 §7): a card to suggest someone, which reaches the people who invite as a
 * request, and the suggestions still waiting, each to take back.
 */
function Suggestions() {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const people = usePeople(org.id).data ?? [];
  const orgRoles = useRoles(org.id).data?.roles ?? [];
  const mine = useMySuggestions(org.id);
  const cancel = useCancelSuggestion(org.id);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  const inviters = invitersOf(people, orgRoles);
  const names = namesText(t, inviters, 2);
  const waiting = mine.data ?? [];
  return (
    <>
      <Card aria-labelledby="suggest-title">
        <CardHeader
          id="suggest-title"
          icon="person"
          title={t("members.suggest.title", { org: org.name })}
          subtitle={
            inviters.length
              ? t("members.suggest.lead", { count: inviters.length, names })
              : t("members.suggest.leadNoNames")
          }
        />
        <div className="ac-acts">
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setN((x) => x + 1);
              setOpen(true);
            }}
          >
            {t("members.suggest.button")}
          </Button>
        </div>
      </Card>
      {waiting.length > 0 && (
        <section aria-labelledby="sec-mine" className="section section--tight">
          <GroupHeading id="sec-mine" title={t("members.suggest.mine")} />
          <List>
            {waiting.map((s: MySuggestion) => (
              // biome-ignore lint/a11y/useSemanticElements: a row of the list, named for whom it suggests
              <div
                key={s.id}
                className="ac-list__row members-row ac-mediarow"
                role="group"
                aria-label={t("members.suggest.label", { email: s.email })}
              >
                <Who
                  face={<Avatar size="md" name={s.email} initials={s.email.slice(0, 2).toUpperCase()} />}
                  name={s.email}
                  sub={s.note ?? ""}
                >
                  <State icon="clock">
                    {t("members.suggest.waiting", { when: whenWords(t, i18n.language, s.createdAt) })}
                  </State>
                </Who>
                <span className="ac-mediarow__end ac-mediarow__end--wrap members-row__acts ac-acts">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={cancel.isPending && cancel.variables === s.id}
                    aria-label={t("members.suggest.cancelOf", { email: s.email })}
                    onClick={() => cancel.mutate(s.id, { onSuccess: () => toast.show(t("members.suggest.cancelled")) })}
                  >
                    {t("common.cancel")}
                  </Button>
                </span>
              </div>
            ))}
          </List>
        </section>
      )}
      <SuggestDialog key={n} open={open} onClose={() => setOpen(false)} inviters={inviters} />
    </>
  );
}

/** "Sugerir pessoa": an address and, if they like, who it is; refusals said under the address, in our words. */
function SuggestDialog({ open, onClose, inviters }: { open: boolean; onClose: () => void; inviters: string[] }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const suggest = useSuggestPerson(org.id);
  // Where no email goes out, whoever approves hands the person the link instead.
  const emails = sendsEmail(useAuthConfig().data);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const noteLimit = useTextLimit(JOIN_NOTE_MAX);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (overLimit(note, noteLimit)) return;
    const address = email.trim().toLowerCase();
    if (!isEmail(address)) return setError(t("members.suggest.refused.invalid"));
    setError(null);
    suggest.mutate(
      { email: address, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          toast.show(
            inviters.length
              ? t("members.suggest.sent", { count: inviters.length, names: namesText(t, inviters, 2) })
              : t("members.suggest.sentNoNames"),
          );
          onClose();
        },
        onError: (e) => {
          const refusal = SUGGEST_REFUSALS[errorCode(e) ?? ""];
          setError(
            refusal ? t(`members.suggest.refused.${refusal}`, { email: address, org: org.name }) : errorText(t, e),
          );
        },
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("members.suggest.dialogTitle", { org: org.name })}
      description={emails ? t("members.suggest.dialogText") : t("members.suggest.dialogTextNoEmail")}
      closeLabel={t("common.close")}
      width={480}
    >
      <Locked when={suggest.isPending}>
        <DialogBody>
          <Field label={t("members.suggest.email")} id="suggest-email" error={error}>
            <Input
              type="email"
              autoComplete="off"
              value={email}
              placeholder={t("members.emailsPlaceholder")}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
            />
          </Field>
          <Field
            id="suggest-note"
            label={
              <>
                {t("members.suggest.who")} <span className="invite-optional">{t("members.dialog.optional")}</span>
              </>
            }
          >
            <Textarea
              rows={2}
              limit={noteLimit}
              value={note}
              placeholder={t("members.suggest.whoPlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </DialogBody>
      </Locked>
      <DialogFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={overLimit(note, noteLimit)} loading={suggest.isPending} onClick={submit}>
          {t("members.suggest.send")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
