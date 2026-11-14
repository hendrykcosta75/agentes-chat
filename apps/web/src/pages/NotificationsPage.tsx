import type { Agent, AppNotification, Member, NotificationActor, NotificationFilter } from "@agenteschat/client";
import {
  dropNotification,
  keys,
  useAiStatus,
  useApi,
  useApproval,
  useApprovals,
  useChannels,
  useNotificationAction,
  useNotificationCount,
  useNotificationReply,
  useNotifications,
  useTaskConversation,
  useThreadMessages,
} from "@agenteschat/client";
import { approvalCardItems } from "@agenteschat/client/lib/approval-card";
import { approvalOriginWords } from "@agenteschat/client/lib/approval-origin";
import { appCreatedLine } from "@agenteschat/client/lib/apps";
import { deviceNoticeOf } from "@agenteschat/client/lib/devices";
import { errorText, restrictionLine } from "@agenteschat/client/lib/errors";
import { daysBetween, formatShortDate, formatTime, namesText, timeLeft } from "@agenteschat/client/lib/format";
import { agentGrammar, isFeminineName } from "@agenteschat/client/lib/grammar";
import { plainLine } from "@agenteschat/client/lib/markdown";
import { mediaKindOf, mediaWord, messageMediaOf, textOrMedia } from "@agenteschat/client/lib/media";
import { latestText } from "@agenteschat/client/lib/message-body";
import {
  allItems,
  askersOf,
  channelOf,
  groupByDay,
  headlineNames,
  isExpandable,
  MENTION_RE,
  NOTIFICATION_FILTERS,
  opensConnectAi,
  replyTarget,
  restrictionOf,
  runFailedGroupOf,
  snoozeTimes,
  sortWaiting,
  stepCells,
  teamWatchOf,
  WIDGET_NOTICES,
  widgetNoticeOf,
  workspaceHeadline,
} from "@agenteschat/client/lib/notifications";
import { usageLimitLine } from "@agenteschat/client/lib/person-usage";
import { routineNotificationWords } from "@agenteschat/client/lib/routine-view";
import { secretNoticeLine } from "@agenteschat/client/lib/secret-requests";
import {
  Button,
  Chip,
  cx,
  EmptyState,
  ExpiryFuse,
  GroupHeading,
  Icon,
  type IconName,
  Kbd,
  Locked,
  Mention,
  Menu,
  MenuHeading,
  MenuItem,
  modKey,
  PageHeader,
  PlanStrip,
  prefersReducedMotion,
  Segmented,
  Spinner,
} from "@agenteschat/ui";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AdminAskActions } from "@/components/AdminAsk";
import { ApprovalAsk, ApprovalGroupAsk } from "@/components/ApprovalAsk";
import { useConnectAi } from "@/components/ConnectAi";
import { DeviceNoticeActions, deviceNoticeLine } from "@/components/devices/DeviceNotice";
import { ErrorState, LoadingCards } from "@/components/Loading";
import { useNotificationHref, useNotificationOpener } from "@/components/NotificationOpen";
import { type Dir, Face, Headline, joinerOf, nameOf, SystemFace, sayWords } from "@/components/NotificationParts";
import { useOrg } from "@/components/org-context";
import { UsageLimitActions } from "@/components/PeopleUsage";
import { AllowTalkButton } from "@/components/ReachLines";
import { RequestCard, RequestChoices, RequestKeys } from "@/components/RequestCard";
import { ChangeRequestCard } from "@/components/RightHandCards";
import { colorOf, prepareBurst } from "@/components/Sky";
import { WidgetNoticeActions, widgetNoticeLine } from "@/components/widgets/WidgetNotice";
import { useDirectory } from "@/hooks/useDirectory";
import { matchesNow } from "@/hooks/useMatchMedia";
import { lookOf } from "@/lib/look";
import { useToast } from "@/lib/toast";
import { useLiveStore } from "@/realtime/context";
import "./notifications.css";

const TTL_MS = 24 * 3_600_000;
/** Where an item's actions are a row under it, shown by a tap (notifications.css). */
const NARROW = "(max-width: 720px)";

/** An agent stopped this long on my answer is late (the chip turns to attention). */
const LATE_MS = 20 * 60_000;
/** An approval this close to expiring is urgent. */
const URGENT_MS = 3 * 3_600_000;
/** The exit: slide out, then fold the space (approvals use the same timing). */
const LEAVE_MS = 450;

type SnoozeChoice = "hour" | "tomorrow" | "nextWeek";

/** "agora", "há 25 min", "há 2 h", "ontem 18:02", "sex 14:20", "12 out". */
function whenText(t: TFunction, locale: string, iso: string, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return t("common.now");
  if (diff < 3_600_000) return t("format.minutesAgo", { count: Math.floor(diff / 60_000) });
  const days = daysBetween(iso, now);
  if (days <= 0) return t("format.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  if (days === 1) return t("format.yesterdayAt", { time: formatTime(locale, iso) });
  if (days < 7)
    return `${new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(iso))} ${formatTime(locale, iso)}`;
  return formatShortDate(locale, iso);
}

/** "25 min", "2 h" (how long something has waited). */
function durationText(t: TFunction, ms: number) {
  if (ms < 3_600_000) return t("format.inMinutes", { count: Math.max(1, Math.floor(ms / 60_000)) });
  if (ms < 2 * 86_400_000) return t("format.inHours", { count: Math.floor(ms / 3_600_000) });
  return t("format.inDays", { count: Math.floor(ms / 86_400_000) });
}

/** A snippet with @mentions: mine highlighted, the workspace's others in bold, anyone else's as typed. */
function Snippet({ text, mine }: { text: string; mine: string | null }) {
  const { org } = useOrg();
  const dir = useDirectory(org.id);
  const parts = text.split(MENTION_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          mine && p.slice(1).toLowerCase() === mine.toLowerCase() ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional pieces of one text
            <Mention key={i}>{p}</Mention>
          ) : dir.mentionName(p.slice(1)) ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional pieces of one text
            <b key={i}>{p}</b>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional pieces of one text
            <Fragment key={i}>{p}</Fragment>
          )
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional pieces of one text
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Where it happened, its icon and words, unless the headline says it. */
function sourceOf(t: TFunction, n: AppNotification, channelName: (id: string) => string): [IconName, string] | null {
  const s = n.source;
  const channel = channelOf(n);
  // Agents failing in many conversations: each says its own when the row opens. Several skipped catch-ups open
  // the agent's queue, which lists where each was.
  if (runFailedGroupOf(n) || (n.kind === "catch_up_closed" && n.count > 1)) return null;
  let icon: IconName = "channel";
  let label = "";
  const device = deviceNoticeOf(n);
  if (device) [icon, label] = [device.phoneId ? "phone" : "computer", t("devices.notice.source")];
  else if (WIDGET_NOTICES.has(n.kind)) [icon, label] = ["grid", t("notifications.source.dashboard")];
  else if (n.kind === "approval") [icon, label] = ["shield", t("notifications.source.approval")];
  else if (n.kind === "approval_cover" || n.kind === "right_hand_paused")
    [icon, label] = ["approve", t("settings.section.approvals")];
  // A request opens People › Convites, where it is answered (ADR 0184); someone who joined, Members.
  else if (n.kind === "join_request") [icon, label] = ["mail", t("settings.section.invites")];
  else if (n.kind === "invitation_accepted") [icon, label] = ["members", t("notifications.source.members")];
  else if (n.kind === "composio_limit") [icon, label] = ["wallet", t("notifications.source.usage")];
  else if (n.kind === "skill_update") [icon, label] = ["book", t("skills.title")];
  else if (
    n.kind === "machine_connected" ||
    n.kind === "computer_ready" ||
    n.kind === "computer_disk_full" ||
    n.kind === "computer_no_chrome" ||
    n.kind === "desktop_taken" ||
    (n.kind === "browser_handoff" && s.screen === "desktop")
  )
    [icon, label] = ["computer", t("notifications.source.machine")];
  else if (n.kind === "team_watch") {
    // Where it is fixed: the plans, the agent's budget, the computers, the connections.
    const cause = teamWatchOf(n)?.cause;
    if (cause === "sign_in" || cause === "budget_out" || cause === "budget_low")
      [icon, label] = ["bulb", t("settings.section.usage")];
    else if (cause === "computer") [icon, label] = ["computer", t("notifications.source.machine")];
    else if (cause) [icon, label] = ["plug", t("settings.section.connectors")];
  } else if (n.kind === "plan_lent" || n.kind === "plan_serves") [icon, label] = ["bulb", t("settings.section.usage")];
  else if (n.kind === "plan_model_dropped") [icon, label] = ["bulb", t("brain.title")];
  else if (n.kind === "browser_handoff") [icon, label] = ["globe", t("notifications.source.browser")];
  else if (s.issueNumber != null)
    [icon, label] = ["issues", t("notifications.source.issue", { number: s.issueNumber })];
  else if (n.kind === "mission_finished" || n.kind === "mission_stopped")
    [icon, label] = ["flag", t("notifications.source.mission")];
  else if (n.kind.startsWith("routine_")) [icon, label] = ["routines", t("notifications.source.routine")];
  else if (n.kind === "dm" || s.dmId) [icon, label] = ["person", t("notifications.source.dm")];
  else if (s.threadId) {
    const name = channel ? channelName(channel) : "";
    [icon, label] = [
      "thread",
      name && !headlineNames(n, name)
        ? t("notifications.source.thread", { channel: name })
        : t("notifications.source.threadOnly"),
    ];
  } else if (channel && !headlineNames(n, channelName(channel)))
    [icon, label] = ["channel", t("notifications.source.channel", { name: channelName(channel) })];
  return label ? [icon, label] : null;
}

/** Where it happened, as a chip, unless the headline says it. */
function SourceChip({
  n,
  channelName,
  className,
}: {
  n: AppNotification;
  channelName: (id: string) => string;
  className?: string;
}) {
  const { t } = useTranslation();
  const source = sourceOf(t, n, channelName);
  if (!source) return null;
  const channel = channelOf(n);
  return (
    <Chip icon={source[0]} className={className}>
      {/* The channel's icon is its #: the words show its bare name, a screen reader still hears the #. */}
      {source[0] === "channel" && channel ? (
        <>
          <span className="ac-visually-hidden">#</span>
          {channelName(channel)}
        </>
      ) : (
        source[1]
      )}
    </Chip>
  );
}

/** How long is left to answer, as a chip that turns to attention in the last hours. */
function LeftChip({ n, className }: { n: AppNotification; className?: string }) {
  const { t } = useTranslation();
  const at = n.latest.expiresAt;
  const left = at ? timeLeft(t, at) : null;
  if (!at || !left) return null;
  const urgent = new Date(at).getTime() - Date.now() <= URGENT_MS;
  return (
    <Chip icon="clock" tone={urgent ? "waiting" : "neutral"} className={className}>
      {urgent ? t("approvals.leftUrgent", { time: left }) : t("approvals.left", { time: left })}
    </Chip>
  );
}

/** Issue statuses in the app's words (the raw value when unknown). */
const ISSUE_STATUSES = ["todo", "in_progress", "in_review", "done", "canceled"] as const;
function statusName(t: TFunction, value: string | undefined) {
  if (!value) return "";
  const known = ISSUE_STATUSES.find((s) => s === value);
  return known ? t(`issues.status.${known}`) : value;
}

/** The composer's placeholder: who or where the answer goes. */
function placeholderFor(t: TFunction, n: AppNotification, dir: Dir, channelName: (id: string) => string) {
  const target = replyTarget(n);
  if (!target) return t("notifications.composer.reply");
  if (target.kind === "issue")
    return n.source.issueNumber != null
      ? t("notifications.composer.issue", { number: n.source.issueNumber })
      : t("notifications.composer.issueNoNumber");
  if (target.kind === "question" || n.kind === "dm") {
    const name = nameOf(t, dir, n.actors[0]);
    return t("notifications.composer.replyTo", { context: agentGrammar(name).context, name });
  }
  if (target.threadId) return t("notifications.composer.thread");
  const channel = channelName(target.channelId);
  return channel ? t("notifications.composer.channel", { channel }) : t("notifications.composer.reply");
}

/**
 * The mini composer, opened in place (⌘↵ sends, esc closes). While the workspace is being deleted it says why it takes
 * nothing, with Cancel (ADR 0088 §7).
 */
function Composer({
  id,
  placeholder,
  draft,
  sending,
  onDraft,
  onSend,
  onCancel,
}: {
  id: string;
  placeholder: string;
  draft: string;
  sending: boolean;
  onDraft: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const deleting = Boolean(useOrg().org.deletion);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);
  // Grows with the text up to 180px.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure when the text changes
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(180, ta.scrollHeight)}px`;
  }, [draft]);
  if (deleting)
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: clicks inside the composer stay out of the row
      <div className="nt-cmp" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <p className="nt-cmp__readonly ac-iconline" role="status">
          <Icon name="lock" size={16} />
          <span>{t("deleting.composer")}</span>
        </p>
        <div className="nt-cmp__row">
          <span className="nt-grow" />
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("notifications.composer.cancel")}
          </Button>
        </div>
      </div>
    );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicks inside the composer stay out of the row
    <div className="nt-cmp" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Locked when={sending}>
        <textarea
          id={`nt-ta-${id}`}
          ref={ref}
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="nt-cmp__row">
          <span className="nt-cmp__hint">
            <Kbd>{modKey()}</Kbd>
            <Kbd>↵</Kbd> {t("notifications.composer.sends")} · <Kbd>{t("notifications.composer.escKey")}</Kbd>{" "}
            {t("notifications.composer.closes")}
          </span>
          <span className="nt-grow" />
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("notifications.composer.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="arrowUp"
            loading={sending}
            disabled={!draft.trim()}
            onClick={onSend}
          >
            {t("notifications.composer.send")}
          </Button>
        </div>
      </Locked>
    </div>
  );
}

/** "Lembrar depois": in 1 hour, tomorrow at 9, next week (local time). */
function SnoozeMenu({ trigger, onPick }: { trigger: ReactNode; onPick: (choice: SnoozeChoice) => void }) {
  const { t, i18n } = useTranslation();
  const times = snoozeTimes();
  const day = (d: Date) => new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(d);
  return (
    <Menu trigger={trigger} align="end" label={t("notifications.snooze")}>
      <MenuHeading>{t("notifications.snoozeMenu.heading")}</MenuHeading>
      <MenuItem icon="clock" hint={formatTime(i18n.language, times.hour.toISOString())} onSelect={() => onPick("hour")}>
        {t("notifications.snoozeMenu.hour")}
      </MenuItem>
      <MenuItem icon="calendar" hint={day(times.tomorrow)} onSelect={() => onPick("tomorrow")}>
        {t("notifications.snoozeMenu.tomorrow")}
      </MenuItem>
      <MenuItem
        icon="calendar"
        hint={`${day(times.nextWeek)} ${formatTime(i18n.language, times.nextWeek.toISOString())}`}
        onSelect={() => onPick("nextWeek")}
      >
        {t("notifications.snoozeMenu.nextWeek")}
      </MenuItem>
    </Menu>
  );
}

/** The replies of a grouped thread item (from the thread itself, or `at`: another thread). */
function ThreadReplies({
  n,
  dir,
  mine,
  at,
}: {
  n: AppNotification;
  dir: Dir;
  mine: string | null;
  at?: { channelId: string; rootId: string };
}) {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const rootId = at ? at.rootId : (n.source.threadId ?? "");
  const thread = useThreadMessages(org.id, at ? at.channelId : (channelOf(n) ?? undefined), rootId);
  // The root the channel holds stands in until the replies are read: they are what this shows.
  if (thread.isPending || thread.isPlaceholderData) return <LoadingCards count={1} className="nt-reps" />;
  // Replies with words or a GIF or a sticker (cards like an approval or a question have none of their own).
  const replies = (thread.data ?? [])
    .filter((m) => m.id !== rootId && !m.local && (m.body.trim() || messageMediaOf(m.meta)))
    .slice(-n.count);
  return (
    <div className="nt-reps">
      {replies.map((m) => {
        const actor: NotificationActor = { type: m.author.type === "agent" ? "agent" : "user", id: m.author.id ?? "" };
        return (
          <div key={m.id} className="nt-rep">
            <Face actor={actor} dir={dir} size="sm" className="nt-av22" />
            <div>
              <div className="nt-rep__head">
                <b>{dir.authorName(m.author)}</b>
                <small>{whenText(t, i18n.language, m.createdAt)}</small>
              </div>
              <p>
                <Snippet text={plainLine(textOrMedia(t, m.body, m.meta))} mine={mine} />
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The agents of a shared failure row, each opening the conversation where it couldn't go on. */
function RunFailures({ n, dir, channelName }: { n: AppNotification; dir: Dir; channelName: (id: string) => string }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const openNotification = useNotificationOpener();
  return (
    <ul className="nt-reps nt-fails">
      {(runFailedGroupOf(n)?.failures ?? []).map(({ key, ...source }) => {
        const place = channelName(source.channelId) || source.label;
        return (
          <li key={key}>
            <button
              type="button"
              className="nt-rep"
              onClick={(e) => {
                e.stopPropagation();
                openNotification({ ...n, source, latest: {} }, org.id);
              }}
            >
              <Face actor={{ type: "agent", id: source.agentId }} dir={dir} size="sm" className="nt-av22" />
              <span className="nt-rep__head">
                <b>{nameOf(t, dir, { type: "agent", id: source.agentId })}</b>
                {place && <small>{t("notifications.source.channel", { name: place })}</small>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The comments of a grouped issue item: the replies in the task's conversation (ADR 0145). */
function IssueComments({ n, dir, mine }: { n: AppNotification; dir: Dir; mine: string | null }) {
  const { org } = useOrg();
  const issueId = n.source.issueId ?? "";
  const at = useTaskConversation(org.id, { id: issueId, conversation: null }, Boolean(issueId));
  if (!at) return <LoadingCards count={1} className="nt-reps" />;
  return <ThreadReplies n={n} dir={dir} mine={mine} at={at} />;
}

interface RowHandlers {
  onSelect: (n: AppNotification) => void;
  onReply: (n: AppNotification) => void;
  onDone: (n: AppNotification) => void;
  onSnooze: (n: AppNotification, choice: SnoozeChoice) => void;
  onOpen: (n: AppNotification) => void;
  /** In a new tab (Cmd/Ctrl-click, a middle click, Cmd/Ctrl+Enter). */
  onOpenNew: (n: AppNotification) => void;
  onToggle: (n: AppNotification) => void;
  onSend: (n: AppNotification, text: string, choice?: boolean) => void;
  onCancel: () => void;
  onDraft: (n: AppNotification, text: string) => void;
}

interface RowState {
  cur: boolean;
  open: boolean;
  replying: boolean;
  sending: boolean;
  draft: string;
  replied?: string;
  fresh: boolean;
  pulse: boolean;
  leaving: boolean;
}

/**
 * A click on an item, outside its own buttons, links and composer, opens where it happened: Cmd/Ctrl-click and a
 * middle click in a new tab. Selecting its text is not a click. React bubbles clicks from portals (the Remind menu).
 */
function clickRow(e: MouseEvent<HTMLElement>, n: AppNotification, h: RowHandlers, open = h.onSelect) {
  const target = e.target as Element;
  if (!e.currentTarget.contains(target) || target.closest("button, a, textarea, input, .nt-cmp")) return;
  if (window.getSelection()?.type === "Range") return;
  if (e.button === 1 || (e.button === 0 && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    h.onOpenNew(n);
  } else if (e.button === 0) open(n);
}

/** The inline actions: a small floating bar on desktop (hover / focus), a row on phones (tap). */
function RowActions({ n, h }: { n: AppNotification; h: RowHandlers }) {
  const { t } = useTranslation();
  const act = (key: string, icon: IconName, label: string, tip: string, short: string, run?: () => void) => (
    <button
      type="button"
      className="nt-nb"
      data-act={key}
      title={tip}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        run?.();
      }}
    >
      <Icon name={icon} size={16} />
      <span className="nt-nb__label">{short}</span>
    </button>
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a small toolbar of actions
    <div className="nt-acts" role="group" aria-label={t("notifications.actions")}>
      {replyTarget(n) &&
        act("reply", "reply", t("notifications.reply"), t("notifications.replyTip"), t("notifications.reply"), () =>
          h.onReply(n),
        )}
      {n.doneAt
        ? act(
            "done",
            "undo",
            t("notifications.restore"),
            t("notifications.restoreTip"),
            t("notifications.restore"),
            () => h.onDone(n),
          )
        : act("done", "check", t("notifications.done"), t("notifications.doneTip"), t("notifications.done"), () =>
            h.onDone(n),
          )}
      {!n.doneAt && (
        <SnoozeMenu
          onPick={(c) => h.onSnooze(n, c)}
          trigger={act(
            "snooze",
            "clock",
            t("notifications.snooze"),
            t("notifications.snooze"),
            t("notifications.snoozeShort"),
          )}
        />
      )}
      {act("open", "external", t("notifications.open"), t("notifications.openTip"), t("notifications.open"), () =>
        h.onOpen(n),
      )}
    </div>
  );
}

/** `agent_unreached`: let the routine's creator talk to the agent, from the inbox (its report may be out of reach). */
function UnreachedAllow({ agentId, userId }: { agentId: string; userId: string }) {
  const { org } = useOrg();
  const agent = useDirectory(org.id).agentById.get(agentId);
  if (!agent) return null;
  return (
    <div className="nt-steprow">
      <AllowTalkButton agent={agent} userId={userId} className="ag-rc__btn" />
    </div>
  );
}

/** "Mudar para Só eu" on `plan_serves`: the person's plan serves only them again (ADR 0059 §3). */
function PlanOnlyMe({ n }: { n: AppNotification }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const accountId = n.source.accountId;
  if (!accountId || n.doneAt) return null;
  const onlyMe = async () => {
    setBusy(true);
    try {
      await api.machines.setAccountServes(org.id, accountId, "owner");
      toast.show(t("notifications.planServes.done"), "success");
      for (const key of [keys.aiAccounts(org.id), keys.planUsage(org.id), keys.agents(org.id), keys.aiStatus(org.id)])
        void qc.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.show(errorText(t, error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="nt-steprow">
      <Button size="sm" loading={busy} onClick={() => void onlyMe()}>
        {t("notifications.planServes.onlyMe")}
      </Button>
    </div>
  );
}

/** "Tirar de volta" on `plan_lent`: the person's plan leaves that agent, or every agent someone else gave it to. */
function PlanTakeBack({ n }: { n: AppNotification }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const accountId = n.source.accountId;
  if (!accountId || n.doneAt) return null;
  const take = async (agentId?: string) => {
    setBusy(true);
    try {
      await api.machines.takeBackPlan(org.id, accountId, agentId);
      toast.show(t("notifications.planLent.done"), "success");
      for (const key of [keys.aiAccounts(org.id), keys.agents(org.id), keys.aiStatus(org.id)])
        void qc.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.show(errorText(t, error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="nt-steprow">
      <Button size="sm" loading={busy} onClick={() => void take(n.source.agentId)}>
        {t("notifications.planLent.takeBack")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void take()}>
        {t("notifications.planLent.takeBackAll")}
      </Button>
    </div>
  );
}

/** One item in a day group. */
function Row({
  n,
  s,
  h,
  dir,
  mine,
  channelName,
}: {
  n: AppNotification;
  s: RowState;
  h: RowHandlers;
  dir: Dir;
  mine: string | null;
  channelName: (id: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const unread = n.readAt === null;
  const first = n.actors[0];
  // Someone who just joined may not be in the members list yet: the notice names them (ADR 0090).
  const joiner = n.kind === "invitation_accepted" ? joinerOf(t, dir, n) : undefined;
  const name = joiner ?? nameOf(t, dir, first);
  const own = workspaceHeadline(n);
  const label = own ? t(own, { name: n.source.label }) : n.kind === "app_created" ? appCreatedLine(t, n) : name;
  const reaction = n.kind === "reaction";
  const group = n.actors.length > 1;
  const other = n.actors.find((a, i) => i > 0 && (a.id !== first?.id || a.type !== first?.type));
  const face = reaction ? (
    <span className="nt-emo" aria-hidden="true">
      {(n.latest.emojis ?? []).slice(-2).map((e) => (
        <span key={e}>{e}</span>
      ))}
    </span>
  ) : group ? (
    <span className="nt-stk">
      <Face actor={first} dir={dir} size="sm" className="nt-av20" />
      <Face actor={other} dir={dir} size="sm" className="nt-av17" />
    </span>
  ) : first ? (
    <Face actor={first} dir={dir} className="nt-av24" name={joiner} />
  ) : (
    <SystemFace n={n} />
  );
  const l = n.latest;
  // Asked while nobody watched (ADR 0053 §8): who asked leads an approval's line, its why follows.
  const origin = n.kind === "approval" ? approvalOriginWords({ origin: l.origin }) : null;
  const lead =
    n.source.issueNumber != null && l.title && (n.kind === "issue_assigned" || n.kind === "issue_status")
      ? `#${n.source.issueNumber} ${l.title}`
      : (n.kind === "mission_finished" ||
            n.kind === "mission_stopped" ||
            n.kind.startsWith("routine_") ||
            n.kind === "agent_unreached") &&
          n.source.label
        ? n.source.label
        : origin
          ? sayWords(t, origin)
          : null;
  const speaker = n.count > 1 && (n.kind === "thread_reply" || n.kind === "issue_comment") ? name : null;
  const expandable = isExpandable(n);
  const steps = l.steps && l.steps.total > 0 ? l.steps : null;
  const failed =
    n.kind === "mission_stopped" || n.kind === "routine_failed" || n.kind === "run_failed" || l.steps?.failedAt != null;
  // A routine's trouble says why in the person's language (`latest.reason`): a pause its reason, a failed
  // run what went wrong (never the server's English).
  const why = routineNotificationWords(n);
  const restriction = restrictionOf(n);
  // A board's notice says what the agent saw, why the widget stopped, or whom it would show the board to (ADR 0135).
  const widgetLine = widgetNoticeLine(t, n, dir);
  // A GIF or a sticker has no words: its word stands for it (ADR 0091).
  const media = mediaKindOf(l.media);
  const text = restriction
    ? restrictionLine(t, restriction.code, restriction.facts)
    : n.kind === "usage_limit"
      ? usageLimitLine(t, n)
      : widgetLine
        ? widgetLine
        : // What the right hand found is the headline itself: nothing under it says it again.
          n.kind === "team_watch"
          ? null
          : why
            ? sayWords(t, why, l.text ?? "")
            : media === "voice"
              ? mediaWord(t, media)
              : latestText(t, l) || (media ? mediaWord(t, media) : l.text);
  const stopStep = steps ? (steps.failedAt ?? steps.done + 1) : 0;
  const stepWords = steps
    ? failed
      ? t("notifications.stoppedAt", { step: Math.min(stopStep, steps.total), total: steps.total })
      : t("notifications.steps", { done: steps.done, total: steps.total })
    : "";
  const agentColor = first?.type === "agent" ? colorOf(dir.anyAgent(first.id)) : undefined;
  const channel = channelOf(n);
  const statusMove = n.kind === "issue_status" && (l.statusFrom || l.statusTo);
  const tags = !reaction && (sourceOf(t, n, channelName) || statusMove);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row of the inbox, not a fieldset
    <div
      className={cx(
        "nt-item ac-mediarow ac-mediarow--row",
        reaction && "nt-item--rx",
        unread && "is-unread",
        s.cur && "is-cur",
        s.replying && "is-replying",
        s.fresh && "is-new",
        s.pulse && "is-pulse",
        s.leaving && "is-leaving",
      )}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a focusable item (J/K, E, R, Enter) with its own actions inside
      tabIndex={0}
      data-n={n.id}
      aria-label={unread ? t("notifications.unreadItem", { name: label }) : label}
      onClick={(e) => clickRow(e, n, h)}
      onAuxClick={(e) => clickRow(e, n, h)}
      onKeyDown={() => {}}
    >
      <span className="ac-mediarow__face">{face}</span>
      <span className="ac-mediarow__head">
        <span className="nt-what">
          <Headline n={n} dir={dir} channelName={channelName} />
        </span>
      </span>
      <span className="ac-mediarow__end nt-tm">{whenText(t, i18n.language, n.updatedAt)}</span>
      <div className="ac-mediarow__body">
        {tags && (
          <span className="nt-tags">
            <SourceChip n={n} channelName={channelName} />
            {/* The arrow is in its words: no icon to say it again. */}
            {statusMove && (
              <Chip className="nt-chip-ink">
                {t("notifications.status", { from: statusName(t, l.statusFrom), to: statusName(t, l.statusTo) })}
              </Chip>
            )}
          </span>
        )}
        {reaction ? (
          <>
            {l.quote && (
              <div className="nt-quote">
                <span>{t("notifications.quote", { text: l.quote })}</span>
              </div>
            )}
            <div className="nt-replied nt-replied--quiet">
              <span>
                {[
                  t("notifications.reactions", { count: Math.max(n.count, n.actors.length) }),
                  channel && channelName(channel)
                    ? t("notifications.source.channel", { name: channelName(channel) })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </>
        ) : (
          <>
            {(text || lead) && (
              <p className={cx("nt-snip", restriction && "nt-snip--whole")}>
                {lead && <b>{t("notifications.lead", { text: lead })} </b>}
                {speaker && <b>{t("notifications.speaker", { name: speaker })} </b>}
                {text && <Snippet text={text} mine={mine} />}
              </p>
            )}
            {steps && (
              <div className="nt-steprow">
                <PlanStrip
                  cells={stepCells({ ...steps, failedAt: failed ? stopStep : undefined })}
                  color={agentColor}
                  label={stepWords}
                />
                <Chip
                  icon={failed ? "alert" : "check"}
                  className={cx("nt-chip-ink", failed ? "nt-chip-warn" : "nt-chip-ok")}
                >
                  {stepWords}
                </Chip>
              </div>
            )}
            {n.kind === "change_request" && (
              <div className="nt-wr__card">
                <ChangeRequestCard n={n} />
              </div>
            )}
            {n.kind === "usage_limit" && <UsageLimitActions n={n} />}
            <DeviceNoticeActions n={n} />
            <AdminAskActions n={n} />
            {n.kind === "agent_unreached" && n.source.agentId && n.source.userId && (
              <UnreachedAllow agentId={n.source.agentId} userId={n.source.userId} />
            )}
            {n.kind === "plan_lent" && <PlanTakeBack n={n} />}
            {n.kind === "plan_serves" && <PlanOnlyMe n={n} />}
            {n.kind === "plan_model_dropped" && n.source.agentId && !n.doneAt && (
              <div className="nt-steprow">
                <Button size="sm" onClick={() => h.onOpen(n)}>
                  {t("notifications.planModelDropped.choose")}
                </Button>
              </div>
            )}
            {widgetNoticeOf(n) && !n.doneAt && (
              <div className="nt-steprow">
                <WidgetNoticeActions n={n} onOpen={() => h.onOpen(n)} open={false} />
              </div>
            )}
            {expandable && (
              <>
                <button
                  type="button"
                  className="nt-more"
                  aria-expanded={s.open}
                  onClick={(e) => {
                    e.stopPropagation();
                    h.onToggle(n);
                  }}
                >
                  <Icon name="chevronDown" size={14} />
                  {s.open
                    ? t("notifications.hide")
                    : n.kind === "issue_comment"
                      ? t("notifications.showComments", { count: n.count })
                      : n.kind === "run_failed"
                        ? t("notifications.showAgents", { count: runFailedGroupOf(n)?.agents ?? n.count })
                        : t("notifications.showReplies", { count: n.count })}
                </button>
                {s.open &&
                  (n.kind === "issue_comment" ? (
                    <IssueComments n={n} dir={dir} mine={mine} />
                  ) : n.kind === "run_failed" ? (
                    <RunFailures n={n} dir={dir} channelName={channelName} />
                  ) : (
                    <ThreadReplies n={n} dir={dir} mine={mine} />
                  ))}
              </>
            )}
            {s.replied && (
              <div className="nt-replied ac-iconline">
                <Icon name="check" size={14} />
                <span>{t("notifications.youReplied", { text: s.replied })}</span>
              </div>
            )}
            {s.replying && (
              <Composer
                id={n.id}
                placeholder={placeholderFor(t, n, dir, channelName)}
                draft={s.draft}
                sending={s.sending}
                onDraft={(text) => h.onDraft(n, text)}
                onSend={() => h.onSend(n, s.draft)}
                onCancel={h.onCancel}
              />
            )}
          </>
        )}
      </div>
      <RowActions n={n} h={h} />
    </div>
  );
}

/**
 * A request waiting for me, as the conversation draws it (`RequestCard`): its kind and "esperando você" on top
 * with where it was asked, the agent's words, the object in its well, and the decision in the footer with how long
 * it has waited or has left, then Remind me later and Done. The agent's face beside it. An approval is the
 * conversation's own card (`ApprovalAsk`), several on one card the group's; what only points somewhere is a
 * `WaitRow`.
 */
function WaitCard({
  n,
  s,
  h,
  dir,
  mine,
  resolving,
  channelName,
}: {
  n: AppNotification;
  s: RowState;
  h: RowHandlers;
  dir: Dir;
  mine: string | null;
  resolving: boolean;
  channelName: (id: string) => string;
}) {
  const { t } = useTranslation();
  const first = n.actors[0];
  const name = nameOf(t, dir, first);
  const g = agentGrammar(name);
  const feminine = isFeminineName(name);
  const l = n.latest;
  const unread = n.readAt === null;
  const asked = n.kind === "join_request" ? askersOf(n) : null;
  const waitedMs = Date.now() - new Date(n.createdAt).getTime();
  const agent = first?.type === "agent" ? dir.anyAgent(first.id) : undefined;
  const tail = (
    <span className="nt-tail ac-acts">
      <SnoozeMenu
        onPick={(c) => h.onSnooze(n, c)}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="clock"
            aria-label={t("notifications.snooze")}
            title={t("notifications.snooze")}
          />
        }
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="check"
        aria-label={t("notifications.done")}
        title={t("notifications.doneTip")}
        onClick={(e) => {
          e.stopPropagation();
          h.onDone(n);
        }}
      />
    </span>
  );
  const label = !asked
    ? [name, l.title ?? l.text].filter(Boolean).join(": ")
    : asked.total > 1
      ? t("notifications.wait.joinRequestNames", { names: namesText(t, asked.names, 2, asked.total) })
      : t("notifications.wait.joinRequest", { count: 1, name: asked.names[0] });
  const face = first ? (
    <Face actor={first} dir={dir} state={resolving ? "writing" : "waiting"} className="nt-av24" />
  ) : (
    <SystemFace n={n} />
  );
  const approvalId = n.kind === "approval" ? n.source.approvalId : undefined;
  // What only points somewhere (a request to join, an agent's hand, an approval without its id) is one row.
  if (n.kind !== "agent_question" && !approvalId)
    return (
      <WaitRow
        n={n}
        s={s}
        h={h}
        dir={dir}
        channelName={channelName}
        label={label}
        who={first && !asked ? name : undefined}
        face={face}
        tail={tail}
      >
        {n.kind === "approval" && l.expiresAt && (
          <ExpiryFuse
            left={Math.max(0, new Date(l.expiresAt).getTime() - Date.now()) / TTL_MS}
            color={colorOf(agent)}
          />
        )}
        {n.kind === "change_request" && (
          <div className="nt-wr__card">
            <ChangeRequestCard n={n} />
          </div>
        )}
        {n.kind === "usage_limit" && <UsageLimitActions n={n} />}
      </WaitRow>
    );
  let card: ReactNode;
  if (approvalId) {
    card = (
      <WaitApproval
        approvalId={approvalId}
        agent={agent}
        members={dir.memberById}
        fallback={l.title ?? l.text ?? label}
        who={first ? name : undefined}
        tail={tail}
      />
    );
  } else {
    const title = l.title ?? l.text ?? "";
    const source = sourceOf(t, n, channelName);
    const suggestions = l.suggestions ?? [];
    card = (
      <RequestCard
        id={n.id}
        kind="question"
        agent={agent}
        label={label}
        who={first ? name : undefined}
        mine
        source={source?.[1]}
        lead={title}
        body={
          <>
            {l.title && l.text && (
              <p className="nt-ctx">
                <Snippet text={l.text} mine={mine} />
              </p>
            )}
            {resolving ? (
              <div className="nt-resolved ac-iconline">
                <Spinner size={14} />
                {t("notifications.wait.resolved", { context: g.context, name })}
              </div>
            ) : (
              <>
                {/* The agent's suggested answers: one a line with its key; a pick answers. */}
                {suggestions.length > 0 && (
                  <RequestChoices
                    choices={suggestions.map((label) => ({ label, busy: s.sending && s.draft === label }))}
                    onPick={(i) => {
                      const sug = suggestions[i];
                      if (sug === undefined) return;
                      h.onDraft(n, sug);
                      h.onSend(n, sug, true);
                    }}
                    disabled={s.sending}
                    other={s.replying ? undefined : { label: t("ask.otherAnswer"), onClick: () => h.onReply(n) }}
                  />
                )}
                {s.replying && (
                  <Composer
                    id={n.id}
                    placeholder={placeholderFor(t, n, dir, channelName)}
                    draft={s.draft}
                    sending={s.sending}
                    onDraft={(text) => h.onDraft(n, text)}
                    onSend={() => h.onSend(n, s.draft, suggestions.includes(s.draft.trim()))}
                    onCancel={h.onCancel}
                  />
                )}
              </>
            )}
          </>
        }
        actions={
          resolving || s.replying ? undefined : (
            <>
              {suggestions.length > 0 ? (
                <RequestKeys count={suggestions.length} />
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon="reply"
                  onClick={(e) => {
                    e.stopPropagation();
                    h.onReply(n);
                  }}
                >
                  {t("notifications.reply")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  h.onOpen(n);
                }}
              >
                {t("notifications.wait.openThread")}
              </Button>
            </>
          )
        }
        end={
          <>
            {/* Its agent stopped until I answer, in attention once it has waited a while. */}
            <span className={cx(waitedMs >= LATE_MS && "nt-late")}>
              {t(feminine ? "notifications.wait.stoppedForF" : "notifications.wait.stoppedForM", {
                time: durationText(t, waitedMs),
              })}
            </span>
            {tail}
          </>
        }
        what={title}
      />
    );
  }
  return (
    <article
      className={cx("nt-wi", unread && "is-unread", s.cur && "is-cur", s.fresh && "is-new", s.leaving && "is-leaving")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a focusable item (J/K, E, R, Enter) with its own actions inside
      tabIndex={0}
      data-n={n.id}
      data-wait=""
      data-burst=""
      aria-label={label}
      onClick={(e) => clickRow(e, n, h)}
      onAuxClick={(e) => clickRow(e, n, h)}
      onKeyDown={() => {}}
    >
      <span className="nt-face">{face}</span>
      {card}
    </article>
  );
}

/**
 * An approval waiting for me, decided right here as in its conversation: its own card, or its card's group while
 * others on it still wait (decided together, one by one in the conversation or Aprovações).
 */
function WaitApproval({
  approvalId,
  agent,
  members,
  fallback,
  who,
  tail,
}: {
  approvalId: string;
  agent: Agent | undefined;
  members: Map<string, Member>;
  /** Who asks, before the kind. */
  who?: string;
  /** Its words before the request loads. */
  fallback: string;
  tail: ReactNode;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const approvals = useApprovals(org.id);
  const listed = approvals.data?.find((a) => a.id === approvalId);
  const one = useApproval(org.id, approvalId, !listed && approvals.isSuccess);
  const a = listed ?? one.data;
  if (!a)
    return (
      <RequestCard
        id={approvalId}
        kind="approval"
        agent={agent}
        label={t("approval.group")}
        who={who}
        mine
        lead={fallback}
        end={tail}
        what={fallback}
      />
    );
  const items = a.messageId ? approvalCardItems(approvals.data, a.messageId, a) : [a];
  if (items.filter((x) => x.status === "pending").length > 1)
    return <ApprovalGroupAsk items={items} agent={agent} members={members} who={who} tail={tail} />;
  return <ApprovalAsk approval={a} agent={agent} members={members} who={who} tail={tail} />;
}

/**
 * A waiting item that only points somewhere, on a card of the requests' shape: where it is from and when on top, its
 * words and what it is about, then Open, Remind me later and Done in the footer. A click anywhere on it opens it, as
 * Open does.
 */
function WaitRow({
  n,
  s,
  h,
  dir,
  channelName,
  label,
  who,
  face,
  tail,
  children,
}: {
  n: AppNotification;
  s: RowState;
  h: RowHandlers;
  dir: Dir;
  channelName: (id: string) => string;
  label: string;
  /** Who it is from, before where (a request to join names its people in the headline). */
  who?: string;
  face: ReactNode;
  tail: ReactNode;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const unread = n.readAt === null;
  // A request to join and what the right hand found say it all in their headline; an agent's hand and an approval
  // add what they are about, a secret its name and what it is for.
  const found = teamWatchOf(n);
  const sub =
    n.kind === "join_request" || found
      ? null
      : n.kind === "secret_request"
        ? secretNoticeLine(n)
        : n.kind === "usage_limit"
          ? usageLimitLine(t, n)
          : deviceNoticeOf(n)
            ? deviceNoticeLine(t, n)
            : (widgetNoticeLine(t, n, dir) ?? n.latest.title ?? n.latest.text);
  const source = sourceOf(t, n, channelName);
  const when = whenText(t, i18n.language, n.createdAt);
  return (
    <article
      className={cx(
        "nt-wi nt-wr",
        unread && "is-unread",
        s.cur && "is-cur",
        s.fresh && "is-new",
        s.leaving && "is-leaving",
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a focusable item (J/K, E, Enter) with its own actions inside
      tabIndex={0}
      data-n={n.id}
      data-wait=""
      data-burst=""
      aria-label={unread ? t("notifications.unreadItem", { name: label }) : label}
      onClick={(e) => clickRow(e, n, h, h.onOpen)}
      onAuxClick={(e) => clickRow(e, n, h, h.onOpen)}
      onKeyDown={() => {}}
    >
      <span className="nt-face">{face}</span>
      <div className="rq nt-wr__main">
        <div className="rq__head">
          <span className="rq__kind">
            {who && (
              <>
                <span className="rq__who">{who}</span>
                {" · "}
              </>
            )}
            {source ? (
              <>
                <span className="nt-wr__src">{source[1]}</span>
                <span className="rq__source nt-wr__tm"> · {when}</span>
              </>
            ) : (
              <span className="nt-wr__tm">{when}</span>
            )}
          </span>
          <LeftChip n={n} className="nt-wr__left" />
        </div>
        <p className="rq__lead nt-what">
          <Headline n={n} dir={dir} channelName={channelName} />
        </p>
        {sub && <p className="nt-wr__sub">{sub}</p>}
        <div className="rq__foot nt-wr__acts">
          {/* A board's notice is decided or resolved right here (ADR 0135). */}
          <WidgetNoticeActions n={n} onOpen={() => h.onOpen(n)} open={false} />
          <DeviceNoticeActions n={n} inline />
          <AdminAskActions n={n} inline />
          {/* What the right hand found names its way out on the button; anything else only opens. */}
          <Button size="sm" className="nt-wr__open" title={t("notifications.openTip")} onClick={() => h.onOpen(n)}>
            {found?.act ? (t as unknown as (key: string) => string)(found.act) : t("notifications.open")}
          </Button>
          <span className="rq__end">{tail}</span>
        </div>
      </div>
      {children}
    </article>
  );
}

/** An item's row or card on screen. */
const element = (id: string) => document.querySelector<HTMLElement>(`[data-n="${CSS.escape(id)}"]`);

/** `setTimeout` that is cleared when the component unmounts (a late state update after leaving the page). */
function useLater() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);
}

/** Items that just arrived (or came back) glow in; merged ones pulse. Nothing on the first load. */
function useArrivals(items: AppNotification[], filter: NotificationFilter, ready: boolean) {
  const prev = useRef<Map<string, string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const later = useLater();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new filter starts over
  useEffect(() => {
    prev.current = null;
  }, [filter]);
  useEffect(() => {
    if (!ready) return;
    const now = new Map(items.map((n) => [n.id, n.updatedAt]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const added = items.filter((n) => !before.has(n.id)).map((n) => n.id);
    const bumped = items.filter((n) => before.has(n.id) && before.get(n.id) !== n.updatedAt).map((n) => n.id);
    if (added.length) {
      setFresh((s) => new Set([...s, ...added]));
      later(() => setFresh((s) => new Set([...s].filter((id) => !added.includes(id)))), 2400);
    }
    if (bumped.length) {
      setPulse((s) => new Set([...s, ...bumped]));
      later(() => setPulse((s) => new Set([...s].filter((id) => !bumped.includes(id)))), 800);
    }
  }, [items, ready, later]);
  return { fresh, pulse };
}

/**
 * Notificações: what waits on me on top, the rest by day, grouped by conversation. `waitingOnly`: "Esperando você"
 * (ADR 0172), the same inbox showing only what waits, each card answered in place as here.
 */
export function NotificationsPage({ waitingOnly = false }: { waitingOnly?: boolean }) {
  const { t } = useTranslation();
  const { org, me } = useOrg();
  const dir = useDirectory(org.id);
  const channels = useChannels(org.id);
  const toast = useToast();
  const qc = useQueryClient();
  const live = useLiveStore();
  const [filter, setFilter] = useState<NotificationFilter>(waitingOnly ? "waiting" : "all");
  const list = useNotifications(org.id, filter);
  const title = waitingOnly ? t("shell.waiting") : t("notifications.title");
  const badge = useNotificationCount(org.id);
  const action = useNotificationAction(org.id);
  const reply = useNotificationReply(org.id);
  const [cur, setCur] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [replied, setReplied] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const later = useLater();

  const items = allItems(list.data);
  const counts = list.data?.pages[0]?.counts;
  const { fresh, pulse } = useArrivals(items, filter, list.isSuccess && !list.isPlaceholderData);
  const mine = dir.memberById.get(me.user.id)?.handle ?? null;
  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? "";
  // "Concluídas": by when each was marked done, waiting or not.
  const doneView = filter === "done";
  const waiting = doneView ? [] : sortWaiting(items.filter((n) => n.waiting));
  const rest = doneView ? items : items.filter((n) => !n.waiting);
  const days = groupByDay(rest, undefined, doneView ? (n) => n.doneAt ?? n.updatedAt : undefined);
  const unreadTotal = counts?.unread ?? badge.data?.unread ?? 0;
  const waitingTotal = counts?.waiting ?? badge.data?.waiting ?? 0;
  const nothing = list.isSuccess && (counts?.all ?? 0) === 0 && items.length === 0;

  // The tab says how many are unread.
  useEffect(() => {
    const previous = document.title;
    document.title = waitingOnly
      ? title
      : unreadTotal
        ? t("notifications.docTitleUnread", { count: unreadTotal })
        : title;
    return () => {
      document.title = previous;
    };
  }, [unreadTotal, t, title, waitingOnly]);

  const markRead = (n: AppNotification) => {
    if (n.readAt === null) action.mutate({ type: "read", item: n, read: true });
  };

  /** Slide out, fold the space, then change the lists (the next item takes the cursor). */
  const leave = (n: AppNotification, then: () => void) => {
    if (replying === n.id) setReplying(null);
    const rows = [...document.querySelectorAll<HTMLElement>("[data-n]")];
    const i = rows.findIndex((r) => r.dataset.n === n.id);
    const next = rows[i + 1]?.dataset.n ?? rows[i - 1]?.dataset.n ?? null;
    const finish = () => {
      then();
      setLeaving((s) => {
        const copy = new Set(s);
        copy.delete(n.id);
        return copy;
      });
      if (cur === n.id || cur === null) {
        setCur(next);
        if (next) requestAnimationFrame(() => element(next)?.focus({ preventScroll: true }));
      }
    };
    const el = element(n.id);
    if (!el || prefersReducedMotion()) return finish();
    el.style.height = `${el.offsetHeight}px`;
    setLeaving((s) => new Set(s).add(n.id));
    // Inline (React doesn't own these rows' style): fold the space so the list closes up.
    later(() => {
      el.style.transition = "height .26s var(--out), padding .26s var(--out), border-color .26s";
      el.style.overflow = "hidden";
      el.style.borderTopColor = "transparent";
      el.style.height = "0px";
      el.style.paddingTop = "0px";
      el.style.paddingBottom = "0px";
    }, 180);
    later(finish, LEAVE_MS);
  };

  const done = (n: AppNotification) => {
    if (n.doneAt) {
      leave(n, () => action.mutate({ type: "done", item: n, done: false }));
      toast.show(t("notifications.toast.restored"), "info", {
        label: t("notifications.toast.undo"),
        run: () => action.mutate({ type: "done", item: { ...n, doneAt: null }, done: true }),
      });
      return;
    }
    const name = nameOf(t, dir, n.actors[0]);
    leave(n, () => action.mutate({ type: "done", item: n, done: true }));
    toast.show(
      t("notifications.toast.done"),
      "info",
      { label: t("notifications.toast.undo"), run: () => action.mutate({ type: "done", item: n, done: false }) },
      n.kind === "agent_question"
        ? t("notifications.toast.doneQuestion", { name })
        : n.kind === "approval"
          ? t("notifications.toast.doneApproval")
          : undefined,
    );
  };

  const snooze = (n: AppNotification, choice: SnoozeChoice) => {
    const until = snoozeTimes()[choice].toISOString();
    leave(n, () => action.mutate({ type: "snooze", item: n, until }));
    const title =
      choice === "hour"
        ? t("notifications.snoozeMenu.toastHour")
        : choice === "tomorrow"
          ? t("notifications.snoozeMenu.toastTomorrow")
          : t("notifications.snoozeMenu.toastNextWeek");
    toast.show(
      title,
      "info",
      { label: t("notifications.toast.undo"), run: () => action.mutate({ type: "snooze", item: n, until: null }) },
      n.latest.title ?? latestText(t, n.latest) ?? n.latest.quote ?? "",
    );
  };

  const connect = useConnectAi();
  const aiStatus = useAiStatus(org.id);
  const openNotification = useNotificationOpener();
  const notificationHref = useNotificationHref();
  // Its computer is ready and its agents have no AI yet: what comes next is connecting one.
  const connectsAi = (n: AppNotification) => connect !== null && opensConnectAi(n, aiStatus.data);
  /** "Abrir": the same place a click on its browser notification goes (`useNotificationOpener`). */
  const openItem = (n: AppNotification) => {
    markRead(n);
    openNotification(n, org.id, { ai: aiStatus.data });
  };

  const startReply = (n: AppNotification) => {
    if (!replyTarget(n)) {
      if (n.kind === "approval") toast.show(t("notifications.toast.decideThere"), "info");
      return;
    }
    setReplying(n.id);
    setCur(n.id);
    markRead(n);
  };

  const cancelReply = () => {
    const id = replying;
    setReplying(null);
    if (id) requestAnimationFrame(() => element(id)?.focus({ preventScroll: true }));
  };

  /** An agent got unblocked: its pixels burst, a line says so, then the card leaves. */
  const resolve = (n: AppNotification) => {
    setResolving(n.id);
    const face = element(n.id)?.querySelector<HTMLElement>(".ac-avatar");
    if (face) prepareBurst(face)();
    later(() => {
      leave(n, () => dropNotification(qc, org.id, n.id));
      setResolving(null);
    }, 1700);
  };

  const send = (n: AppNotification, text: string, choice?: boolean) => {
    const target = replyTarget(n);
    const body = text.trim();
    if (!target || !body) return;
    setSending(n.id);
    reply.mutate(
      { target, text: body, choice },
      {
        onSuccess: (res) => {
          setReplying(null);
          setDrafts((d) => {
            const { [n.id]: _, ...others } = d;
            return others;
          });
          markRead(n);
          const name = nameOf(t, dir, n.actors[0]);
          if (res.kind === "question") {
            live.answered({ ...res.question, answer: res.question.answer ?? body });
            toast.show(t("notifications.toast.answered", { name }), "info", undefined, body);
            resolve(n);
          } else {
            setReplied((r) => ({ ...r, [n.id]: body }));
            toast.show(
              t("notifications.toast.sent"),
              "info",
              { label: t("notifications.toast.see"), run: () => openItem(n) },
              body,
            );
          }
        },
        onSettled: () => setSending(null),
      },
    );
  };

  const readAll = () => {
    const count = counts?.unread ?? 0;
    if (!count) return;
    action.mutate(
      { type: "readAll", filter },
      {
        onSuccess: (res) =>
          toast.show(t("notifications.toast.readAll", { count: res.ids.length || count }), "info", {
            label: t("notifications.toast.undo"),
            run: () => action.mutate({ type: "unreadMany", ids: res.ids }),
          }),
      },
    );
  };

  const toggle = (n: AppNotification) => {
    setOpen((s) => {
      const copy = new Set(s);
      if (copy.has(n.id)) copy.delete(n.id);
      else copy.add(n.id);
      return copy;
    });
    setCur(n.id);
    markRead(n);
  };

  /**
   * A click on an item opens where it happened, as Open does. On a narrow screen the first tap on another item shows
   * its actions (a row under it) and the next one opens it; connecting an AI, the one next step there is, opens at once.
   */
  const select = (n: AppNotification) => {
    const first = cur !== n.id;
    setCur(n.id);
    if (first && matchesNow(NARROW) && !connectsAi(n)) return markRead(n);
    openItem(n);
  };

  const handlers: RowHandlers = {
    onSelect: select,
    onReply: startReply,
    onDone: done,
    onSnooze: snooze,
    onOpen: openItem,
    onOpenNew: (n) => {
      markRead(n);
      window.open(notificationHref(n, org.id), "_blank", "noopener");
    },
    onToggle: toggle,
    onSend: send,
    onCancel: cancelReply,
    onDraft: (n, text) => setDrafts((d) => ({ ...d, [n.id]: text })),
  };

  // J/K (and arrows) move, E done, R reply, Enter opens, Escape closes the composer; Atalhos' rows press the same keys.
  const keyState = useRef({ items, cur, replying, handlers });
  keyState.current = { items, cur, replying, handlers };
  /** A key on `here` (or the current item); false when it means nothing there. */
  const pressKey = useCallback((key: string, here: HTMLElement | null, newTab = false) => {
    const { items: all, cur: current, handlers: h } = keyState.current;
    const at = here ?? (current ? element(current) : null);
    if (key === "j" || key === "k" || key === "arrowdown" || key === "arrowup") {
      const rows = [...document.querySelectorAll<HTMLElement>(".nt [data-n]")];
      const i = at ? rows.indexOf(at) : -1;
      const down = key === "j" || key === "arrowdown";
      const next = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (down ? 1 : -1)))];
      if (next?.dataset.n) {
        setCur(next.dataset.n);
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
      return true;
    }
    const n = all.find((x) => x.id === at?.dataset.n);
    if (!n) return false;
    if (key === "e") h.onDone(n);
    else if (key === "r") h.onReply(n);
    else if (key === "enter") {
      if (newTab) h.onOpenNew(n);
      else h.onOpen(n);
    } else return false;
    return true;
  }, []);
  // Atalhos' Mover moved the cursor: the row takes the focus the closing menu would give back to its button.
  const movedByMenu = useRef(false);
  const menuPress = (key: string) => {
    movedByMenu.current = key === "j";
    pressKey(key, null);
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const { cur: current, replying: open, handlers: h } = keyState.current;
      const target = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape" && open) {
        h.onCancel();
        return;
      }
      if (target?.closest("input, textarea, [contenteditable], [role=dialog], [role=menu], [role=listbox]")) return;
      // Cmd/Ctrl+Enter opens in a new tab; any other key with a modifier is the browser's.
      const newTab = e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.altKey;
      if ((e.metaKey || e.ctrlKey || e.altKey) && !newTab) return;
      if (target?.closest("button") && (e.key === "Enter" || e.key === " ")) return;
      const here = target?.closest<HTMLElement>("[data-n]") ?? (current ? element(current) : null);
      const key = e.key.toLowerCase();
      // Arrows move only from an item; J and K from anywhere on the page.
      if ((key === "arrowdown" || key === "arrowup") && !here) return;
      if (pressKey(key, here, newTab)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressKey]);

  const stateOf = (n: AppNotification): RowState => ({
    cur: cur === n.id,
    open: open.has(n.id),
    replying: replying === n.id,
    sending: sending === n.id,
    draft: drafts[n.id] ?? "",
    replied: replied[n.id],
    fresh: fresh.has(n.id),
    pulse: pulse.has(n.id),
    leaving: leaving.has(n.id),
  });

  const summary = waitingOnly
    ? waitingTotal > 0 && t("notifications.summaryWaiting", { count: waitingTotal })
    : nothing
      ? t("notifications.summaryNothing")
      : [
          waitingTotal ? t("notifications.summaryWaiting", { count: waitingTotal }) : "",
          unreadTotal ? t("notifications.summaryUnread", { count: unreadTotal }) : t("notifications.summaryAllRead"),
        ]
          .filter(Boolean)
          .join(" · ");
  const calmLook = lookOf(dir.agents[0]) ?? true;
  // What the keys act on: Atalhos' rows other than moving wait for one.
  const onCur = cur !== null && items.some((x) => x.id === cur);

  return (
    <div className="page page--list nt">
      <PageHeader
        title={title}
        // The counts the sidebar already has show at once, the list's own replace them: on the title's row in
        // Notifications; on "Esperando você" the line under the title, as the Approvals page says what waits.
        count={waitingOnly ? undefined : (list.isSuccess || badge.isSuccess) && summary}
        meta={waitingOnly ? ((list.isSuccess || badge.isSuccess) && summary) || undefined : undefined}
        actions={
          <>
            <Menu
              align="end"
              label={t("notifications.keys.title")}
              onClosed={() => {
                const moved = movedByMenu.current ? keyState.current.cur : null;
                if (moved) element(moved)?.focus({ preventScroll: true });
                movedByMenu.current = false;
              }}
              trigger={
                <Button variant="ghost" className="nt-keys-btn">
                  {t("notifications.keys.title")}
                </Button>
              }
            >
              <MenuHeading>{t("notifications.keys.title")}</MenuHeading>
              <MenuItem hint="J · K" disabled={items.length === 0} onSelect={() => menuPress("j")}>
                {t("notifications.keys.move")}
              </MenuItem>
              <MenuItem hint="E" disabled={!onCur} onSelect={() => menuPress("e")}>
                {t("notifications.keys.done")}
              </MenuItem>
              <MenuItem hint="R" disabled={!onCur} onSelect={() => menuPress("r")}>
                {t("notifications.keys.reply")}
              </MenuItem>
              <MenuItem hint="↵" disabled={!onCur} onSelect={() => menuPress("enter")}>
                {t("notifications.keys.open")}
              </MenuItem>
            </Menu>
            {!waitingOnly && (
              <Button disabled={doneView || !counts?.unread || action.isPending} onClick={readAll}>
                {t("notifications.readAll")}
              </Button>
            )}
          </>
        }
      />

      {!waitingOnly && (
        <div className="nt-tb">
          <div className="nt-segwrap">
            <Segmented
              label={t("notifications.filters")}
              value={filter}
              onValueChange={(f) => {
                setFilter(f);
                setCur(null);
              }}
              options={[
                ...NOTIFICATION_FILTERS.map((f) => ({
                  value: f,
                  label: t(`notifications.filter.${f}`),
                  hint: counts?.[f] ? counts[f] : undefined,
                })),
                { value: "done" as const, label: t("notifications.filter.done"), hint: undefined },
              ]}
            />
          </div>
        </div>
      )}

      {list.isPending && <LoadingCards count={3} />}
      {list.isError && !list.data && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}

      {nothing && filter === "all" && (
        <EmptyState size="page" agent={calmLook} mood="deal" title={t("notifications.calmTitle")}>
          {t("notifications.calmText")}
        </EmptyState>
      )}

      {list.isSuccess && items.length === 0 && !(nothing && filter === "all") && (
        <EmptyState
          size="panel"
          // Nobody waiting and all read are wins: the others are only a filter with nothing in it.
          agent={filter === "waiting" || filter === "unread" ? calmLook : undefined}
          mood="deal"
          actions={
            filter !== "waiting" && filter !== "unread" && !doneView ? (
              <Button
                onClick={() => {
                  setFilter("all");
                  setCur(null);
                }}
              >
                {t("notifications.filter.all")}
              </Button>
            ) : undefined
          }
        >
          {filter === "waiting"
            ? t("notifications.noneWaiting")
            : filter === "unread"
              ? t("notifications.noneUnread")
              : doneView
                ? t("notifications.noneDone")
                : t("notifications.noneHere")}
        </EmptyState>
      )}

      <div className="ac-groups">
        {waiting.length > 0 && (
          <section className="nt-wait" aria-label={t("notifications.wait.title")}>
            {/* The page's own title says it there. */}
            {!waitingOnly && <GroupHeading title={t("notifications.wait.title")} count={waiting.length} />}
            <div className="nt-wait__cards">
              {waiting.map((n) => (
                <WaitCard
                  key={n.id}
                  n={n}
                  s={stateOf(n)}
                  h={handlers}
                  dir={dir}
                  mine={mine}
                  resolving={resolving === n.id}
                  channelName={channelName}
                />
              ))}
            </div>
          </section>
        )}

        {days.map(([day, rows]) => {
          const unread = rows.filter((n) => n.readAt === null).length;
          return (
            <section key={day} className="nt-day" aria-label={t(`notifications.day.${day}`)}>
              <GroupHeading
                title={t(`notifications.day.${day}`)}
                count={unread ? t("notifications.dayUnread", { count: unread }) : rows.length}
              />
              <div className="list-card nt-list">
                {rows.map((n) => (
                  <Row key={n.id} n={n} s={stateOf(n)} h={handlers} dir={dir} mine={mine} channelName={channelName} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {list.hasNextPage && (
        <div className="nt-more-pages">
          <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {t("notifications.more")}
          </Button>
        </div>
      )}
    </div>
  );
}
