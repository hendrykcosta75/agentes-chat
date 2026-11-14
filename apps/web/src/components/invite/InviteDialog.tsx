import type { Agent, BatchInviteResult, Channel, InviteBatch, InviteLinkMade } from "@agenteschat/client";
import {
  ApiError,
  keys,
  useAllInvitations,
  useApi,
  useAuthConfig,
  useChannels,
  useWorkspaceLimits,
} from "@agenteschat/client";
import { errorText, noAnswer } from "@agenteschat/client/lib/errors";
import { formatShortDate } from "@agenteschat/client/lib/format";
import {
  INVITE_LINK_MAX_USES,
  INVITE_LINK_TTL,
  INVITE_LINK_TTLS,
  type LinkChoices,
  plainLink,
  sameChoices,
} from "@agenteschat/client/lib/invite-start";
import { INVITE_NOTE_MAX, sendsEmail } from "@agenteschat/client/lib/join-requests";
import { membersFull } from "@agenteschat/client/lib/limits";
import { can } from "@agenteschat/client/lib/permissions";
import { playSound } from "@agenteschat/client/lib/sounds";
import { isEmail } from "@agenteschat/client/lib/text";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import {
  Avatar,
  Button,
  ChipField,
  type ChipFieldToken,
  Dialog,
  DialogBody,
  DialogFooter,
  Field,
  FormStack,
  Icon,
  type IconName,
  Input,
  Locked,
  overLimit,
  Segmented,
  Select,
  Textarea,
} from "@agenteschat/ui";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { OnlyYouNote } from "@/components/AgentAudience";
import { usePlanHold } from "@/components/ai/ConnectAiSteps";
import { BillingLinkButton } from "@/components/BillingLinkButton";
import { MembersFull } from "@/components/Limits";
import { useOrg } from "@/components/org-context";
import { InviteModeQuestion } from "@/components/WorkspaceModeDialog";
import { useDirectory } from "@/hooks/useDirectory";
import { useEdited } from "@/hooks/useEdited";
import { useTextLimit } from "@/hooks/useTextLimit";
import { useToast } from "@/lib/toast";
import { useCopied } from "./copied";
import { type ChipAddress, chipsFrom } from "./EmailChips";
import {
  AgentsField,
  agentsToSend,
  ChannelsField,
  channelsToSend,
  FieldLine,
  type RefusedAgent,
  type RefusedChannel,
  RoleField,
  rolesToSend,
  useInviteChoices,
} from "./InviteFields";
import "./invite.css";

/**
 * One screen invites (ADR 0090 §5 as revised by ADR 0184), from Members, Convites, the workspace menu, ⌘K, a channel's
 * "Adicionar pessoa ou agente", a cargo's "Convidar com este cargo" and the right hand's card: E-mail or Link on top,
 * then Para (e-mail only), Cargo, Canais and Agentes, each a field with its label and ⓘ on top. A link carries the same
 * choices, plus how long it works and how many people it takes; it still only asks to join.
 */

/**
 * What the dialog opens with: addresses already in it, a channel already chosen (inviting from a channel), a cargo
 * with its channels and agents (a cargo's "Convidar com este cargo", or "Convidar mais pessoas" after a send).
 */
export interface InviteRequest {
  emails?: string[];
  channelId?: string;
  roleIds?: string[];
  channelIds?: string[];
  agentIds?: string[];
  /** The lists are the whole choice (the last send's): a cargo's own channel or agent left out stays out. */
  exact?: boolean;
}

const InviteContext = createContext<{
  open: (request?: InviteRequest) => void;
  /**
   * Before something that invites without the dialog (Members' "Copy invitation link"): in a personal workspace, the
   * question of who is invited first (ADR 0159 §4); in a team's, `then` at once.
   */
  ask: (then: () => void) => void;
} | null>(null);

/** Null outside the workspace shell (a page rendered alone): nothing there opens the dialog. */
export const useInviteDialog = () => useContext(InviteContext);

/**
 * The workspace's invite dialog, for whoever may invite. Each opening starts over (`n`); it stays mounted while it
 * closes, so the focus goes back to what opened it. In a personal workspace each invitation first asks who it is for
 * (`InviteModeQuestion`): family keeps the workspace personal, work switches it to a team's first.
 */
export function InviteDialogProvider({ children }: { children: ReactNode }) {
  const { org } = useOrg();
  const [request, setRequest] = useState<(InviteRequest & { n: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  // What inviting was about to do, while the question waits for its answer.
  const after = useRef<(() => void) | null>(null);
  const personal = isPersonal(org);
  const show = useCallback((next: InviteRequest = {}) => {
    setRequest((current) => ({ ...next, n: (current?.n ?? 0) + 1 }));
    setOpen(true);
  }, []);
  const ask = useCallback(
    (then: () => void) => {
      if (!personal) {
        then();
        return;
      }
      after.current = then;
      setAsking(true);
    },
    [personal],
  );
  const value = useMemo(() => ({ open: (next?: InviteRequest) => ask(() => show(next)), ask }), [ask, show]);
  const answered = (go: boolean) => {
    const then = after.current;
    after.current = null;
    setAsking(false);
    if (go) then?.();
  };
  const invites = can(org, "invite_people");
  return (
    <InviteContext.Provider value={value}>
      {children}
      {request && invites && (
        <InviteDialog key={request.n} request={request} open={open} onClose={() => setOpen(false)} />
      )}
      {invites && <InviteModeQuestion open={asking} onClose={() => answered(false)} onGo={() => answered(true)} />}
    </InviteContext.Provider>
  );
}

/** Why the last send didn't go: no answer, or a channel, an agent or a cargo the sender may no longer give. */
type Failure =
  | { kind: "offline" }
  | { kind: "channel"; channel: RefusedChannel }
  | { kind: "agent"; agent: RefusedAgent }
  | { kind: "role" };

/** The server's refusal of a send, in the dialog's terms (`invitation.channel`, `invitation.agent`, a cargo's). */
function failureOf(error: unknown): Failure | null {
  if (noAnswer(error)) return { kind: "offline" };
  if (!(error instanceof ApiError)) return null;
  const p = error.params ?? {};
  const name = typeof p.name === "string" ? p.name : null;
  if (error.code === "invitation.channel" && typeof p.channelId === "string") {
    const why = p.why === "archived" || p.why === "left" ? p.why : "gone";
    return { kind: "channel", channel: { id: p.channelId, name, why } };
  }
  if (error.code === "invitation.agent" && typeof p.agentId === "string")
    return { kind: "agent", agent: { id: p.agentId, name, why: p.why === "locked" ? "locked" : "gone" } };
  if (error.code === "role.unknown" || error.code === "role.above_you" || error.code === "role.grant_forbidden")
    return { kind: "role" };
  return null;
}

function InviteDialog({ request, open, onClose }: { request: InviteRequest; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { org, me } = useOrg();
  const toast = useToast();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const dir = useDirectory(org.id);
  const again = useInviteDialog();
  const held = usePlanHold() !== null;
  // A server that sends no email invites through the link only.
  const byLink = !sendsEmail(useAuthConfig().data);
  const [how, setHow] = useState<"mail" | "link">("mail");
  const mode = byLink ? "link" : how;
  const invitations = useAllInvitations(org.id);
  const channels = useChannels(org.id).data ?? [];
  const full = membersFull(useWorkspaceLimits(org.id).data) !== null;
  const choices = useInviteChoices(
    {
      roleIds: request.roleIds ?? [],
      channelIds: [...new Set([...(request.channelId ? [request.channelId] : []), ...(request.channelIds ?? [])])],
      agentIds: request.agentIds ?? [],
    },
    { exact: request.exact },
  );
  const [chips, setChips] = useState<ChipAddress[]>(() => chipsFrom((request.emails ?? []).join(", "), []));
  const [draft, setDraft] = useState("");
  // Null: no note yet, only its button.
  const [note, setNote] = useState<string | null>(null);
  const noteLimit = useTextLimit(INVITE_NOTE_MAX);
  const noteTooLong = overLimit(note ?? "", noteLimit);
  const [failure, setFailure] = useState<Failure | null>(null);
  const emails = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const send = useMutation({
    mutationFn: (input: InviteBatch) => api.orgs.inviteMany(org.id, input),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(org.id) }),
  });
  // Link's: the workspace's link renewed as it opens, or a link of its own. Here, so it locks the whole dialog.
  const make = useMutation({
    mutationFn: (c: LinkChoices) => api.invites.createLink(org.id, c),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(org.id) }),
  });
  const pending = send.isPending || make.isPending;
  const unsaved = useEdited(open, [chips, draft, note]) || pending;

  // Who is in already, and who has an invitation waiting: said on their token and left out of the send.
  const members = new Set(dir.members.map((m) => m.email.toLowerCase()));
  const waiting = new Set(
    (invitations.data ?? []).filter((i) => i.status === "pending").map((i) => i.email.toLowerCase()),
  );
  const stateOf = (c: ChipAddress) =>
    !c.valid ? "bad" : members.has(c.email) ? "member" : waiting.has(c.email) ? "invited" : "ok";
  // What's typed and not a token yet counts, as leaving the field would make it one.
  const all = draft.trim() ? [...chips, ...chipsFrom(draft, chips)] : chips;
  const ready = all.filter((c) => stateOf(c) === "ok");
  const bad = all.some((c) => !c.valid);
  const leftOut = all.some((c) => stateOf(c) === "member" || stateOf(c) === "invited");

  // An agent's page opens over this dialog's place: the dialog closes for it.
  const goTo = (a: Agent) => {
    onClose();
    void navigate({
      to: "/org/$orgId/agents/$agentId",
      params: { orgId: org.id, agentId: a.id },
      search: { tab: "settings", sec: "audience" },
    });
  };

  const sendNow = async () => {
    if (all !== chips) {
      setChips(all);
      setDraft("");
    }
    if (ready.length === 0 || full || noteTooLong || send.isPending) return;
    setFailure(null);
    const sending = {
      roleIds: rolesToSend(choices),
      channelIds: channelsToSend(choices, channels),
      agentIds: agentsToSend(choices),
    };
    let results: BatchInviteResult[];
    try {
      results = await send.mutateAsync({
        emails: ready.map((c) => c.email),
        ...sending,
        ...(note?.trim() ? { note: note.trim() } : {}),
      });
    } catch (e) {
      const said = failureOf(e);
      if (said) setFailure(said);
      else toast.show(errorText(t, e), "error");
      return;
    }
    const sent = results.filter((r) => r.status === "invited");
    // An address the server reads as none stays, marked, to fix or take out; the rest went.
    const fix = new Set(results.filter((r) => r.status === "invalid_email").map((r) => r.email));
    const words =
      sent.length === 1
        ? t("members.dialog.sent", { email: sent[0]?.email })
        : t("members.dialog.sentMany", { count: sent.length });
    if (sent.length > 0) {
      playSound("approved");
      toast.show(words, "info", {
        label: t("members.dialog.again"),
        run: () => again?.open({ ...sending, exact: true }),
      });
    }
    if (fix.size > 0) {
      for (const email of fix) toast.show(t("members.batch.invalid_email", { email }), "error");
      setChips((list) =>
        list.filter((c) => !c.valid || fix.has(c.email)).map((c) => (fix.has(c.email) ? { ...c, valid: false } : c)),
      );
      return;
    }
    onClose();
  };

  // ⌘↵ (Ctrl+Enter) sends from anywhere in the form.
  const onKeys = (e: KeyboardEvent) => {
    if (mode !== "mail" || e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    void sendNow();
  };

  const tokens: ChipFieldToken[] = chips.map((c) => {
    const state = stateOf(c);
    return {
      key: c.email,
      label: c.email,
      leading: <Avatar name={c.email} initials={c.email.charAt(0).toUpperCase()} size="xs" />,
      removeLabel: t("common.removeName", { name: c.email }),
      state: state === "bad" ? "invalid" : state === "ok" ? undefined : "soft",
      note:
        state === "bad"
          ? t("members.chips.check")
          : state === "member"
            ? t(modeKey(org, "members.chips.member"), { org: org.name })
            : state === "invited"
              ? t("members.chips.invited")
              : undefined,
    };
  });

  if (held) {
    return (
      <Dialog
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={t(modeKey(org, "members.dialog.title"), { org: org.name })}
        closeLabel={t("common.close")}
        width={480}
      >
        <DialogBody>
          <p>{t("standing.billing.invites")}</p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{t("common.close")}</Button>
          {can(org, "manage_billing") && (
            <BillingLinkButton orgId={org.id} from="hold" variant="primary">
              {t("standing.billing.cta.payment")}
            </BillingLinkButton>
          )}
        </DialogFooter>
      </Dialog>
    );
  }

  const toLabel = t("invites.to");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t(modeKey(org, "members.dialog.title"), { org: org.name })}
      closeLabel={t("common.close")}
      unsaved={unsaved}
      width={600}
      initialFocus={mode === "mail" ? emails : undefined}
    >
      <Locked when={pending}>
        <DialogBody className="invite-dialog" onKeyDown={onKeys}>
          <FormStack>
            <MembersFull />
            <OnlyYouNote orgId={org.id} viewerId={me.user.id} />
            {!byLink && (
              <Segmented
                block
                label={t("invites.how")}
                value={mode}
                onValueChange={setHow}
                options={[
                  { value: "mail", label: t("invites.byEmail"), mark: <Icon name="mail" size={16} /> },
                  { value: "link", label: t("invites.byLink"), mark: <Icon name="link" size={16} /> },
                ]}
              />
            )}
            {mode === "mail" ? (
              <>
                <Field
                  label={toLabel}
                  id="invite-to"
                  hint={{ name: t("common.about", { label: toLabel }), text: t("members.dialog.pasteHelp") }}
                >
                  <ChipField
                    tokens={tokens}
                    inputRef={emails}
                    inputMode="email"
                    draft={draft}
                    onDraftChange={setDraft}
                    onCommit={(text) => setChips((list) => [...list, ...chipsFrom(text, list)])}
                    onRemove={(email) => setChips((list) => list.filter((c) => c.email !== email))}
                    placeholder={t("members.emailsPlaceholder")}
                    morePlaceholder={t("members.dialog.moreEmails")}
                    aria-describedby={bad || leftOut ? "invite-to-line" : undefined}
                  />
                  {bad ? (
                    <FieldLine id="invite-to-line" tone="danger">
                      {t("members.dialog.checkMarked")}
                    </FieldLine>
                  ) : (
                    leftOut && <FieldLine id="invite-to-line">{t("members.dialog.leftOut")}</FieldLine>
                  )}
                </Field>
                <RoleField choices={choices} id="invite-role" />
                <ChannelsField
                  choices={choices}
                  id="invite-channels"
                  fromChannelId={request.channelId}
                  refused={failure?.kind === "channel" ? failure.channel : null}
                />
                <AgentsField
                  choices={choices}
                  id="invite-agents"
                  live={open}
                  refused={failure?.kind === "agent" ? failure.agent : null}
                  onGo={goTo}
                />
                {failure?.kind === "role" && (
                  <FieldLine tone="danger">
                    {choices.roleIds.length === 1
                      ? t("invites.refused.role", {
                          role: choices.roles.find((r) => r.id === choices.roleIds[0])?.name ?? "",
                        })
                      : t("invites.refused.roleMany")}
                  </FieldLine>
                )}
                {note === null ? (
                  <div className="invite-extra">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="plus"
                      onClick={() => {
                        setNote("");
                        requestAnimationFrame(() => noteField.current?.focus());
                      }}
                    >
                      {t("members.dialog.note")}
                    </Button>
                  </div>
                ) : (
                  <Field label={t("members.dialog.note")} id="invite-note">
                    <Textarea
                      ref={noteField}
                      autoGrow
                      rows={2}
                      className="invite-note"
                      limit={noteLimit}
                      value={note}
                      placeholder={t(modeKey(org, "members.dialog.notePlaceholder"), { org: org.name })}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                )}
                {failure?.kind === "offline" && <FieldLine tone="danger">{t("invites.offline")}</FieldLine>}
              </>
            ) : (
              <LinkForm make={make} choices={choices} fromChannelId={request.channelId} live={open} onGo={goTo} />
            )}
          </FormStack>
        </DialogBody>
        <DialogFooter bar>
          {mode === "mail" ? (
            <>
              <Button onClick={onClose}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                icon={failure?.kind === "offline" ? "refresh" : "send"}
                disabled={ready.length === 0 || full || noteTooLong}
                loading={send.isPending}
                onClick={() => void sendNow()}
              >
                {failure?.kind === "offline"
                  ? t("common.retry")
                  : ready.length
                    ? t("members.dialog.send", { count: ready.length })
                    : t("members.invite")}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t("members.dialog.finish")}</Button>
          )}
        </DialogFooter>
      </Locked>
    </Dialog>
  );
}

/** A made link as the field shows it, with the choices it was made from. */
interface Made {
  choices: LinkChoices;
  link: InviteLinkMade;
}

/**
 * Link: the address to copy, until when it works, then the same fields as by e-mail, and Validade and Máximo de
 * pessoas. At the defaults the field shows the workspace's link at once, renewed to 30 days as it opens here. Any other
 * choice empties the field until "Criar link" makes a link of its own; a live link changes only from Editar. `make`:
 * the dialog's, which locks it all while it runs.
 */
function LinkForm({
  make,
  choices,
  fromChannelId,
  live,
  onGo,
}: {
  make: UseMutationResult<InviteLinkMade, Error, LinkChoices>;
  choices: ReturnType<typeof useInviteChoices>;
  fromChannelId?: string;
  live: boolean;
  onGo: (agent: Agent) => void;
}) {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const channels = useChannels(org.id).data ?? [];
  const [expiresIn, setExpiresIn] = useState<LinkChoices["expiresIn"]>(INVITE_LINK_TTL);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [workspace, setWorkspace] = useState<InviteLinkMade | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, copy] = useCopied();
  const now: LinkChoices = {
    roleIds: rolesToSend(choices),
    channelIds: channelsToSend(choices, channels),
    agentIds: agentsToSend(choices),
    expiresIn,
    maxUses,
  };
  const plain = plainLink(now);
  const { mutate } = make;
  // The workspace's own link, renewed to 30 days once as Link opens at the defaults, so "Vale até" says the truth.
  const asked = useRef(false);
  useEffect(() => {
    if (!plain || asked.current) return;
    asked.current = true;
    mutate(
      { roleIds: [], channelIds: [], agentIds: [], expiresIn: INVITE_LINK_TTL, maxUses: null },
      { onSuccess: setWorkspace, onError: (e) => setError(errorText(t, e)) },
    );
  }, [plain, mutate, t]);
  const shown = plain ? workspace : made && sameChoices(made.choices, now) ? made.link : null;
  const create = () => {
    setError(null);
    const c = now;
    make.mutate(c, { onSuccess: (link) => setMade({ choices: c, link }), onError: (e) => setError(errorText(t, e)) });
  };
  const ttlWords = (ttl: LinkChoices["expiresIn"]) => t(`invites.ttl.${ttl}`);
  const until = shown
    ? shown.neverExpires
      ? t("invites.never")
      : t("members.link.until", { date: formatShortDate(i18n.language, shown.expiresAt) })
    : expiresIn === "never"
      ? t("invites.never")
      : t("invites.validFor", { ttl: ttlWords(expiresIn) });
  const linkLabel = t("invites.link");
  // One button in one place: Copiar link, Copiado and Criar link stacked in one cell, the widest sizing it.
  const button: { icon: IconName; key: "copy" | "copied" | "make" } = !shown
    ? { icon: "plus", key: "make" }
    : copied === shown.id
      ? { icon: "check", key: "copied" }
      : { icon: "copy", key: "copy" };
  const words = { copy: t("members.copyLink"), copied: t("common.copied"), make: t("members.link.make") };
  return (
    <>
      <Field
        label={linkLabel}
        id="invite-link"
        hint={{ name: t("common.about", { label: linkLabel }), text: t("members.dialog.orLink.text") }}
      >
        <div className="invite-linkrow">
          <Input
            readOnly
            value={shown?.url ?? ""}
            placeholder={t("invites.linkEmpty")}
            data-empty={!shown || undefined}
            onFocus={(e) => e.currentTarget.select()}
            aria-describedby="invite-link-until"
          />
          <Button
            variant={shown ? "default" : "primary"}
            loading={make.isPending}
            disabled={plain && !shown}
            onClick={() => (shown ? copy(shown.id, shown.url) : create())}
          >
            <span className="ac-swap">
              {(["copy", "copied", "make"] as const).map((k) => (
                <span key={k} aria-hidden={k !== button.key || undefined}>
                  <Icon name={k === "copy" ? "copy" : k === "copied" ? "check" : "plus"} />
                  {words[k]}
                </span>
              ))}
            </span>
          </Button>
        </div>
        {error ? (
          <FieldLine tone="danger">{t("invites.linkFailed", { cause: error })}</FieldLine>
        ) : (
          <FieldLine id="invite-link-until" icon="clock">
            {until}
          </FieldLine>
        )}
      </Field>
      <RoleField choices={choices} id="invite-link-role" />
      <ChannelsField choices={choices} id="invite-link-channels" fromChannelId={fromChannelId} />
      <AgentsField choices={choices} id="invite-link-agents" live={live} onGo={onGo} />
      <LinkLimits
        expiresIn={expiresIn}
        onExpiresIn={(v) => v !== "keep" && setExpiresIn(v)}
        maxUses={maxUses}
        onMaxUses={setMaxUses}
      />
    </>
  );
}

/** "Sem limite" in a select: no value of its own. */
const NO_LIMIT = "none";

/**
 * Validade and Máximo de pessoas side by side, one height and one right edge. `first`: Editar link's own option before
 * the list, the link as it is ("Até 13 de dez."); `used`: how many the link took, the maximums under it off.
 */
export function LinkLimits({
  expiresIn,
  onExpiresIn,
  maxUses,
  onMaxUses,
  first,
  used,
}: {
  expiresIn: LinkChoices["expiresIn"] | "keep";
  onExpiresIn: (ttl: LinkChoices["expiresIn"] | "keep") => void;
  maxUses: number | null;
  onMaxUses: (max: number | null) => void;
  first?: string;
  used?: number;
}) {
  const { t } = useTranslation();
  const ttls = [
    ...(first ? [{ value: "keep" as const, label: first }] : []),
    ...INVITE_LINK_TTLS.map((v) => ({ value: v, label: t(`invites.ttl.${v}`) })),
  ];
  const maxes = INVITE_LINK_MAX_USES.map((m) => ({
    value: m === null ? NO_LIMIT : String(m),
    label: m === null ? t("invites.noLimit") : t("invites.people", { count: m }),
    disabled: m !== null && used !== undefined && m < used,
  }));
  return (
    <div className="invite-pair">
      <Field label={t("invites.expiresIn")} id="invite-link-ttl">
        <Select value={expiresIn} options={ttls} onValueChange={onExpiresIn} />
      </Field>
      <Field
        label={t("invites.maxUses")}
        id="invite-link-max"
        example={used ? t("invites.usedSoFar", { count: used }) : undefined}
      >
        <Select
          value={maxUses === null ? NO_LIMIT : String(maxUses)}
          options={maxes}
          onValueChange={(v) => onMaxUses(v === NO_LIMIT ? null : Number(v))}
        />
      </Field>
    </div>
  );
}

/**
 * A channel's "Adicionar pessoa ou agente" search typed with an address nobody here has: whoever may invite gets a
 * row that invites them (by email, so only where the server sends it). Null otherwise.
 */
export function useInviteOffer(query: string): string | null {
  const { org } = useOrg();
  const dir = useDirectory(org.id);
  const invite = useInviteDialog();
  const emails = sendsEmail(useAuthConfig().data);
  const typed = query.trim().toLowerCase();
  if (!invite || !emails || !can(org, "invite_people") || !isEmail(typed)) return null;
  return dir.members.some((m) => m.email.toLowerCase() === typed) ? null : typed;
}

/** The row `useInviteOffer` offers: the dialog opens with that address and that channel chosen. */
export function InviteOfferRow({ email, channel, onPick }: { email: string; channel: Channel; onPick: () => void }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const invite = useInviteDialog();
  return (
    <button
      type="button"
      className="member-row member-row--add"
      onClick={() => {
        onPick();
        invite?.open({ emails: [email], channelId: channel.id });
      }}
    >
      <span className="member-row__plus" aria-hidden="true">
        <Icon name="mail" />
      </span>
      {channel.name === "general"
        ? t(modeKey(org, "channelMembers.inviteOrg"), { email, org: org.name })
        : t(modeKey(org, "channelMembers.invite"), { email, org: org.name, channel: channel.name })}
    </button>
  );
}
