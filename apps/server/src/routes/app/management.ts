import {
  AGENT_MEDIA_LEVELS,
  AGENT_SORTS,
  AGENT_STYLES,
  agentDetail,
  agentView,
  announceMembers,
  audienceOf,
  availabilityNow,
  availableProviders,
  can,
  cancelRun,
  canTalkTo,
  canViewCost,
  continuePausedRuns,
  continueRun,
  GIF_RATINGS,
  getMembership,
  getOrgSettings,
  getRun,
  INVITE_CHOICES_MAX,
  INVITE_NOTE_MAX,
  ISSUES_GROUPS,
  ISSUES_LAYOUTS,
  ISSUES_SORTS,
  ISSUES_VIEW_ASSIGNEE,
  ISSUES_VIEW_MAX_ASSIGNEES,
  ISSUES_VIEW_PRIORITIES,
  inviteMany,
  listAgentChannels,
  listInvitationsWithStatus,
  listMembers,
  listRuns,
  makeDefaultCredential,
  memberPresence,
  memberStatus,
  myIssuesView,
  mySidebarItems,
  mySidebarOrder,
  mySidebarToolOrder,
  mySidebarView,
  orgOverview,
  pickerEndpoint,
  pickerModels,
  publishWorkspaceMode,
  queueInvitationEmail,
  requirePermission,
  resendInvitation,
  rotateCredential,
  runErrorDetail,
  SIDEBAR_ITEMS,
  SIDEBAR_PIN_LIMIT,
  SIDEBAR_PLACES,
  SIDEBAR_SECTIONS,
  type SidebarItem,
  START_PAGES,
  STATUS_EMOJI_MAX,
  STATUS_TEXT_MAX,
  STOP_REASON_MAX,
  seesAgentDetails,
  setAgentChannels,
  setAgentStyle,
  setChatPrefs,
  setMyIssuesView,
  setMySidebarItem,
  setMySidebarItems,
  setMySidebarOrder,
  setMySidebarToolOrder,
  setMySidebarView,
  setMyStatus,
  setShowActivity,
  setStartPage,
  setStopReason,
  sidebarPlaceAllowed,
  speakerOf,
  taskManager,
  taskSteps,
  updateInvitation,
  updateMyProfile,
  updateOrgSettings,
  usageReport,
  WORKSPACE_MODES,
} from "@agenteschat/engine";
import { contextWindowOf, nanoUsdToUsd, PROVIDERS, pricesAt, usdToNanoUsd } from "@agenteschat/providers";
import { createRoute, z } from "@hono/zod-openapi";
import {
  type AppDeps,
  body,
  createAppRouter,
  errors,
  iso,
  json,
  keyTester,
  OrgParams,
  requireSession,
  security,
} from "./context";
import { credentialOut } from "./credential-view";
import {
  AgentAppearance,
  AgentAudience,
  CanceledReturn,
  ChatPrefs,
  Credential,
  Model,
  ModelTier,
  PendingReturn,
  ProviderId,
  Role,
  StartChoice,
  WorkState,
} from "./schemas";

const usd = (nano: number | null) => (nano === null ? null : nanoUsdToUsd(nano));
const ModelId = z.string().max(100);

const SidebarItems = z
  .partialRecord(z.enum(SIDEBAR_ITEMS), z.enum(SIDEBAR_PLACES))
  .refine((items) => Object.entries(items).every(([item, place]) => sidebarPlaceAllowed(item as SidebarItem, place)), {
    message: "Only approvals and threads have a count, so only they can be `auto`",
  })
  .openapi("SidebarItems", {
    description:
      "Where each tool at the top of the sidebar goes: `always` in the list, `more` only in the More menu, `auto` in the list while its count is above zero (approvals, proposals and threads). A tool left out keeps the app's default.",
  });

/** What a card shows besides its number and title (`ISSUE_CARD_FIELDS`). */
const IssueCardFields = z.object({
  // An app from before projects saves its view without it.
  project: z.boolean().default(true),
  assignee: z.boolean(),
  priority: z.boolean(),
  due: z.boolean(),
  criteria: z.boolean(),
  pullRequest: z.boolean(),
  label: z.boolean(),
});

const IssuesView = z
  .object({
    layout: z.enum(ISSUES_LAYOUTS),
    group: z.enum(ISSUES_GROUPS),
    sort: z.enum(ISSUES_SORTS),
    fields: IssueCardFields,
    assignees: z.array(z.string().regex(ISSUES_VIEW_ASSIGNEE)).max(ISSUES_VIEW_MAX_ASSIGNEES),
    priorities: z.array(z.enum(ISSUES_VIEW_PRIORITIES)).max(ISSUES_VIEW_PRIORITIES.length),
    showCanceled: z.boolean(),
  })
  .openapi("IssuesView", {
    description:
      "How you look at Tarefas in one workspace: `board` or `list`, grouped by `stage`, `assignee` or `priority`, in `manual` order (the board's) or by `priority` or `due` date, what the cards show (`fields`), the assignee filter (`agent:<id>`, `person:<id>`, `none`) and the priority filter (empty: every task), and whether canceled tasks show.",
  });

const Settings = z
  .object({
    name: z.string(),
    context: z.string().openapi({
      description:
        "Shared with every agent of the organization (start of every prompt). Only for who may `configure`; empty for everyone else.",
    }),
    defaultCredentialId: z
      .uuid()
      .nullable()
      .openapi({ description: "Legacy single default key (kept for compatibility). Prefer `defaultCredentialIds`." }),
    defaultCredentialIds: z.record(z.string(), z.uuid()).openapi({
      description: "Default key per provider (`{ anthropic, openai }`): agents without a key, router, summaries.",
    }),
    routerModel: z.string().nullable().openapi({ description: "Null = the deployment's ROUTER_MODEL." }),
    summaryModel: z.string().nullable().openapi({ description: "Null = the deployment's SUMMARY_MODEL." }),
    timezone: z.string().openapi({ example: "America/Sao_Paulo" }),
    teamSize: z.enum(["solo", "small", "medium", "large"]).nullable(),
    defaultAgentBudgetUsd: z.number().optional().openapi({
      description: "Monthly budget of every agent without its own. Admins only (absent for members).",
    }),
    actionCheck: z.boolean().openapi({
      description: "Agents check what the team already did before acting outside (ADR 0064). On by default.",
    }),
    autoModels: z.record(z.string(), z.partialRecord(ModelTier, z.string())).openapi({
      description:
        "Per provider, the models Automático picks per tier where the workspace chose its own (`{ openrouter: { small, medium, large } }`, ADR 0087); a tier left out is the provider's default.",
    }),
    gifs: z.boolean().openapi({
      description: "People can send GIFs in chat (ADR 0091); they also need `gifsAvailable`. On by default.",
    }),
    gifRating: z.enum(GIF_RATINGS).openapi({
      description: "The most a GIF may be rated: `g` (any age, the default) or `pg`.",
    }),
    agentStickers: z.boolean().openapi({
      description: "The agents' own stickers, drawn from each agent's look (ADR 0091). On by default.",
    }),
    agentMedia: z.enum(AGENT_MEDIA_LEVELS).openapi({
      description:
        "How often agents follow a light reply with a sticker or a GIF on their own: `never`, `sometimes` (the default) or `often`. Needs `agentMediaAvailable`; each agent can be turned off (`mediaReplies`). When someone asks for one, agents send it at any level.",
    }),
    voiceMessages: z.boolean().openapi({
      description: "People can send voice messages (ADR 0100); they also need `voiceAvailable`. On by default.",
    }),
    mode: z.enum(WORKSPACE_MODES).openapi({
      description:
        "Who the workspace is for (ADR 0159): `team` (the default) or `personal`. It changes the apps' defaults and words, never what anyone may do; a change is audited (`organization.mode_changed`) and reaches every member's apps (`org.mode`).",
    }),
    teamWatch: z.boolean().openapi({
      description:
        "The right hand watches for what stops the team (an ended AI sign-in, an app to reconnect) and tells the one person who can fix it. On by default.",
    }),
    welcomePeople: z.boolean().openapi({
      description: "The right hand greets each person who joins the workspace, once. On by default.",
    }),
    voiceAvailable: z.boolean().openapi({
      description: "Read only: this server has a speech engine now, from its environment or from its owner's Settings.",
    }),
    gifsAvailable: z.boolean().openapi({
      description:
        "Read only: this server has a GIF provider with a key now (`GIPHY_API_KEY`, or the one the installation's owner added in Settings). Without it there are no GIFs at all.",
    }),
    agentMediaAvailable: z.boolean().openapi({
      description:
        "Read only: this installation has a Jev key (ADR 0073), which decides when an agent sends a sticker or a GIF. Without it agents send none.",
    }),
  })
  .openapi("OrgSettings");

/** A member as `viewerId` sees them: a hidden person is offline to everyone else (ADR 0084). */
const personView = (
  { availability, statusText, statusEmoji, statusUntil, ...m }: Awaited<ReturnType<typeof listMembers>>[number],
  online: Set<string>,
  viewerId: string,
) => {
  const presence = memberPresence({ availability, statusUntil }, online.has(m.userId), m.userId === viewerId);
  return {
    ...m,
    joinedAt: m.joinedAt.toISOString(),
    lastSeenAt: iso(m.lastSeenAt),
    online: presence === "online" || presence === "away" || presence === "busy",
    presence,
    status: memberStatus({ statusText, statusEmoji, statusUntil }),
    ...(m.userId === viewerId ? { availability: availabilityNow({ availability, statusUntil }) } : {}),
  };
};

/**
 * Settings as this person may see them: the default budget is money, so admins only; what the agents know of the
 * workspace (`context`) only for who configures it (empty for everyone else).
 */
const settingsFor = (s: Awaited<ReturnType<typeof getOrgSettings>>, seesCost: boolean, configures: boolean) => {
  const { defaultAgentBudgetNanoUsd, ...rest } = s;
  const shown = configures ? rest : { ...rest, context: "" };
  return seesCost ? { ...shown, defaultAgentBudgetUsd: nanoUsdToUsd(defaultAgentBudgetNanoUsd) } : shown;
};

const MemberStatus = z
  .object({
    text: z.string(),
    emoji: z.string().nullable(),
    until: z.string().nullable().openapi({ description: "When it clears itself; null = until changed." }),
  })
  .openapi("MemberStatus");

const Person = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    avatarUrl: z.string().nullable().openapi({ description: "The photo uploaded here; wins over `image`." }),
    role: Role,
    roleIds: z.array(z.string()).openapi({ description: "Their roles (`org_roles` ids), not `everyone`." }),
    joinedAt: z.string(),
    lastSeenAt: z.string().nullable(),
    online: z.boolean().openapi({ description: "Seen as connected: `presence` is online, away or busy." }),
    presence: z.enum(["online", "away", "busy", "out", "hidden", "offline"]).openapi({
      description:
        "`hidden` only for yourself; everyone else sees a hidden person as `offline`. `out`: out of office, shown connected or not until their line's `until`.",
    }),
    status: MemberStatus.nullable().openapi({ description: "What the person wrote they are doing; null = nothing." }),
    availability: z.enum(["auto", "away", "busy", "out", "hidden"]).optional().openapi({
      description: "Only on your own row: what you picked (your `presence` reads offline while you aren't connected).",
    }),
    handle: z.string().openapi({ description: "`@ana`: unique in the organization; mentions resolve by it." }),
    timezone: z
      .string()
      .openapi({ description: "The person's time zone (the organization's if they didn't pick one)." }),
  })
  .openapi("Person");

const InvitationWithStatus = z
  .object({
    id: z.uuid(),
    email: z.string(),
    role: Role,
    roleIds: z.array(z.string()),
    channelIds: z.array(z.string()).openapi({ description: "Channels it adds them to, besides #general (ADR 0090)." }),
    agentIds: z.array(z.string()).openapi({ description: "Agents they start with (ADR 0184), pinned on joining." }),
    status: z.enum(["pending", "expired"]),
    expiresAt: z.string(),
    createdAt: z.string(),
    invitedBy: z.string().nullable().openapi({ description: "Who sent it (their name)." }),
    url: z
      .string()
      .nullable()
      .openapi({
        description:
          "Its link, the same one the email carries, to copy at any time (ADR 0090). Null for an invitation sent " +
          "before links could be shown again: sending it again gives it one.",
      }),
  })
  .openapi("InvitationWithStatus");

const AgentChannel = z.object({ id: z.uuid(), name: z.string(), autoReply: z.boolean() }).openapi("AgentChannel");

const AgentDetail = z
  .object({
    id: z.uuid(),
    name: z.string(),
    handle: z.string(),
    role: z.string(),
    instructions: z.string(),
    model: z.string(),
    ownerUserId: z.string().nullable(),
    credentialId: z.uuid().nullable().openapi({ description: "Null = platform key (Cloud)." }),
    budgetUsedPercent: z
      .number()
      .openapi({ description: "This month's spend over its budget (its own, else the workspace default), in %." }),
    monthlyBudgetUsd: z.number().nullable().optional().openapi({
      description: "Admins only: its own budget; null = the workspace default (`defaultBudgetUsd`).",
    }),
    defaultBudgetUsd: z.number().optional().openapi({ description: "Admins only: the workspace default budget." }),
    tokensThisMonth: z.number(),
    runsThisMonth: z.number(),
    failuresThisMonth: z.number(),
    runsByDay: z
      .array(z.object({ day: z.number(), runs: z.number(), failed: z.number() }))
      .openapi({ description: "This month's runs and failures per day (UTC); only days with runs." }),
    pendingApprovals: z.number(),
    channels: z.array(AgentChannel),
    createdAt: z.string(),
    audience: AgentAudience,
    audienceMode: z.enum(["everyone", "people", "owner"]),
    canTalk: z.boolean(),
    seesDetails: z.boolean().openapi({
      description:
        "Whether the current person sees how it works (its owner, who manages agents, whoever it answers). Without it the instructions are empty and the month's numbers zero: only its public card.",
    }),
    appearance: AgentAppearance.nullable(),
    mediaReplies: z.boolean().openapi({
      description:
        "It may send a sticker or a GIF (ADR 0091): when someone asks for one, and after a light reply as often as the workspace's `agentMedia` allows.",
    }),
  })
  .openapi("AgentDetail");

const Run = z
  .object({
    id: z.uuid(),
    agentId: z.uuid(),
    channelId: z.uuid(),
    threadId: z.uuid(),
    trigger: z.string(),
    status: z.string(),
    error: z.string().nullable(),
    errorCode: z.string().optional().openapi({ description: "Stable code of `error` (translate with `errorParams`)." }),
    errorParams: z.record(z.string(), z.string()).optional(),
    what: z.string().openapi({ description: "Start of the message that started the run; empty when `private`." }),
    private: z.boolean().openapi({
      description:
        "The viewer doesn't read the run's conversation (not in its channel or DM): no `what` and no steps, only its numbers.",
    }),
    routine: z.boolean().openapi({ description: "Started by one of the agent's routines (also when `private`)." }),
    turns: z.number(),
    inputTokens: z.number().openapi({ description: "Every input token, cache included." }),
    cachedTokens: z.number().openapi({ description: "How much of `inputTokens` was read from the prompt cache." }),
    outputTokens: z.number(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    repo: z.string().nullable().openapi({ description: "GitHub repository it worked in (owner/name)." }),
    deniedRepo: z
      .string()
      .nullable()
      .openapi({ description: "GitHub repository it was refused (not in the agent's repositories)." }),
  })
  .openapi("Run");

// Runs carry tokens, never money: owners who aren't admins read them too (admins see cost in the usage report).
const toRun = ({ costNanoUsd: _cost, ...r }: Awaited<ReturnType<typeof listRuns>>[number]) => ({
  ...r,
  ...runErrorDetail(r.error),
  createdAt: r.createdAt.toISOString(),
  finishedAt: iso(r.finishedAt),
});

/** A run step's data without its cost (`model_call` steps record it). */
const stepData = (data: Record<string, unknown>) => {
  const { costNanoUsd: _cost, ...rest } = data;
  return rest;
};

/** Management screens: settings, people, invitations, credential rotation, agent detail, runs and usage. */
const Where = {
  channelId: z.uuid(),
  channelKind: z.enum(["channel", "dm"]),
  channelName: z.string().nullable().openapi({ description: "Null for a DM (and a routine's room)." }),
  betweenAgents: z.boolean().openapi({ description: "A conversation only agents are in: nobody can open it." }),
  threadId: z.uuid().nullable().openapi({ description: "Null: the main timeline." }),
};
const Routine = z.object({ id: z.uuid(), name: z.string() }).nullable();

const ManagedTask = z
  .object({
    runId: z.uuid(),
    agentId: z.uuid(),
    ...Where,
    status: z.enum(["queued", "running", "waiting_approval", "waiting_input"]),
    startedAt: z.string().nullable(),
    createdAt: z.string(),
    label: z.string().nullable(),
    background: z.boolean(),
    routine: Routine,
    plan: z.object({ done: z.number().int(), total: z.number().int() }).nullable(),
    requester: z.object({ userId: z.string(), name: z.string() }).nullable(),
    delegation: z
      .object({
        agentId: z.uuid(),
        origin: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("person"), userId: z.string(), name: z.string() }),
          z.object({ kind: z.literal("routine"), name: z.string() }),
          z.object({ kind: z.literal("agent") }),
        ]),
        from: z
          .object({
            channelId: z.uuid(),
            channelKind: z.enum(["channel", "dm", "task"]),
            channelName: z.string().nullable(),
            threadId: z.uuid().nullable(),
            messageId: z.uuid().nullable(),
            label: z.string().nullable().openapi({ description: "The thread's title; null without one." }),
          })
          .nullable()
          .openapi({
            description:
              "Where it was handed off, when you read that conversation: its thread and the reply that handed it (once posted).",
          }),
      })
      .nullable()
      .openapi({ description: "Another agent asked it: who, what started the chain and where." }),
    subject: z.string().nullable().openapi({
      description:
        "What the latest agent to ask it asked, as one line of at most 120 characters; null unless you read the conversation it was handed off from (`delegation.from`).",
    }),
    helpers: z
      .number()
      .int()
      .openapi({ description: "What it asked of other agents and is still on or not started, all the way down." }),
    brain: z.string().nullable(),
    machine: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    now: z
      .object({
        tool: z.string(),
        detail: z.string().nullable(),
        connector: z.string().nullable(),
        service: z.string().nullable(),
        serviceIcon: z.string().nullable(),
        at: z.string(),
      })
      .nullable()
      .openapi({ description: "What it uses right now: its latest tool call (the chat's live chip)." }),
    steps: z.number().int(),
    pendingMessageIds: z.array(z.uuid()),
    canStop: z.boolean(),
    held: z.enum(["computer_busy", "computer_offline", "plan", "budget"]).nullable().openapi({
      description: "What it waits on when it isn't a person: its computer (full or away), its plan, the budget.",
    }),
    line: z
      .object({
        machineId: z.uuid(),
        position: z.number().int(),
        of: z.number().int(),
        people: z.boolean(),
        estimatedStartAt: z.string().nullable(),
      })
      .nullable()
      .openapi({
        description: "Its place in its computer's line for room: people's turns first, then the longest wait.",
      }),
    wait: z
      .object({
        code: z.string(),
        key: z.string().nullable(),
        plan: z.string().nullable(),
        model: z.string().nullable(),
        scope: z.enum(["model", "region", "off", "inactive"]).nullable(),
        percent: z.number().int().nullable(),
        window: z.string().nullable(),
        resetsAt: z.string().nullable(),
        since: z.string().nullable(),
        canContinue: z.boolean(),
      })
      .nullable()
      .openapi({
        description:
          "Why a `waiting_input` run waits: its code, the plan or budget (`key` groups the runs on the same one), how far a pause got, since when it waits on its plan or budget (`since`, null when unknown), when the limit resets, and whether you may press Continuar agora.",
      }),
    work: z
      .object({
        state: WorkState,
        since: z.string(),
        card: z
          .uuid()
          .nullable()
          .openapi({ description: "The card it waits on, when it waits on a person: its message." }),
      })
      .nullable()
      .openapi({
        description:
          "How it stands for you, as an agent's line says it: `you` (it waits on your decision or answer), `working`, a wait on someone or something else, or `queued`, and since when (a wait from its own start). Null: it waits on its plan or budget (`held`).",
      }),
  })
  .openapi("ManagedTask");
const EndedTask = z
  .object({
    runId: z.uuid(),
    agentId: z.uuid(),
    ...Where,
    status: z.enum(["done", "failed", "canceled"]),
    label: z.string().nullable(),
    background: z.boolean(),
    routine: Routine,
    startedAt: z.string().nullable(),
    finishedAt: z.string(),
    stoppedBy: z.object({ userId: z.string(), name: z.string() }).nullable(),
  })
  .openapi("EndedTask");

const TaskManagerView = z
  .object({
    tasks: z.array(ManagedTask),
    ended: z.array(EndedTask),
    hidden: z
      .object({
        total: z.number().int(),
        working: z.number().int(),
        byAgent: z.record(z.string(), z.number().int()),
      })
      .openapi({ description: "The tasks still on you may not see: how many, never what." }),
    computers: z.array(
      z.object({ id: z.uuid(), name: z.string(), working: z.number().int(), inLine: z.number().int() }),
    ),
    activity: z
      .record(z.string(), z.array(z.number().int()))
      .openapi({ description: "Per agent: tool calls per minute over the last 60 minutes, oldest first." }),
    followUps: z
      .array(PendingReturn)
      .openapi({ description: '"Retornos": returns agents set, still to come, where you read; the soonest first.' }),
    canceledFollowUps: z
      .array(CanceledReturn)
      .openapi({ description: "Returns canceled since `since`, the latest first." }),
    doneToday: z.number().int().optional().openapi({
      description: "Your tasks done since `since`, all of them (`ended` is cut at 50). Only when asked (`doneToday`).",
    }),
  })
  .openapi("TaskManagerView");

export function managementRoutes(deps: AppDeps) {
  const { db, adapters, config } = deps;
  const app = createAppRouter(deps);
  app.use("/organizations/*", requireSession(deps.auth));
  const AgentParams = OrgParams.extend({ agentId: z.uuid() });
  /** What this server can do for GIFs and agents' stickers (ADR 0091 §5), so no switch does nothing. */
  const mediaAvailable = async () => ({
    // The provider follows the installation's key, which its owner may add or remove at any time.
    gifsAvailable: adapters.gifs?.available() ?? false,
    voiceAvailable: deps.extras?.speech?.available() ?? false,
    agentMediaAvailable: Boolean((await deps.extras?.jevKey?.view())?.source),
  });

  // ── Organization ──────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/settings",
      tags: ["Organization"],
      security,
      summary: "Organization settings and context",
      request: { params: OrgParams },
      responses: { 200: json(Settings), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const actor = c.get("user").id;
      const settings = await getOrgSettings(db, actor, orgId);
      const [seesCost, viewer] = await Promise.all([canViewCost(db, actor, orgId), getMembership(db, actor, orgId)]);
      return c.json({ ...settingsFor(settings, seesCost, can(viewer, "configure")), ...(await mediaAvailable()) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/organizations/{orgId}/settings",
      tags: ["Organization"],
      security,
      summary: "Change settings or the organization context (admins)",
      request: {
        params: OrgParams,
        body: body(
          z.object({
            name: z.string().trim().min(1).max(100).optional(),
            context: z.string().max(20_000).optional(),
            defaultCredentialId: z.uuid().nullable().optional(),
            defaultCredentialIds: z.partialRecord(ProviderId, z.uuid().nullable()).optional(),
            routerModel: ModelId.nullable().optional(),
            summaryModel: ModelId.nullable().optional(),
            timezone: z.string().max(64).optional(),
            teamSize: z.enum(["solo", "small", "medium", "large"]).nullable().optional(),
            defaultAgentBudgetUsd: z
              .number()
              .positive()
              .max(1_000_000)
              .optional()
              .openapi({ description: "Monthly budget of every agent without its own." }),
            actionCheck: z.boolean().optional(),
            autoModels: z.partialRecord(ProviderId, z.partialRecord(ModelTier, ModelId.nullable())).optional().openapi({
              description:
                "Per provider and tier, one of that provider's models; null puts the tier back on its default.",
            }),
            voiceMessages: z
              .boolean()
              .optional()
              .openapi({ description: "People can send voice messages (ADR 0100)." }),
            gifs: z.boolean().optional().openapi({ description: "People can send GIFs in chat (ADR 0091)." }),
            gifRating: z.enum(GIF_RATINGS).optional(),
            agentStickers: z.boolean().optional(),
            agentMedia: z.enum(AGENT_MEDIA_LEVELS).optional(),
            mode: z.enum(WORKSPACE_MODES).optional().openapi({ description: "`team` or `personal` (ADR 0159)." }),
            teamWatch: z.boolean().optional(),
            welcomePeople: z.boolean().optional(),
          }),
        ),
      },
      responses: { 200: json(Settings), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const actor = c.get("user").id;
      const { defaultAgentBudgetUsd, ...input } = c.req.valid("json");
      const settings = await updateOrgSettings(db, actor, orgId, {
        ...input,
        ...(defaultAgentBudgetUsd !== undefined
          ? { defaultAgentBudgetNanoUsd: usdToNanoUsd(defaultAgentBudgetUsd) }
          : {}),
      });
      // Every member's apps reshape at once (ADR 0159): the mode is in `GET /me`, which they read again.
      if (input.mode !== undefined) await publishWorkspaceMode(adapters.pubsub, orgId, settings.mode);
      const seesCost = await canViewCost(db, actor, orgId);
      // Only who configures the workspace gets here (`updateOrgSettings`).
      return c.json({ ...settingsFor(settings, seesCost, true), ...(await mediaAvailable()) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/overview",
      tags: ["Organization"],
      security,
      summary: "Sidebar counts: people, agents, the workspace's budget use this month, approvals waiting for me",
      request: { params: OrgParams },
      responses: {
        200: json(
          z.object({
            name: z.string(),
            role: Role,
            people: z.number(),
            agents: z.number(),
            budgetUsedPercent: z.number().openapi({
              description: "What the workspace's agents spent this month over the sum of their budgets, in %.",
            }),
            approvalsWaitingForMe: z.number(),
            proposalsWaitingForMe: z.number().openapi({
              description: "Open proposals the viewer can see and decide (`GET …/proposals`, `canDecide`).",
            }),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await orgOverview(db, c.get("user").id, c.req.valid("param").orgId), 200),
  );

  // ── People and invitations ────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/people",
      tags: ["Members"],
      security,
      summary: "Members with presence (online now, last seen)",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ people: z.array(Person) })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requirePermission(db, c.get("user").id, orgId, "read");
      const online = new Set(await adapters.presence.online(orgId));
      const rows = await listMembers(db, orgId);
      return c.json({ people: rows.map((m) => personView(m, online, c.get("user").id)) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/organizations/{orgId}/me",
      tags: ["Members"],
      security,
      summary: "Change your handle or time zone in this organization",
      request: {
        params: OrgParams,
        body: body(
          z.object({
            handle: z.string().max(40).optional(),
            timezone: z.string().max(64).nullable().optional().openapi({ description: "Null = the organization's." }),
          }),
        ),
      },
      responses: { 200: json(Person), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const me = await updateMyProfile(db, c.get("user").id, orgId, c.req.valid("json"));
      await announceMembers(adapters.pubsub, orgId);
      const online = new Set(await adapters.presence.online(orgId));
      return c.json(personView(me, online, me.userId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/status",
      tags: ["Members"],
      security,
      summary: "Set your availability (auto, away, busy, out of office, hidden) and what you are doing",
      request: {
        params: OrgParams,
        body: body(
          z.object({
            availability: z.enum(["auto", "away", "busy", "out", "hidden"]).optional().openapi({
              description:
                "`auto` = online while connected; `out` = out of office for everyone until your line's `until`; `hidden` = everyone else sees you offline.",
            }),
            status: z
              .object({
                text: z.string().max(STATUS_TEXT_MAX * 2),
                emoji: z.string().max(STATUS_EMOJI_MAX).nullable().optional(),
                until: z.string().nullable().optional().openapi({ description: "ISO time it clears; null = never." }),
              })
              .nullable()
              .optional()
              .openapi({ description: "Null (or empty text) clears it." }),
          }),
        ),
      },
      responses: { 200: json(Person), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const userId = c.get("user").id;
      await setMyStatus({ db, pubsub: adapters.pubsub }, userId, orgId, c.req.valid("json"));
      const me = (await listMembers(db, orgId)).find((m) => m.userId === userId);
      if (!me) return c.json({ error: { code: "not_found", message: "Not a member" } }, 404);
      return c.json(personView(me, new Set(await adapters.presence.online(orgId)), userId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/start",
      tags: ["Members"],
      security,
      summary: "Choose what opens when the app starts in this organization",
      description:
        "Yours, on every device (ADR 0108): `home` (Início, Conversas on the phone), `last` (where you were, which each device keeps) or `channel` (`channelId`, one of this organization's channels you are in, not archived: else 400 `start.channel_unknown`). `GET /me` sends it with each organization (`start`).",
      request: {
        params: OrgParams,
        body: body(
          z.object({
            page: z.enum(START_PAGES),
            channelId: z.uuid().nullable().optional().openapi({ description: "With `channel`; ignored otherwise." }),
          }),
        ),
      },
      responses: { 200: json(StartChoice), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json(await setStartPage(db, c.get("user").id, orgId, c.req.valid("json")), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/activity",
      tags: ["Members"],
      security,
      summary: "Show or hide what agents did under each reply in this organization",
      description:
        'Yours, on every device, off by default: on, each agent reply shows its tools ("Used 4 tools"); off, only the live step line while it works and the cards that carry content or wait for a person. `GET /me` sends it with each organization (`showActivity`).',
      request: { params: OrgParams, body: body(z.object({ show: z.boolean() })) },
      responses: { 200: json(z.object({ show: z.boolean() })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const show = await setShowActivity(db, c.get("user").id, orgId, c.req.valid("json").show);
      return c.json({ show }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/agent-style",
      tags: ["Members"],
      security,
      summary: "Choose how agents talk to you in this organization",
      description:
        "Yours, for every agent here (ADR 0147): `simple` (plain words, what to do first) or `technical` (paths, codes and ids welcome). Until you pick, agents talk simply. `GET /me` sends it with each organization (`agentStyle`).",
      request: { params: OrgParams, body: body(z.object({ style: z.enum(AGENT_STYLES) })) },
      responses: { 200: json(z.object({ style: z.enum(AGENT_STYLES) })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const style = await setAgentStyle(db, c.get("user").id, orgId, c.req.valid("json").style);
      return c.json({ style }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/chat",
      tags: ["Members"],
      security,
      summary: "Choose how conversations look to you in this organization",
      description:
        "Yours, on every device. Only the keys you send change. `GET /me` sends what you chose with each organization (`chatPrefs`); a key not there keeps the app's default.",
      request: { params: OrgParams, body: body(ChatPrefs) },
      responses: { 200: json(ChatPrefs), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json(await setChatPrefs(db, c.get("user").id, orgId, c.req.valid("json")), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/me/sidebar",
      tags: ["Members"],
      security,
      summary: "Where you put the tools at the top of your sidebar in this workspace",
      description: "Only the tools you moved. Yours alone, on every device you sign in on.",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ items: SidebarItems })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ items: await mySidebarItems(db, orgId, c.get("user").id) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/organizations/{orgId}/me/sidebar",
      tags: ["Members"],
      security,
      summary: "Put one tool at the top of your sidebar where you want it in this workspace",
      description:
        "Your other choices stay as the server has them, so one made on another device in the meantime is kept. `place: null` puts the tool back on the app's default.",
      request: {
        params: OrgParams,
        body: body(
          z
            .object({ item: z.enum(SIDEBAR_ITEMS), place: z.enum(SIDEBAR_PLACES).nullable() })
            .refine(({ item, place }) => place === null || sidebarPlaceAllowed(item, place), {
              message: "Only approvals and threads have a count, so only they can be `auto`",
            }),
        ),
      },
      responses: { 200: json(z.object({ items: SidebarItems })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const { item, place } = c.req.valid("json");
      return c.json({ items: await setMySidebarItem(db, orgId, c.get("user").id, item, place) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/sidebar",
      tags: ["Members"],
      security,
      summary: "Put the tools at the top of your sidebar where you want them in this workspace",
      description:
        "Replaces your choices: `{}` puts every tool back on the app's default. To move one tool, `PATCH` keeps the others as the server has them.",
      request: { params: OrgParams, body: body(z.object({ items: SidebarItems })) },
      responses: { 200: json(z.object({ items: SidebarItems })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ items: await setMySidebarItems(db, orgId, c.get("user").id, c.req.valid("json").items) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/me/issues-view",
      tags: ["Members"],
      security,
      summary: "How you look at Tarefas in this workspace",
      description:
        "Yours alone, on every device you sign in on; the default until you change it. The search is never kept.",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ view: IssuesView })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ view: await myIssuesView(db, orgId, c.get("user").id) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/issues-view",
      tags: ["Members"],
      security,
      summary: "Keep how you look at Tarefas in this workspace",
      description:
        "Replaces your view with this one. Answers with what was kept: an assignee filter repeated is kept once.",
      request: { params: OrgParams, body: body(z.object({ view: IssuesView })) },
      responses: { 200: json(z.object({ view: IssuesView })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ view: await setMyIssuesView(db, orgId, c.get("user").id, c.req.valid("json").view) }, 200);
    },
  );

  const SidebarOrder = z
    .array(z.enum(SIDEBAR_SECTIONS))
    .length(SIDEBAR_SECTIONS.length)
    .refine((order) => new Set(order).size === order.length, { message: "Each section once" })
    .openapi("SidebarOrder", {
      description:
        "The sidebar's sections in your order: `tools` (the tools on top), `channels`, `agents`, `people` (direct messages).",
    });

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/me/sidebar/order",
      tags: ["Members"],
      security,
      summary: "The order of the sections in your sidebar in this workspace",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ order: SidebarOrder })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ order: await mySidebarOrder(db, orgId, c.get("user").id) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/sidebar/order",
      tags: ["Members"],
      security,
      summary: "Order the sections of your sidebar in this workspace",
      description: "Yours alone, on every device. `order: null` goes back to the default; the tools' places stay.",
      request: { params: OrgParams, body: body(z.object({ order: SidebarOrder.nullable() })) },
      responses: { 200: json(z.object({ order: SidebarOrder })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ order: await setMySidebarOrder(db, orgId, c.get("user").id, c.req.valid("json").order) }, 200);
    },
  );

  const SidebarToolOrder = z
    .array(z.enum(SIDEBAR_ITEMS))
    .length(SIDEBAR_ITEMS.length)
    .refine((order) => new Set(order).size === order.length, { message: "Each tool once" })
    .openapi("SidebarToolOrder", {
      description:
        "The tools at the top of the sidebar in your order, every tool once. Where each shows (the list or More) is its place in `SidebarItems`.",
    });

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/me/sidebar/tools",
      tags: ["Members"],
      security,
      summary: "The order of the tools at the top of your sidebar in this workspace",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ order: SidebarToolOrder })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ order: await mySidebarToolOrder(db, orgId, c.get("user").id) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/sidebar/tools",
      tags: ["Members"],
      security,
      summary: "Order the tools at the top of your sidebar in this workspace",
      description:
        "Yours alone, on every device. `order: null` goes back to the default; the tools' places and the sections' order stay.",
      request: { params: OrgParams, body: body(z.object({ order: z.array(z.string().max(40)).max(100).nullable() })) },
      responses: { 200: json(z.object({ order: SidebarToolOrder })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json(
        { order: await setMySidebarToolOrder(db, orgId, c.get("user").id, c.req.valid("json").order) },
        200,
      );
    },
  );

  const PinIds = z.array(z.string().min(1).max(64)).max(SIDEBAR_PIN_LIMIT);
  const SidebarView = z
    .object({
      agentSort: z.enum(AGENT_SORTS).openapi({
        description: "How AGENTES orders each group: the workspace's order, your agents first, or working first.",
      }),
      showAllAgents: z.boolean().openapi({
        description: "Who manages agents also lists the ones that don't talk to them (each says who it talks to).",
      }),
      pins: z
        .object({ agents: PinIds, channels: PinIds, people: PinIds })
        .nullable()
        .openapi({
          description: `"Fixar no topo": agent, channel and user ids on top of their own section, at most ${SIDEBAR_PIN_LIMIT} each. \`null\` until you first pin or dismiss: the apps then pin your own agents.`,
        }),
    })
    .openapi("SidebarView");

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/me/sidebar/view",
      tags: ["Members"],
      security,
      summary: "How your sidebar shows the agents, and what you pinned, in this workspace",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ view: SidebarView })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ view: await mySidebarView(db, orgId, c.get("user").id) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/me/sidebar/view",
      tags: ["Members"],
      security,
      summary: "Keep how your sidebar shows the agents, and what you pinned, in this workspace",
      description: "Yours alone, on every device. Replaces the view; the tools' places and the orders stay.",
      request: { params: OrgParams, body: body(z.object({ view: SidebarView })) },
      responses: { 200: json(z.object({ view: SidebarView })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ view: await setMySidebarView(db, orgId, c.get("user").id, c.req.valid("json").view) }, 200);
    },
  );

  const inviteUrl = (token: string) => `${config.PUBLIC_URL.replace(/\/$/, "")}/invite/${token}`;

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/invitations/all",
      tags: ["Members"],
      security,
      summary: "Invitations not accepted yet, with status (pending or expired)",
      request: { params: OrgParams },
      responses: { 200: json(z.object({ invitations: z.array(InvitationWithStatus) })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const rows = await listInvitationsWithStatus(db, c.get("user").id, orgId, new Date(), config.AGENTES_SECRET);
      return c.json(
        {
          invitations: rows.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            roleIds: i.roleIds,
            channelIds: i.channelIds,
            agentIds: i.agentIds,
            status: i.status,
            expiresAt: i.expiresAt.toISOString(),
            createdAt: i.createdAt.toISOString(),
            invitedBy: i.invitedBy,
            url: i.token ? inviteUrl(i.token) : null,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/invitations/batch",
      tags: ["Members"],
      security,
      summary: "Invite several emails at once",
      description:
        "One outcome per email: exactly one of `emails`, all with `roleIds` (ADR 0184), or `invites`, each address " +
        "with its own roles (ADR 0090). `channelIds`, `agentIds` and `note` go with every one, checked against the " +
        "cargos all of them get: `invitation.channel` and `invitation.agent` (400) name the one refused, with `why`. " +
        "Only a hash of each token is stored (7-day expiry); the link can be copied again from the list.",
      request: {
        params: OrgParams,
        body: body(
          z
            .object({
              emails: z.array(z.string().max(320)).min(1).max(100).optional(),
              invites: z
                .array(
                  z.object({
                    email: z.string().max(320),
                    roleIds: z.array(z.string().uuid()).max(50).optional(),
                  }),
                )
                .min(1)
                .max(100)
                .optional(),
              roleIds: z
                .array(z.string().uuid())
                .max(50)
                .optional()
                .openapi({ description: "Roles they get on accepting, below your own (ADR 0085)." }),
              channelIds: z
                .array(z.string().uuid())
                .max(INVITE_CHOICES_MAX)
                .optional()
                .openapi({
                  description:
                    "Channels they join on accepting, besides #general (ADR 0090): public ones, ones you are in, and " +
                    "private ones limited to a cargo they get (ADR 0184).",
                }),
              agentIds: z
                .array(z.string().uuid())
                .max(INVITE_CHOICES_MAX)
                .optional()
                .openapi({
                  description:
                    "Agents they start with (ADR 0184): pinned on joining, and a restricted one you may open starts " +
                    "answering them. Never one holding someone else's mailbox, nor one keeping its plan for its owner.",
                }),
              note: z
                .string()
                .max(INVITE_NOTE_MAX)
                .optional()
                .openapi({ description: "Your words, in the invitation email (ADR 0090)." }),
            })
            .refine((b) => b.emails !== undefined || b.invites !== undefined, {
              message: "Send `emails` or `invites`",
            })
            .refine((b) => b.emails === undefined || b.invites === undefined, {
              message: "Send `emails` or `invites`, not both",
            }),
        ),
      },
      responses: {
        200: json(
          z.object({
            results: z.array(
              z.object({
                email: z.string(),
                status: z.enum(["invited", "already_member", "invalid_email", "already_invited"]),
                invitationId: z.uuid().optional(),
                url: z.string().optional(),
              }),
            ),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const results = await inviteMany(db, c.get("user").id, orgId, {
        ...c.req.valid("json"),
        secret: config.AGENTES_SECRET,
      });
      for (const r of results) {
        if (r.status !== "invited") continue;
        await queueInvitationEmail(db, {
          orgId,
          invitationId: r.invitationId,
          email: r.email,
          role: "member",
          url: inviteUrl(r.token),
          inviterId: c.get("user").id,
          secret: config.AGENTES_SECRET,
        });
      }
      deps.wakeWorkers?.();
      return c.json(
        {
          results: results.map((r) =>
            r.status === "invited"
              ? { email: r.email, status: r.status, invitationId: r.invitationId, url: inviteUrl(r.token) }
              : { email: r.email, status: r.status, ...(r.invitationId ? { invitationId: r.invitationId } : {}) },
          ),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/invitations/{invitationId}/resend",
      tags: ["Members"],
      security,
      summary: "Resend: the same link, a new 7-day expiry (ADR 0090)",
      description: "An invitation sent before links could be shown again gets a new link: the old one stops working.",
      request: { params: OrgParams.extend({ invitationId: z.uuid() }), body: body(z.object({})) },
      responses: { 200: json(z.object({ url: z.string(), expiresAt: z.string() })), ...errors },
    }),
    async (c) => {
      const { orgId, invitationId } = c.req.valid("param");
      const { invitation, token } = await resendInvitation(
        db,
        c.get("user").id,
        orgId,
        invitationId,
        new Date(),
        config.AGENTES_SECRET,
      );
      await queueInvitationEmail(db, {
        orgId,
        invitationId,
        email: invitation.email,
        role: invitation.role,
        url: inviteUrl(token),
        inviterId: c.get("user").id,
        secret: config.AGENTES_SECRET,
      });
      deps.wakeWorkers?.();
      return c.json({ url: inviteUrl(token), expiresAt: invitation.expiresAt.toISOString() }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/organizations/{orgId}/invitations/{invitationId}",
      tags: ["Members"],
      security,
      summary: "Change what a pending invitation gives (ADR 0090, 0184): the same link, nothing is sent",
      description:
        "Its cargos, channels and agents, each checked as when sending it; an omitted one stays. Only while it still " +
        "works (409 once it ran out: send it again).",
      request: {
        params: OrgParams.extend({ invitationId: z.uuid() }),
        body: body(
          z
            .object({
              roleIds: z.array(z.string().uuid()).max(50).optional(),
              channelIds: z.array(z.string().uuid()).max(INVITE_CHOICES_MAX).optional(),
              agentIds: z.array(z.string().uuid()).max(INVITE_CHOICES_MAX).optional(),
            })
            .refine((b) => b.roleIds || b.channelIds || b.agentIds, {
              message: "Send `roleIds`, `channelIds` or `agentIds`",
            }),
        ),
      },
      responses: {
        200: json(
          z.object({ roleIds: z.array(z.string()), channelIds: z.array(z.string()), agentIds: z.array(z.string()) }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId, invitationId } = c.req.valid("param");
      const result = await updateInvitation(db, c.get("user").id, orgId, invitationId, c.req.valid("json"));
      return c.json(result, 200);
    },
  );

  // ── Credentials ───────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/credentials/{credentialId}/rotate",
      tags: ["Agents"],
      security,
      summary: "Replace a provider key, keeping the same credential (agents keep using it)",
      request: {
        params: OrgParams.extend({ credentialId: z.uuid() }),
        body: body(
          z.object({
            apiKey: z.string().min(8).max(500),
            label: z.string().max(80).optional(),
            workspaceId: z.string().max(128).nullable().optional(),
            organization: z.string().max(128).nullable().optional(),
            project: z.string().max(128).nullable().optional(),
          }),
        ),
      },
      responses: { 200: json(Credential), ...errors },
    }),
    async (c) => {
      const { orgId, credentialId } = c.req.valid("param");
      const row = await rotateCredential(
        db,
        adapters.keyWrapper,
        c.get("user").id,
        orgId,
        credentialId,
        c.req.valid("json"),
        { fetch: deps.extras?.http, verify: (await keyTester(deps, c.get("user").id))?.verifyKey },
      );
      return c.json(credentialOut(row), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/credentials/{credentialId}/make-default",
      tags: ["Agents"],
      security,
      summary: 'Make this key its provider\'s default for the workspace ("Make default")',
      request: { params: OrgParams.extend({ credentialId: z.uuid() }), body: body(z.object({})) },
      responses: { 200: json(Credential), ...errors },
    }),
    async (c) => {
      const { orgId, credentialId } = c.req.valid("param");
      const row = await makeDefaultCredential(db, c.get("user").id, orgId, credentialId);
      return c.json(credentialOut(row), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/credentials/platform",
      tags: ["Agents"],
      security,
      summary: "Whether this server offers a platform key (agents without their own key use it)",
      request: { params: OrgParams, query: z.object({ provider: z.string().default("anthropic") }) },
      responses: { 200: json(z.object({ available: z.boolean() })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requirePermission(db, c.get("user").id, orgId, "read");
      const { provider } = c.req.valid("query");
      const pc = adapters.platformCredentials;
      const available = pc.available
        ? await pc.available(orgId, provider)
        : (await pc.resolve(orgId, provider)) !== null;
      return c.json({ available }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/models",
      tags: ["Agents"],
      security,
      summary: "Models, with whether this workspace can use them (it has a key for the provider, or the platform does)",
      request: { params: OrgParams },
      responses: {
        200: json(
          z.object({
            models: z.array(
              z.object({
                id: z.string(),
                label: z.string(),
                provider: z.string(),
                contextWindow: z.number().int().openapi({ description: "Its context window in tokens." }),
                available: z.boolean(),
                recommended: z.boolean().openapi({ description: "Suggested for new agents of an available provider." }),
                cheap: z.boolean(),
                inputUsdPerMTok: z.number(),
                outputUsdPerMTok: z.number(),
                pick: z.boolean().optional().openapi({
                  description:
                    "In OpenRouter's long list (ADR 0087): a good pick, shown first. Absent: a catalog model.",
                }),
                tier: ModelTier.optional().openapi({
                  description: "The size Automático uses it for on its provider's key, by default.",
                }),
                endpoint: Model.shape.endpoint,
                unpriced: Model.shape.unpriced,
              }),
            ),
            providers: z.array(
              z.object({ id: z.string(), label: z.string(), hasKey: z.boolean(), platform: z.boolean() }),
            ),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requirePermission(db, c.get("user").id, orgId, "read");
      const providerIds = Object.keys(PROVIDERS);
      const access = await availableProviders(db, orgId, adapters.platformCredentials, providerIds);
      const usable = (p: string) => Boolean(access.get(p)?.own || access.get(p)?.platform);
      return c.json(
        {
          models: (await pickerModels(db, [orgId])).map(([id, m]) => ({
            id,
            label: m.label,
            provider: m.provider,
            contextWindow: contextWindowOf(id),
            available: usable(m.provider),
            recommended: usable(m.provider) && m.recommended === true,
            cheap: m.cheap === true,
            inputUsdPerMTok: pricesAt(m).input / 1000,
            outputUsdPerMTok: pricesAt(m).output / 1000,
            ...(m.pick !== undefined ? { pick: m.pick } : {}),
            ...(m.tier ? { tier: m.tier } : {}),
            ...pickerEndpoint(id, m),
          })),
          providers: providerIds.map((id) => ({
            id,
            label: (PROVIDERS as Record<string, { label: string }>)[id]?.label ?? id,
            hasKey: access.get(id)?.own ?? false,
            platform: access.get(id)?.platform ?? false,
          })),
        },
        200,
      );
    },
  );

  // ── Agents ────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/agents/{agentId}",
      tags: ["Agents"],
      security,
      summary: "An agent with its budget use (%), runs and channels this month",
      request: { params: AgentParams },
      responses: { 200: json(AgentDetail), ...errors },
    }),
    async (c) => {
      const { orgId, agentId } = c.req.valid("param");
      const userId = c.get("user").id;
      const d = await agentDetail(db, userId, orgId, agentId);
      const v = agentView(d.agent);
      const [seesCost, viewer] = await Promise.all([canViewCost(db, userId, orgId), getMembership(db, userId, orgId)]);
      const seesDetails = seesAgentDetails(d.agent, userId, viewer);
      const month = seesDetails
        ? d.month
        : { ...d.month, budgetUsedPercent: 0, tokens: 0, runs: 0, failures: 0, byDay: [] };
      return c.json(
        {
          id: v.id,
          name: v.name,
          handle: v.handle,
          role: v.role,
          instructions: seesDetails ? v.instructions : "",
          model: v.model,
          ownerUserId: v.ownerUserId,
          credentialId: seesDetails ? d.agent.credentialId : null,
          budgetUsedPercent: month.budgetUsedPercent,
          ...(seesCost
            ? {
                monthlyBudgetUsd: usd(v.monthlyBudgetNanoUsd),
                defaultBudgetUsd: v.monthlyBudgetNanoUsd === null ? nanoUsdToUsd(d.month.budgetNanoUsd) : undefined,
              }
            : {}),
          tokensThisMonth: month.tokens,
          runsThisMonth: month.runs,
          failuresThisMonth: month.failures,
          runsByDay: month.byDay,
          pendingApprovals: seesDetails ? d.pendingApprovals : 0,
          audience: audienceOf(d.agent),
          audienceMode: d.agent.audienceMode,
          canTalk: canTalkTo(d.agent, userId, speakerOf(viewer)),
          seesDetails,
          appearance: v.appearance,
          mediaReplies: v.mediaReplies,
          channels: d.channels,
          createdAt: v.createdAt.toISOString(),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/agents/{agentId}/channels",
      tags: ["Agents"],
      security,
      summary: "Where the agent works",
      request: { params: AgentParams },
      responses: { 200: json(z.object({ channels: z.array(AgentChannel) })), ...errors },
    }),
    async (c) => {
      const { orgId, agentId } = c.req.valid("param");
      await requirePermission(db, c.get("user").id, orgId, "read");
      return c.json({ channels: await listAgentChannels(db, c.get("user").id, orgId, agentId) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/organizations/{orgId}/agents/{agentId}/channels",
      tags: ["Agents"],
      security,
      summary: "Set the agent's channels (and whether it answers without a mention in each)",
      description:
        "Its owner, or who may manage agents, in the channels they're in and may post in, or that they manage (its creator, `manage_channels`). The list replaces the channels `GET` shows the caller: private channels they can't see, DMs and archived channels stay.",
      request: {
        params: AgentParams,
        body: body(
          z.object({
            channels: z.array(z.object({ channelId: z.uuid(), autoReply: z.boolean().optional() })).max(500),
          }),
        ),
      },
      responses: { 200: json(z.object({ channels: z.array(AgentChannel) })), ...errors },
    }),
    async (c) => {
      const { orgId, agentId } = c.req.valid("param");
      const channels = await setAgentChannels(db, c.get("user").id, orgId, agentId, c.req.valid("json").channels, {
        pubsub: adapters.pubsub,
      });
      return c.json({ channels }, 200);
    },
  );

  // ── Runs and usage ────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/runs",
      tags: ["Usage"],
      security,
      summary: "Run history with tokens (admins; owners for their agents). Cost is in the usage report",
      request: {
        params: OrgParams,
        query: z.object({
          agentId: z.uuid().optional(),
          status: z
            .enum(["queued", "running", "waiting_approval", "waiting_input", "done", "failed", "canceled"])
            .optional(),
          before: z.iso.datetime().optional(),
          since: z.iso.datetime().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      },
      responses: { 200: json(z.object({ runs: z.array(Run) })), ...errors },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const runs = await listRuns(db, c.get("user").id, c.req.valid("param").orgId, {
        agentId: q.agentId,
        status: q.status,
        before: q.before ? new Date(q.before) : undefined,
        since: q.since ? new Date(q.since) : undefined,
        limit: q.limit,
      });
      return c.json({ runs: runs.map(toRun) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/runs/{runId}",
      tags: ["Usage"],
      security,
      summary: "One run and its steps (context, model calls, tool calls, approvals, messages)",
      request: { params: OrgParams.extend({ runId: z.uuid() }) },
      responses: {
        200: json(
          z.object({
            run: Run,
            steps: z.array(
              z.object({
                seq: z.number(),
                kind: z.string(),
                data: z.record(z.string(), z.unknown()),
                createdAt: z.string(),
              }),
            ),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId, runId } = c.req.valid("param");
      const { run, steps } = await getRun(db, c.get("user").id, orgId, runId);
      if (!run) return c.json({ error: { code: "not_found", message: "Run not found" } }, 404);
      return c.json(
        {
          run: toRun(run),
          steps: steps.map((s) => ({ ...s, data: stepData(s.data), createdAt: s.createdAt.toISOString() })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/runs/{runId}/cancel",
      tags: ["Usage"],
      security,
      summary:
        "Stop an agent's run (the person who asked, the agent's owner or an admin). Its text so far is kept; a queued run never starts",
      description:
        "The agent is told in that conversation (a routine's room for a routine), with `reason` when given (ADR 0128): a notice it reads before its next turn there, which wakes nothing.",
      request: {
        params: OrgParams.extend({ runId: z.uuid() }),
        body: {
          ...body(
            z.object({
              reason: z
                .string()
                .max(STOP_REASON_MAX)
                .optional()
                .openapi({ description: "Why, in the person's words: the agent reads it." }),
              chain: z
                .boolean()
                .optional()
                .openapi({ description: "What it asked of other agents stops with it, all the way down." }),
            }),
          ),
          required: false,
        },
      },
      responses: {
        200: json(
          z.object({
            id: z.uuid(),
            status: z.literal("canceled"),
            previousStatus: z.enum(["queued", "running", "waiting_approval", "waiting_input"]),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId, runId } = c.req.valid("param");
      const { reason, chain } = (c.req.valid("json") ?? {}) as { reason?: string; chain?: boolean };
      const result = await cancelRun({ db, pubsub: adapters.pubsub }, c.get("user").id, orgId, runId, {
        ...(reason ? { reason } : {}),
        ...(chain ? { chain } : {}),
      });
      return c.json(
        {
          id: result.id,
          status: "canceled" as const,
          previousStatus: result.previousStatus as "queued" | "running" | "waiting_approval" | "waiting_input",
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/runs/{runId}/stop-reason",
      tags: ["Usage"],
      security,
      summary: "Say why you stopped an agent's task (ADR 0128): the agent reads it",
      description:
        "Only who stopped it, once. The notice in that conversation (`meta.notice.kind = run_stopped`) gets the reason; 404 when the task wasn't stopped by a person.",
      request: {
        params: OrgParams.extend({ runId: z.uuid() }),
        body: body(z.object({ reason: z.string().min(1).max(STOP_REASON_MAX) })),
      },
      responses: { 200: json(z.object({ messageId: z.uuid() })), ...errors },
    }),
    async (c) => {
      const { orgId, runId } = c.req.valid("param");
      const { reason } = c.req.valid("json");
      const out = await setStopReason({ db, pubsub: adapters.pubsub }, c.get("user").id, orgId, runId, reason);
      return c.json(out, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/task-manager/{runId}/steps",
      tags: ["Usage"],
      security,
      summary: "A task's steps for the task manager (ADR 0128): what each call was and how it ended",
      description:
        "To whoever sees the task in the task manager. Never a connector's input or a tool's output (only a permission check's answer); the full trail (`GET …/runs/{runId}`) needs usage access. 404 when you don't see it.",
      request: { params: OrgParams.extend({ runId: z.uuid() }) },
      responses: {
        200: json(
          z.object({
            run: z.object({ createdAt: z.string(), finishedAt: z.string().nullable() }),
            steps: z.array(
              z.object({
                seq: z.number().int(),
                kind: z.enum(["tool_call", "tool_result", "model_call"]),
                data: z.record(z.string(), z.unknown()),
                createdAt: z.string(),
              }),
            ),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { orgId, runId } = c.req.valid("param");
      return c.json(await taskSteps(db, c.get("user").id, orgId, runId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/task-manager",
      tags: ["Usage"],
      security,
      summary: "The task manager (ADR 0128): what the agents are doing now, what each uses, and what ended",
      description:
        "Tasks in the conversations you are in (the `active-runs` rule), plus routines' background runs and agents' private conversations for admins and the agent's owner; the rest only as counts (`hidden`). No cost. `since` (default: the last 24 h) bounds `ended`.",
      request: {
        params: OrgParams,
        query: z.object({
          since: z.iso.datetime().optional(),
          doneToday: z
            .stringbool()
            .optional()
            .openapi({ description: "Also count your tasks done since `since` (`doneToday`)." }),
        }),
      },
      responses: { 200: json(TaskManagerView), ...errors },
    }),
    async (c) => {
      const { since, doneToday } = c.req.valid("query");
      const view = await taskManager(db, c.get("user").id, c.req.valid("param").orgId, {
        ...(since ? { since: new Date(since) } : {}),
        doneToday: doneToday ?? false,
      });
      return c.json(view, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/task-manager/continue",
      tags: ["Usage"],
      security,
      summary: "Continuar agora on several runs paused near a limit (ADR 0118): each goes on until that window resets",
      description:
        "For who may press it on each run's card or routine (`wait.canContinue`). Runs that moved on are skipped. Refused for every run, the first refusal comes back: 403 `run.answer_forbidden`, or 409 `run.continue_extra_off` / `run.continue_extra_used_up` when going on would pass the plan without paid extra usage.",
      request: {
        params: OrgParams,
        body: {
          required: true,
          content: { "application/json": { schema: z.object({ runIds: z.array(z.uuid()).min(1).max(100) }) } },
        },
      },
      responses: { 200: json(z.object({ continued: z.number().int() })), ...errors },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const { runIds } = c.req.valid("json");
      const out = await continuePausedRuns({ db, pubsub: adapters.pubsub }, c.get("user").id, orgId, runIds);
      if (out.continued > 0) deps.wakeWorkers?.();
      return c.json(out, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/organizations/{orgId}/runs/{runId}/continue",
      tags: ["Usage"],
      security,
      summary:
        "Continue a run a person stopped, or one that reached its step limit or stopped because it got stuck (same people as stopping it): a new run of the agent picks up where it stopped",
      description:
        "Only for a run stopped by a person while it worked, one that ended at its step limit (its reply has `meta.stepLimit`, with `stuck: true` when it stopped because it went in circles), or a catch-up skipped as already handled (\"Responder mesmo assim\" on its note, `meta.usageWait.closed`, ADR 0136: also anyone who asked in it, for 7 days; the new run reads the catch-up and can't pass, and that conversation isn't skipped again for 7 days); once per reply (`meta.canceled.continuedRunId`, `meta.stepLimit.continuedRunId`, `meta.usageWait.continuedRunId`). 409 `run.not_continuable` otherwise, 409 `run.agent_busy` while the agent already works in that conversation. The channel hears `run.continued`.",
      request: { params: OrgParams.extend({ runId: z.uuid() }) },
      responses: { 200: json(z.object({ runId: z.uuid() })), ...errors },
    }),
    async (c) => {
      const { orgId, runId } = c.req.valid("param");
      const result = await continueRun({ db, pubsub: adapters.pubsub }, c.get("user").id, orgId, runId);
      // Wake the workers now instead of waiting for the poll.
      deps.wakeWorkers?.();
      return c.json(result, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/organizations/{orgId}/usage/report",
      tags: ["Usage"],
      security,
      summary: "Spend by kind (agent, router, embedding, summary) and per agent with budgets (admins)",
      request: { params: OrgParams, query: z.object({ since: z.iso.datetime().optional() }) },
      responses: {
        200: json(
          z.object({
            since: z.string(),
            defaultAgentBudgetUsd: z.number().openapi({ description: "Budget of agents without their own." }),
            totalUsd: z.number(),
            platformBilled: z
              .object({ calls: z.number(), costUsd: z.number() })
              .openapi({ description: "Calls the server pays for (Jev), not in the total." }),
            byKind: z.array(
              z.object({
                kind: z.enum(["agent", "router", "embedding", "summary"]),
                calls: z.number(),
                partialCalls: z.number(),
                inputTokens: z.number(),
                outputTokens: z.number(),
                costUsd: z.number(),
              }),
            ),
            agents: z.array(
              z.object({
                agentId: z.uuid(),
                handle: z.string(),
                name: z.string(),
                calls: z.number(),
                inputTokens: z.number(),
                outputTokens: z.number(),
                costUsd: z.number(),
                monthlyBudgetUsd: z.number().openapi({ description: "Its effective budget (own or the default)." }),
                budgetIsDefault: z.boolean(),
                budgetUsedPercent: z.number(),
              }),
            ),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const r = await usageReport(db, c.get("user").id, c.req.valid("param").orgId, {
        since: q.since ? new Date(q.since) : undefined,
      });
      return c.json(
        {
          since: r.since.toISOString(),
          defaultAgentBudgetUsd: nanoUsdToUsd(r.defaultAgentBudgetNanoUsd),
          totalUsd: nanoUsdToUsd(r.totalNanoUsd),
          platformBilled: { calls: r.platformBilled.calls, costUsd: nanoUsdToUsd(r.platformBilled.costNanoUsd) },
          byKind: r.byKind.map(({ costNanoUsd, ...k }) => ({ ...k, costUsd: nanoUsdToUsd(costNanoUsd) })),
          agents: r.agents.map(({ costNanoUsd, monthlyBudgetNanoUsd, ...a }) => ({
            ...a,
            costUsd: nanoUsdToUsd(costNanoUsd),
            monthlyBudgetUsd: nanoUsdToUsd(monthlyBudgetNanoUsd),
          })),
        },
        200,
      );
    },
  );

  return app;
}
