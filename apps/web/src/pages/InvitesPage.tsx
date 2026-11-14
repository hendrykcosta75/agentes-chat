import type { InvitationWithStatus, InviteLink, JoinRequest } from "@agenteschat/client";
import {
  useAllInvitations,
  useApproveJoinRequest,
  useAuthConfig,
  useChannels,
  useDenyJoinRequest,
  useInviteLinks,
  useJoinRequests,
  useMakeInviteLink,
  useResendInvitation,
  useRevokeInvitation,
  useRoles,
  useTurnOffInviteLink,
  useWorkspaceLimits,
} from "@agenteschat/client";
import { errorCode } from "@agenteschat/client/lib/errors";
import { formatShortDate, joinNames, relativeTime, timeLeft } from "@agenteschat/client/lib/format";
import { linkFull } from "@agenteschat/client/lib/invite-start";
import { approvalNews, JOIN_REASON_MAX, sendsEmail } from "@agenteschat/client/lib/join-requests";
import { membersFull } from "@agenteschat/client/lib/limits";
import { isEveryone, sortRoles } from "@agenteschat/client/lib/roles";
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  Field,
  FilterChip,
  fold,
  GroupHeading,
  Input,
  List,
  Locked,
  Menu,
  MenuItem,
  MenuNote,
  overLimit,
  PageHeader,
  SearchField,
  SwapLabel,
  Textarea,
  Toolbar,
} from "@agenteschat/ui";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlanHold } from "@/components/ai/ConnectAiSteps";
import { useFilterCopy } from "@/components/filters";
import { useCopied } from "@/components/invite/copied";
import { EditInvitationDialog, EditLinkDialog } from "@/components/invite/EditDialogs";
import { useInviteDialog } from "@/components/invite/InviteDialog";
import { MarkOf } from "@/components/invite/InviteFields";
import { givesText, State, Who, whenWords } from "@/components/invite/InviteRows";
import { MembersFull } from "@/components/Limits";
import { useOrg } from "@/components/org-context";
import { RolesPicker } from "@/components/roles/RolesPicker";
import { useDirectory } from "@/hooks/useDirectory";
import { useTextLimit } from "@/hooks/useTextLimit";
import { copyText } from "@/lib/context-menu";
import { TOAST_MS, useToast } from "@/lib/toast";
import "./members.css";

/**
 * How long a cancelled invitation waits for Desfazer before it's revoked: as long as the toast that offers it stays
 * (tests shorten it).
 */
export const undoWindow = { ms: TOAST_MS };

/** Rows a group shows, then how many more each "Mostrar mais" adds. */
const SHOWN = 20;
const MORE = 30;
/** Past this many rows the page searches them. */
const SEARCH_FROM = 8;

type Kind = "requests" | "links" | "emails";

/**
 * Configurações › Pessoas › Convites (ADR 0184), for whoever may invite: who waits on them (requests through a link
 * and members' suggestions), the links, each with what it gives and its state, and the invitations by e-mail. Each
 * group 20 rows at a time; past 8 rows in all, a search and the kind of row to show.
 */
export function InvitesPage() {
  const { t } = useTranslation();
  const { org } = useOrg();
  const dir = useDirectory(org.id);
  // `?request=…&do=approve|deny`: the admins' e-mail opens that request here.
  const search = useSearch({ strict: false }) as { request?: string; do?: string };
  const requests = useJoinRequests(org.id);
  const links = useInviteLinks(org.id);
  const invitations = useAllInvitations(org.id);
  const roles = useRoles(org.id).data?.roles ?? [];
  const channels = useChannels(org.id).data ?? [];
  const invite = useInviteDialog();
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const filterCopy = useFilterCopy();
  const look = { roles, channels, agentName: (id: string) => dir.agentById.get(id)?.name, general: true };
  const roleNames = (ids: readonly string[] | undefined) =>
    sortRoles(roles.filter((r) => (ids ?? []).includes(r.id)))
      .map((r) => r.name)
      .join(" ");
  const q = fold(query.trim());
  const hit = (...words: (string | null | undefined)[]) => !q || fold(words.filter(Boolean).join(" ")).includes(q);
  const wants = (k: Kind) => kinds.length === 0 || kinds.includes(k);
  const allRequests = requests.data ?? [];
  const allLinks = links.data ?? [];
  const allInvitations = invitations.data ?? [];
  const shownRequests = wants("requests")
    ? allRequests.filter((r) => hit(r.name, r.email, roleNames(r.link?.roleIds), r.suggestedBy))
    : [];
  const shownLinks = wants("links")
    ? allLinks.filter((l) => hit(roleNames(l.roleIds) || t("roles.member"), l.createdBy))
    : [];
  const shownInvitations = wants("emails")
    ? allInvitations.filter((i) => hit(i.email, roleNames(i.roleIds) || t("roles.member"), i.invitedBy))
    : [];
  const total = allRequests.length + allLinks.length + allInvitations.length;
  const loaded = requests.isSuccess && links.isSuccess && invitations.isSuccess;
  const filtered = q !== "" || kinds.length > 0;
  const kindLabel = t("invites.type");
  return (
    <div className="settings__section members-page invites-page">
      <PageHeader
        level={2}
        title={t("settings.section.invites")}
        meta={t("settings.sectionText.invites")}
        actions={<InviteActions />}
      />
      {total > SEARCH_FROM && (
        <Toolbar
          size="sm"
          search={
            <SearchField
              size="sm"
              value={query}
              placeholder={t("invites.search")}
              aria-label={t("invites.search")}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              clearLabel={t("filters.clearSearch")}
            />
          }
        >
          <FilterChip
            label={kindLabel}
            icon="filter"
            multiple
            options={(["requests", "links", "emails"] as const).map((k) => ({
              value: k,
              label: t(`invites.types.${k}`),
            }))}
            value={kinds}
            onChange={(v) => setKinds(v as Kind[])}
            valueText={(o) => o.label}
            countText={(count) => t("invites.typesCount", { count })}
            clearLabel={filterCopy.clearOf(kindLabel)}
          />
        </Toolbar>
      )}
      <div className="ac-groups">
        <MembersFull />
        {loaded && total === 0 && (
          <List>
            <div className="ac-list__row members-empty">
              <span className="muted">{t("members.invitations.empty")}</span>
              {invite && (
                <Button variant="ghost" size="sm" onClick={() => invite.open()}>
                  {t("members.inviteTitle")}
                </Button>
              )}
            </div>
          </List>
        )}
        {loaded &&
          total > 0 &&
          filtered &&
          shownRequests.length + shownLinks.length + shownInvitations.length === 0 && (
            <List>
              <div className="ac-list__row members-empty">
                <span className="muted">{t("invites.noMatch", { query: query.trim() })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setKinds([]);
                  }}
                >
                  {filterCopy.clearAll}
                </Button>
              </div>
            </List>
          )}
        <WaitingRequests requests={shownRequests} look={look} focus={search.request} action={search.do} />
        <InviteLinks links={shownLinks} look={look} />
        <EmailInvitations invitations={shownInvitations} look={look} loading={invitations.isLoading} />
      </div>
    </div>
  );
}

type Look = Parameters<typeof givesText>[2];

/** The rows of a group, 20 at first, then "Mostrar mais 30" at the list's end. */
function useShown<T>(rows: readonly T[]) {
  const [count, setCount] = useState(SHOWN);
  const { t } = useTranslation();
  const left = rows.length - count;
  return {
    rows: rows.slice(0, count),
    more:
      left > 0 ? (
        <div className="ac-list__row members-more">
          <Button variant="ghost" size="sm" onClick={() => setCount((c) => c + MORE)}>
            {t("members.column.more", { count: Math.min(MORE, left) })}
          </Button>
        </div>
      ) : null,
  };
}

/**
 * The page's own actions for whoever may invite: copy the workspace's link (made the first time, ADR 0068) and open
 * the invite dialog. In a personal workspace both ask first who is invited (ADR 0159 §4).
 */
export function InviteActions() {
  const { t } = useTranslation();
  const { org } = useOrg();
  const invite = useInviteDialog();
  const links = useInviteLinks(org.id);
  const make = useMakeInviteLink(org.id);
  const [copied, copy] = useCopied();
  // Nobody joins on a billing hold: the invite dialog says so, and a link would open on a refusal.
  const held = usePlanHold() !== null;
  const copyLink = async () => {
    const shown = links.data?.find((l) => l.url !== null && l.plain !== false)?.url;
    const url = shown ?? (await make.mutateAsync().catch(() => null))?.url;
    if (url) copy("link", url);
  };
  const copyAsked = () => {
    if (invite) invite.ask(() => void copyLink());
    else void copyLink();
  };
  return (
    <>
      {!held && (
        <Button loading={make.isPending} onClick={copyAsked}>
          <SwapLabel
            icon="link"
            altIcon="check"
            label={t("members.copyInviteLink")}
            alt={t("common.copied")}
            showAlt={copied !== null}
          />
        </Button>
      )}
      {invite && (
        <Button variant="primary" icon="plus" onClick={() => invite.open()}>
          {t("members.inviteTitle")}
        </Button>
      )}
    </>
  );
}

/**
 * Esperando você (ADR 0068, 0090, 0184): who asked through a link and whom members suggested, oldest first, each
 * approved with its cargos (starting on the link's the approver may give) or turned down with a reason. Approving
 * gives the link's channels and agents too, as far as the approver may give them. `focus` (from the admins' email):
 * that request in view with Aprovar focused, which the admin still presses, or its Recusar dialog open.
 */
function WaitingRequests({
  requests,
  look,
  focus,
  action,
}: {
  requests: readonly JoinRequest[];
  look: Look;
  focus?: string;
  action?: string;
}) {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const list = useJoinRequests(org.id);
  const approve = useApproveJoinRequest(org.id);
  const deny = useDenyJoinRequest(org.id);
  const full = membersFull(useWorkspaceLimits(org.id).data) !== null;
  const orgRoles = useRoles(org.id).data?.roles ?? [];
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [denying, setDenying] = useState<JoinRequest | null>(null);
  const [reason, setReason] = useState("");
  const reasonLimit = useTextLimit(JOIN_REASON_MAX);
  const [handOff, setHandOff] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [gone, setGone] = useState(false);
  const approveButtons = useRef(new Map<string, HTMLButtonElement>());
  const opened = useRef<string | null>(null);
  const shown = useShown(requests);

  useEffect(() => {
    if (!focus || opened.current === focus || !list.data) return;
    opened.current = focus;
    const request = list.data.find((r) => r.id === focus);
    if (!request) return setGone(true);
    if (action === "deny") {
      setReason("");
      return setDenying(request);
    }
    const button = approveButtons.current.get(request.id);
    button?.scrollIntoView({ block: "center" });
    button?.focus();
  }, [focus, action, list.data]);

  // Approving gives what the approver picks (ADR 0184 §8): a link's cargo above theirs starts out, and the row says so.
  const givable = (r: JoinRequest) =>
    (r.link?.roleIds ?? []).filter((id) => orgRoles.some((x) => x.id === id && x.givable));
  const rolesOf = (r: JoinRequest) => roles[r.id] ?? givable(r);
  const approveOne = (r: JoinRequest) =>
    approve.mutate(
      { id: r.id, roleIds: rolesOf(r) },
      {
        onSuccess: (result) => {
          const news = approvalNews(result);
          if ("send" in news) {
            setCopied(false);
            setHandOff({ name: r.name, url: news.send });
          } else if (news.said === "joined") toast.show(t("members.requests.joined", { name: r.name }));
          else toast.show(t("members.requests.invited", { email: r.email }));
        },
      },
    );
  const denyOne = () => {
    if (!denying || overLimit(reason, reasonLimit)) return;
    deny.mutate(
      { id: denying.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.show(t("members.requests.denied"));
          setDenying(null);
        },
        // Any other failure keeps the dialog: the reason stays there to send again.
        onError: (e) => {
          if (errorCode(e) === "join.answered") setDenying(null);
        },
      },
    );
  };

  return (
    <>
      {gone && <Alert tone="neutral">{t("members.requests.gone")}</Alert>}
      {requests.length > 0 && (
        <section aria-label={t("members.waitingTitle")} className="section section--tight">
          <GroupHeading title={t("members.waitingTitle")} count={requests.length} />
          <List>
            {shown.rows.map((r) => {
              const answering =
                (approve.isPending && approve.variables?.id === r.id) ||
                (deny.isPending && deny.variables?.id === r.id);
              const when = whenWords(t, i18n.language, r.createdAt);
              const by = r.suggestedBy ?? null;
              const how = by
                ? t("members.requests.suggested", { name: by, when })
                : r.link?.createdBy
                  ? t("invites.viaLinkOf", { name: r.link.createdBy, when })
                  : t("members.requests.viaLink", { when });
              const link = r.link;
              const gives = link ? givesText(t, link, { ...look, general: false }) : "";
              const linkIsFull = link?.full === true;
              const above = sortRoles(
                orgRoles.filter((x) => (link?.roleIds ?? []).includes(x.id) && !isEveryone(x) && !x.givable),
              ).map((x) => x.name);
              return (
                // biome-ignore lint/a11y/useSemanticElements: a row of the list, named for who it is about
                <div
                  key={r.id}
                  id={`join-request-${r.id}`}
                  className="ac-list__row members-row ac-mediarow"
                  role="group"
                  aria-label={
                    by
                      ? t("members.requests.suggestedLabel", { by, name: r.name })
                      : t("members.requests.label", { name: r.name })
                  }
                >
                  <Who face={<Avatar size="md" name={r.name} />} name={r.name} sub={r.email}>
                    <State icon={by ? "person" : "link"}>{how}</State>
                    {/* Nobody proved the address: approving can't let them in at once (ADR 0072). */}
                    {!r.verified && !by && (
                      <span className="members-row__flag">
                        <Chip icon="mail">{t("members.requests.unverified")}</Chip>
                      </span>
                    )}
                  </Who>
                  <span className="ac-mediarow__end ac-mediarow__end--wrap members-row__acts">
                    <RolesPicker
                      size="sm"
                      roles={orgRoles}
                      value={rolesOf(r)}
                      onChange={(ids) => setRoles((prev) => ({ ...prev, [r.id]: ids }))}
                      label={t("members.requests.roleOf", { name: r.name })}
                      disabled={answering}
                    />
                    <Button
                      ref={(el) => {
                        if (el) approveButtons.current.set(r.id, el);
                        else approveButtons.current.delete(r.id);
                      }}
                      size="sm"
                      variant="primary"
                      disabled={answering || full || linkIsFull}
                      loading={approve.isPending && approve.variables?.id === r.id}
                      onClick={() => approveOne(r)}
                    >
                      {t("members.requests.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={answering}
                      onClick={() => {
                        setReason("");
                        setDenying(r);
                      }}
                    >
                      {t("members.requests.deny")}
                    </Button>
                  </span>
                  {(gives || linkIsFull || above.length > 0) && (
                    <span className="ac-mediarow__body members-row__more">
                      {gives && <span className="small muted">{t("invites.withLink", { gives })}</span>}
                      {above.length > 0 && (
                        <State icon="lock">
                          {t("invites.roleLeftOut", { count: above.length, roles: joinNames(above, t) })}
                        </State>
                      )}
                      {linkIsFull && (
                        <State icon="alert" tone="soon">
                          {t("errors.join.linkFullApproval")}
                        </State>
                      )}
                    </span>
                  )}
                  {r.note && (
                    <p className="ac-mediarow__body members-row__note">
                      {t("members.requests.note", { note: r.note })}
                    </p>
                  )}
                </div>
              );
            })}
            {shown.more}
          </List>
        </section>
      )}
      <Dialog
        open={denying !== null}
        onOpenChange={(open) => !open && setDenying(null)}
        title={t("members.requests.denyTitle", { name: denying?.name ?? "" })}
        closeLabel={t("common.close")}
        width={440}
      >
        <Locked when={deny.isPending}>
          <DialogBody>
            <Field
              label={t("members.requests.reason")}
              id="join-deny-reason"
              hint={{
                name: t("common.about", { label: t("members.requests.reason") }),
                text: t("members.requests.reasonHelp"),
              }}
            >
              <Textarea rows={3} limit={reasonLimit} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </DialogBody>
        </Locked>
        <DialogFooter>
          <Button onClick={() => setDenying(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={overLimit(reason, reasonLimit)} loading={deny.isPending} onClick={denyOne}>
            {t("members.requests.deny")}
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        open={handOff !== null}
        onOpenChange={(open) => !open && setHandOff(null)}
        title={t("members.requests.copyTitle", { name: handOff?.name ?? "" })}
        description={t("members.requests.copyText")}
        closeLabel={t("common.close")}
        width={440}
      >
        <DialogBody>
          <div className="invite-link__row">
            <Input
              readOnly
              value={handOff?.url ?? ""}
              aria-label={t("members.requests.copyTitle", { name: handOff?.name ?? "" })}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button onClick={() => handOff && void copyText(handOff.url, () => setCopied(true))}>
              <SwapLabel
                icon="copy"
                altIcon="check"
                label={t("common.copy")}
                alt={t("common.copied")}
                showAlt={copied}
              />
            </Button>
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}

/** Newest first. */
const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

/**
 * Links (ADR 0068, 0184): each link with its first cargo's mark, its cargos as its name ("Membro" with none), what it
 * gives, how many it took and until when, whose it is when not the viewer's; "Copiar link" and ⋯ (Editar, Desativar
 * link). A link made before links could be shown again can only be turned off.
 */
function InviteLinks({ links, look }: { links: readonly InviteLink[]; look: Look }) {
  const { t, i18n } = useTranslation();
  const { org, me } = useOrg();
  const turnOff = useTurnOffInviteLink(org.id);
  const [copied, copy] = useCopied();
  const [editing, setEditing] = useState<InviteLink | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [closing, setClosing] = useState<InviteLink | null>(null);
  const sorted = [...links].sort(newestFirst);
  const shown = useShown(sorted);
  if (links.length === 0) return <TurnOffLink link={closing} onClose={() => setClosing(null)} turnOff={turnOff} />;
  const date = (iso: string) => formatShortDate(i18n.language, iso);
  return (
    <section aria-label={t("invites.links")} className="section section--tight">
      <GroupHeading title={t("invites.links")} count={links.length} />
      <List>
        {shown.rows.map((l) => {
          const cargos = sortRoles(look.roles.filter((r) => (l.roleIds ?? []).includes(r.id))).map((r) => r.name);
          const title = cargos.length ? joinNames(cargos, t) : t("roles.member");
          const left = l.neverExpires ? null : timeLeft(t, l.expiresAt);
          const isFull = linkFull(l);
          const soon = isFull || (!l.neverExpires && new Date(l.expiresAt).getTime() - Date.now() < 86_400_000);
          const uses = l.uses ?? 0;
          const mine = l.createdByUserId ? l.createdByUserId === me.user.id : l.createdBy === me.user.name;
          const state = [
            l.maxUses ? t("invites.usesOf", { uses, count: l.maxUses }) : t("invites.joined", { count: uses }),
            l.neverExpires ? t("invites.neverEnds") : left ? t("invites.expiresLeft", { left }) : null,
            !mine && l.createdBy ? t("invites.by", { name: l.createdBy }) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const more = t("invites.linkMore", { name: title });
          if (l.url === null)
            return (
              // biome-ignore lint/a11y/useSemanticElements: a row of the list, named for the link
              <div key={l.id} className="ac-list__row members-row ac-mediarow" role="group" aria-label={title}>
                <Who
                  face={<MarkOf roles={look.roles} ids={l.roleIds ?? []} size={32} />}
                  name={title}
                  sub={
                    l.createdBy
                      ? t("members.link.earlier", {
                          when: relativeTime(t, i18n.language, l.createdAt),
                          name: l.createdBy,
                          date: date(l.expiresAt),
                        })
                      : t("members.link.earlierNoName", {
                          when: relativeTime(t, i18n.language, l.createdAt),
                          date: date(l.expiresAt),
                        })
                  }
                />
                <span className="ac-mediarow__end ac-mediarow__end--wrap members-row__acts ac-acts">
                  <Button variant="ghost" size="sm" className="ac-btn--danger" onClick={() => setClosing(l)}>
                    {t("members.link.turnOff")}
                  </Button>
                </span>
              </div>
            );
          return (
            // biome-ignore lint/a11y/useSemanticElements: a row of the list, named for the link
            <div
              key={l.id}
              className="ac-list__row members-row ac-mediarow"
              role="group"
              aria-label={t("invites.linkLabel", { name: title })}
            >
              <Who
                face={<MarkOf roles={look.roles} ids={l.roleIds ?? []} size={32} />}
                name={title}
                sub={givesText(t, { channelIds: l.channelIds ?? [], agentIds: l.agentIds ?? [] }, look)}
              >
                <State icon="clock" tone={soon ? "soon" : undefined}>
                  {state}
                </State>
              </Who>
              <span className="ac-mediarow__end ac-mediarow__end--wrap members-row__acts ac-acts">
                <Button variant="ghost" size="sm" onClick={() => l.url && copy(l.id, l.url)}>
                  <SwapLabel
                    icon="copy"
                    altIcon="check"
                    label={t("members.copyLink")}
                    alt={t("common.copied")}
                    showAlt={copied === l.id}
                  />
                </Button>
                <Menu
                  align="end"
                  label={more}
                  trigger={<Button variant="ghost" size="sm" iconOnly icon="more" aria-label={more} />}
                >
                  <MenuItem
                    icon="edit"
                    onSelect={() => {
                      setEditing(l);
                      setEditOpen(true);
                    }}
                  >
                    {t("invites.edit")}
                  </MenuItem>
                  <MenuItem icon="trash" danger onSelect={() => setClosing(l)}>
                    {t("invites.turnOff")}
                  </MenuItem>
                </Menu>
              </span>
            </div>
          );
        })}
        {shown.more}
      </List>
      {editing && (
        <EditLinkDialog
          key={editing.id}
          link={editing}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onTurnOff={() => {
            setEditOpen(false);
            setClosing(editing);
          }}
        />
      )}
      <TurnOffLink link={closing} onClose={() => setClosing(null)} turnOff={turnOff} />
    </section>
  );
}

/** "Desativar o link?": who can't ask with it any more, and the requests made through it that close too. */
function TurnOffLink({
  link,
  onClose,
  turnOff,
}: {
  link: InviteLink | null;
  onClose: () => void;
  turnOff: ReturnType<typeof useTurnOffInviteLink>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => !open && !turnOff.isPending && onClose()}
      title={t("members.link.turnOffTitle")}
      description={t("members.link.turnOffText", { count: link?.waiting ?? 0 })}
      closeLabel={t("common.close")}
      width={440}
    >
      <DialogFooter>
        <Button disabled={turnOff.isPending} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          loading={turnOff.isPending}
          onClick={() => link && turnOff.mutate(link.id, { onSettled: onClose })}
        >
          {t("invites.turnOff")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * What a sent invitation's toasts say: a server that sends no email sends nothing again, the same link for longer.
 * One sent before links lasted (nothing to copy) gets a new link instead, and its old one stops opening (ADR 0090).
 */
const SENT_WORDS = {
  email: { copied: "copied", resent: "resent", renewed: "renewed", newLink: "newLink" },
  link: { copied: "copiedNoEmail", resent: "resentNoEmail", renewed: "renewedNoEmail", newLink: "newLinkNoEmail" },
} as const;

/** Pending first, then expired; the newest first in each. */
const byNewest = (a: InvitationWithStatus, b: InvitationWithStatus) =>
  (a.status === "expired" ? 1 : 0) - (b.status === "expired" ? 1 : 0) || b.createdAt.localeCompare(a.createdAt);

/**
 * Convites por e-mail (ADR 0090, 0184): every invitation not accepted yet, with what it gives, its link to copy at any
 * time (the same as the email's), Reenviar (the same link, 7 more days), Editar (what it gives) and Cancelar with
 * Desfazer; an expired one is renewed or taken off the list.
 */
function EmailInvitations({
  invitations,
  look,
  loading,
}: {
  invitations: readonly InvitationWithStatus[];
  look: Look;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { org, me } = useOrg();
  const toast = useToast();
  const resend = useResendInvitation(org.id);
  const revoke = useRevokeInvitation(org.id);
  const [copied, copy] = useCopied();
  // Cancelled ones wait for Desfazer out of sight; each one's timer revokes it.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Sent again from here: until when it works now.
  const [resent, setResent] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<InvitationWithStatus | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const rows = invitations.filter((i) => !hidden.has(i.id)).sort(byNewest);
  const shown = useShown(rows);
  const date = (iso: string) => formatShortDate(i18n.language, iso);
  const words = SENT_WORDS[sendsEmail(useAuthConfig().data) ? "email" : "link"];

  const unhide = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const takeOff = (inv: InvitationWithStatus, said: "cancelled" | "dropped") => {
    setHidden((prev) => new Set(prev).add(inv.id));
    // It still goes when this page is left meanwhile: the toast offering Desfazer outlives it.
    const timer = setTimeout(() => {
      timers.current.delete(inv.id);
      revoke.mutate(inv.id, { onError: () => unhide(inv.id) });
    }, undoWindow.ms);
    timers.current.set(inv.id, timer);
    toast.show(t(`members.invitations.${said}`, { email: inv.email }), "info", {
      label: t("members.undo"),
      run: () => {
        const pending = timers.current.get(inv.id);
        if (!pending) return;
        clearTimeout(pending);
        timers.current.delete(inv.id);
        unhide(inv.id);
      },
    });
  };
  /** Sends it again with the same link (ADR 0090), or a lasting one for an invitation sent before links lasted. */
  const sendAgain = (inv: InvitationWithStatus, renewing: boolean) =>
    resend.mutate(inv.id, {
      onSuccess: (res) => {
        setResent((prev) => ({ ...prev, [inv.id]: res.expiresAt }));
        const said = !inv.url ? words.newLink : renewing ? words.renewed : words.resent;
        toast.show(t(`members.invitations.${said}`, { email: inv.email, date: date(res.expiresAt) }));
      },
    });

  if (rows.length === 0 && !loading) return null;
  return (
    <section aria-label={t("invites.emails")} className="section section--tight">
      <GroupHeading title={t("invites.emails")} count={rows.length || undefined} />
      <List>
        {shown.rows.map((inv) => {
          const left = timeLeft(t, inv.expiresAt);
          // Past its date it no longer opens, whatever the list said when it loaded.
          const off = inv.status === "expired" || !left;
          const again = resent[inv.id];
          const soon = !off && new Date(inv.expiresAt).getTime() - Date.now() < 2 * 86_400_000;
          const by = inv.invitedBy && inv.invitedBy !== me.user.name ? t("invites.by", { name: inv.invitedBy }) : null;
          const sub = [
            inv.role === "owner"
              ? [
                  t("roles.owner"),
                  givesText(t, { channelIds: inv.channelIds ?? [], agentIds: inv.agentIds ?? [] }, look),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : givesText(
                  t,
                  { roleIds: inv.roleIds ?? [], channelIds: inv.channelIds ?? [], agentIds: inv.agentIds ?? [] },
                  { ...look, member: true },
                ),
            by,
          ]
            .filter(Boolean)
            .join(" · ");
          const sending = resend.isPending && resend.variables === inv.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a row of the list, named for whom it invites
            <div
              key={inv.id}
              className="ac-list__row members-row ac-mediarow"
              data-off={off || undefined}
              role="group"
              aria-label={t("members.invitations.label", { email: inv.email })}
            >
              <Who
                face={<Avatar size="md" name={inv.email} initials={inv.email.slice(0, 1).toUpperCase()} />}
                name={inv.email}
                sub={sub}
              >
                {again && !off ? (
                  <State icon="check" tone="ok">
                    {t("members.invitations.resentState", { date: date(again) })}
                  </State>
                ) : off ? (
                  <State icon="clock">
                    {t("members.invitations.expired", { when: whenWords(t, i18n.language, inv.expiresAt) })}
                  </State>
                ) : (
                  <State icon="clock" tone={soon ? "soon" : undefined}>
                    {t("members.invitations.expires", { left })}
                  </State>
                )}
              </Who>
              <span className="ac-mediarow__end ac-mediarow__end--wrap members-row__acts ac-acts">
                {off ? (
                  <>
                    <Button size="sm" icon="refresh" loading={sending} onClick={() => sendAgain(inv, true)}>
                      {t("members.invitations.renew")}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={sending} onClick={() => takeOff(inv, "dropped")}>
                      {t("members.invitations.drop")}
                    </Button>
                  </>
                ) : (
                  <>
                    {inv.url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={sending}
                        onClick={() =>
                          copy(inv.id, inv.url ?? "", t(`members.invitations.${words.copied}`, { email: inv.email }))
                        }
                      >
                        <SwapLabel
                          icon="copy"
                          altIcon="check"
                          label={t("members.copyLink")}
                          alt={t("common.copied")}
                          showAlt={copied === inv.id}
                        />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="send"
                      disabled={!!again}
                      loading={sending}
                      onClick={() => sendAgain(inv, false)}
                    >
                      {t("members.resend")}
                    </Button>
                    <Menu
                      align="end"
                      label={t("members.invitations.more", { email: inv.email })}
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon="more"
                          disabled={sending}
                          aria-label={t("members.invitations.more", { email: inv.email })}
                        />
                      }
                    >
                      <MenuItem
                        icon="edit"
                        onSelect={() => {
                          setEditing(inv);
                          setEditOpen(true);
                        }}
                      >
                        {t("invites.edit")}
                      </MenuItem>
                      <MenuItem icon="trash" danger onSelect={() => takeOff(inv, "cancelled")}>
                        {t("members.invitations.cancel")}
                      </MenuItem>
                      {/* Sending again keeps a lasting link: one that reached the wrong person stops only here. */}
                      {inv.url && <MenuNote>{t("members.invitations.linkStays")}</MenuNote>}
                    </Menu>
                  </>
                )}
              </span>
            </div>
          );
        })}
        {shown.more}
      </List>
      {editing && (
        <EditInvitationDialog
          key={editing.id}
          invitation={editing}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onRenew={() => sendAgain(editing, true)}
        />
      )}
    </section>
  );
}
