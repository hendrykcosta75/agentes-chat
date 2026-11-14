import { createDashboardsApi } from "../dashboards/api";
import type { ChatPrefs } from "../lib/chat-look";
import { humanCheckHeaders } from "../lib/human-check";
import type { OnboardingStepId } from "../lib/onboarding";
import { type LodiPrefs, lodiPrefsOf } from "../lib/right-hand-prefs";
import { CLOUD_SERVER } from "../lib/server";
import { consultSeeds } from "../realtime/consults";
import { steerStore } from "../realtime/steer";
import type {
  VaultConnection,
  VaultImportResult,
  VaultItem,
  VaultItemDetail,
  VaultKeysImportResult,
  VaultOverview,
} from "../vault/types";
import type { HttpApi, OpenedWorkspace } from "./client";
import { ApiError, createFileRequester, createRequester, enc, type TransportOptions } from "./http";
import type {
  AccountDeletionPlan,
  AccountLoginStart,
  AccountLoginStatus,
  ActiveRun,
  Agent,
  AgentAccess,
  AgentAction,
  AgentBrain,
  AgentBrowserSettings,
  AgentChannel,
  AgentComputer,
  AgentDatabase,
  AgentDetail,
  AgentForYou,
  AgentGroup,
  AgentHolds,
  AgentLineChange,
  AgentMailbox,
  AgentPlanUsage,
  AgentProposal,
  AgentQuestion,
  AgentSecret,
  AgentSetupResult,
  AgentSkill,
  AgentStatus,
  AgentStyle,
  AgentUsage,
  AiAccounts,
  AiStatus,
  AppConsent,
  AppNotification,
  Approval,
  ApprovalCovers,
  ApprovalRule,
  AppsList,
  ArchivedChannel,
  Artifact,
  ArtifactDetail,
  ArtifactFilters,
  ArtifactPage,
  ArtifactVersion,
  AskToJoinResult,
  AuditPage,
  AuthConfig,
  BatchInviteResult,
  BlockState,
  BrainMachine,
  BrowserHandoff,
  BrowserProfile,
  CalendarEvent,
  CalendarRange,
  Channel,
  ChannelCard,
  ChannelCategory,
  ChannelMember,
  ChannelOverride,
  Choices,
  CliInstall,
  CodeSent,
  CommandApproval,
  ComposioUsage,
  ComputerDevice,
  ComputerQueue,
  ComputerSetup,
  ComputerTarget,
  Connection,
  ConnectLink,
  ConnectLinkState,
  ConnectOutcome,
  ConnectorCatalog,
  ConsultationConversation,
  CostlyDecision,
  CreatedPersonalToken,
  Credential,
  CustomConnectStart,
  CustomServer,
  DatabaseConnection,
  DatabaseTable,
  DesktopPictureView,
  DesktopRelease,
  DesktopStatus,
  DeviceAccount,
  DeviceRequest,
  DevicesList,
  DirectMessage,
  DmRead,
  EmailChange,
  EndpointCheck,
  EndpointModel,
  FeedbackFile,
  FeedbackOffer,
  ForeignMailbox,
  FormerAgent,
  GifKey,
  GifPage,
  GitHubAppInfo,
  GitHubAppInstallation,
  GitHubAppSetup,
  GitHubOrgAccess,
  GitHubRepositories,
  Health,
  HostComputer,
  IdRef,
  ImportedFile,
  ImportedSource,
  ImportPlan,
  Instance,
  Invitation,
  InvitationPreview,
  InvitationState,
  InvitationWithStatus,
  InviteLink,
  InviteLinkChanged,
  InviteLinkMade,
  Issue,
  IssueActivity,
  IssueColumn,
  IssueConversationRef,
  IssueProject,
  IssueProjectRef,
  IssueProjects,
  IssuesView,
  JevKey,
  JoinApproval,
  JoinClaim,
  JoinRequest,
  LearnedSkill,
  Machine,
  MachineAccess,
  MachineAccount,
  MachineOutages,
  MachinePause,
  MachineTask,
  MailAccount,
  MailFolder,
  MailProviders,
  Me,
  Member,
  Memory,
  Message,
  MessageCard,
  MessagePin,
  Mission,
  MissionBrain,
  MissionCommand,
  MissionCommandRule,
  MissionDecision,
  MissionDelivery,
  MissionEligibleAgent,
  MissionFiles,
  MissionJoinRequest,
  MissionList,
  MissionParticipants,
  MissionPlan,
  MissionReview,
  MissionSettings,
  MissionSummary,
  Model,
  MoveAgentsResult,
  MySuggestion,
  NewAgentSetup,
  NoticePrefs,
  NotificationCount,
  NotificationPage,
  OpenConsult,
  Organization,
  OrgOverview,
  OrgPlanUsage,
  OrgRoles,
  OrgSettings,
  PageTarget,
  PendingReturn,
  PeopleUsage,
  Person,
  PersonLimits,
  PersonUsage,
  PhoneDevice,
  PhoneSignIn,
  PlanServes,
  Poll,
  Proposal,
  ReactionCount,
  Reminder,
  RemovalPreview,
  RightHandApprovals,
  RoleMailLoss,
  RosterMember,
  Routine,
  RoutineHook,
  RoutineRun,
  RuleInfo,
  Run,
  RunConsultation,
  RunStep,
  SandboxSettings,
  ScheduleParse,
  ScopeGrant,
  SearchFilterInput,
  SearchHit,
  SecretRequest,
  ServerTelemetry,
  SidebarItem,
  SidebarItems,
  SidebarSection,
  SidebarView,
  SignInOptions,
  Skill,
  SkillDetail,
  SkillPick,
  SkillSettings,
  SkillSourceUpdate,
  SpeechKey,
  StartChoice,
  StorageConfig,
  StorageMigration,
  StorageTestResult,
  SuggestedAi,
  TaskManagerView,
  TaskOutput,
  TaskSteps,
  Team,
  TeamProposalCard,
  TeamTemplate,
  ThreadFilters,
  ThreadFollow,
  ThreadInfo,
  ThreadPage,
  TrashedArtifact,
  UndoAllResult,
  UnreadTask,
  UsageQueue,
  UsageReport,
  WaitingList,
  WebhookSetup,
  WifiIphones,
  WifiPairing,
  WikiGraph,
  WikiImportResult,
  WikiPage,
  WikiPageSummary,
  WikiTopRead,
  WikiVersion,
  WorkingRun,
  WorkspaceActionCard,
  WorkspaceActionCardView,
  WorkspaceLimits,
  XcodeFixView,
} from "./types";

/** Search filters as query parameters (lists comma-separated). */
const filterQuery = (f: SearchFilterInput | undefined) =>
  f
    ? Object.fromEntries(
        Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") || undefined : v === true ? "true" : v]),
      )
    : {};

const pageBody = (to: PageTarget) => (typeof to === "string" ? { url: to } : to);
const org = (orgId: string) => `/api/app/organizations/${enc(orgId)}`;
/** The most agents one `POST …/agent-setup` takes (the server's `SETUP_AGENTS_MAX`). */
const SETUP_AGENTS_PER_CALL = 200;

/** The server's health: 200 while it serves, 503 while it drains or its database is down. */
export const HEALTH_PATH = "/api/health";

/** The list's query string (booleans as "true"; nothing for what isn't set). */
const threadQuery = (f: Partial<ThreadFilters>) => ({
  tab: f.tab,
  channelId: f.channelId,
  agentId: f.agentId,
  needsYou: f.needsYou ? "true" : undefined,
  mine: f.mine ? "true" : undefined,
  q: f.q?.trim() || undefined,
  cursor: f.cursor,
  limit: f.limit,
});

const csv = (list: readonly string[] | undefined) => (list?.length ? list.join(",") : undefined);

/** The Drive's filters as `GET …/artifacts` reads them. */
const artifactQuery = (f: ArtifactFilters) => ({
  q: f.q,
  kind: f.kind,
  kinds: csv(f.kinds),
  channelId: f.channelId,
  channelIds: csv(f.channelIds),
  authorType: f.author?.type,
  authorId: f.author?.id,
  changed: f.changed && f.author ? "1" : undefined,
  authors: csv(f.authors?.map((a) => `${a.type}:${a.id}`)),
  who: f.who,
  sort: f.sort && f.sort !== "recent" ? f.sort : undefined,
});

/**
 * The real backend: `/api/health` and `/api/app/*` (apps/server/src/routes/app).
 * The web app calls it with no options (same origin, its cookie). The phone app
 * passes `baseUrl` and `headers` (its session cookie and `X-Agentes-Client`),
 * merged into every request, JSON and files alike.
 */
export function createHttpApi(options: TransportOptions = {}): HttpApi {
  const request = createRequester(options);
  const files = createFileRequester(options);
  // agentes.chat itself, for its public answers (the desktop app's newest build): another origin, no cookie.
  const cloud = createRequester({ baseUrl: CLOUD_SERVER, ...(options.fetch ? { fetch: options.fetch } : {}) });
  /** Prefix for URLs the platform opens itself (file links); "" on the web. */
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");
  const nullOn = async <T>(status: number, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ApiError && error.status === status) return null;
      throw error;
    }
  };

  return {
    actions: {
      undo: (orgId, actionId) => request<AgentAction>(`${org(orgId)}/actions/${enc(actionId)}/undo`, { json: {} }),
      redo: (orgId, actionId) => request<AgentAction>(`${org(orgId)}/actions/${enc(actionId)}/redo`, { json: {} }),
      undoMessage: (orgId, messageId) =>
        request<UndoAllResult>(`${org(orgId)}/messages/${enc(messageId)}/actions/undo`, { json: {} }),
    },
    actionCards: {
      get: (orgId, messageId) => request<WorkspaceActionCardView>(`${org(orgId)}/action-cards/${enc(messageId)}`),
      decide: (orgId, messageId, decision, knows) =>
        request<{ card: WorkspaceActionCard }>(`${org(orgId)}/action-cards/${enc(messageId)}/${decision}`, {
          json: knows ? { knows } : {},
        }),
    },
    agentForYou: {
      get: (orgId, agentId, limit) =>
        request<AgentForYou>(`${org(orgId)}/agents/${enc(agentId)}/for-you`, { query: { limit } }),
    },
    pins: {
      list: async (orgId, channelId) =>
        (await request<{ pins: MessagePin[] }>(`${org(orgId)}/channels/${enc(channelId)}/pins`)).pins,
      pin: (orgId, channelId, messageId) =>
        request<MessagePin>(`${org(orgId)}/channels/${enc(channelId)}/pins/${enc(messageId)}`, { json: {} }),
      unpin: (orgId, channelId, messageId) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/pins/${enc(messageId)}`, { method: "DELETE" }),
    },
    threadFollows: {
      follow: (orgId, threadId) =>
        request<ThreadFollow>(`${org(orgId)}/threads/${enc(threadId)}/follow`, { method: "PUT", json: {} }),
      unfollow: (orgId, threadId) =>
        request<ThreadFollow>(`${org(orgId)}/threads/${enc(threadId)}/follow`, { method: "DELETE" }),
    },
    reads: {
      mute: (orgId, channelId, muted) =>
        request<void>(
          `${org(orgId)}/channels/${enc(channelId)}/mute`,
          muted ? { method: "PUT", json: {} } : { method: "DELETE" },
        ),
      markThreadRead: (orgId, threadId) => request<void>(`${org(orgId)}/threads/${enc(threadId)}/read`, { json: {} }),
      unreadThreads: async (orgId) => (await request<{ count: number }>(`${org(orgId)}/unread-threads`)).count,
      unreadTasks: async (orgId) => (await request<{ tasks: UnreadTask[] }>(`${org(orgId)}/unread-tasks`)).tasks,
    },
    working: {
      list: async (orgId) => (await request<{ runs: WorkingRun[] }>(`${org(orgId)}/active-runs`)).runs,
      taskManager: (orgId, since, doneToday) =>
        request<TaskManagerView>(`${org(orgId)}/task-manager`, {
          query: { since: since || undefined, doneToday: doneToday ? "true" : undefined },
        }),
      taskSteps: (orgId, runId) => request<TaskSteps>(`${org(orgId)}/task-manager/${enc(runId)}/steps`),
      continueTasks: (orgId, runIds) =>
        request<{ continued: number }>(`${org(orgId)}/task-manager/continue`, { json: { runIds } }),
    },
    mail: {
      providers: (orgId) => request<MailProviders>(`${org(orgId)}/mail/providers`),
      accounts: async (orgId) => (await request<{ accounts: MailAccount[] }>(`${org(orgId)}/mail/accounts`)).accounts,
      connectImap: async (orgId, input) =>
        (await request<{ account: MailAccount }>(`${org(orgId)}/mail/accounts/imap`, { json: input })).account,
      connectComposio: (orgId, input) =>
        request<{ accountId: string; redirectUrl: string }>(`${org(orgId)}/mail/accounts/composio`, { json: input }),
      update: async (orgId, accountId, input) =>
        (
          await request<{ account: MailAccount }>(`${org(orgId)}/mail/accounts/${enc(accountId)}`, {
            method: "PATCH",
            json: input,
          })
        ).account,
      disconnect: (orgId, accountId) =>
        request<void>(`${org(orgId)}/mail/accounts/${enc(accountId)}`, { method: "DELETE" }),
      suggestedAddresses: async (orgId, accountId) =>
        (await request<{ addresses: string[] }>(`${org(orgId)}/mail/accounts/${enc(accountId)}/suggested-addresses`))
          .addresses,
      folders: async (orgId, accountId) =>
        (await request<{ folders: MailFolder[] }>(`${org(orgId)}/mail/accounts/${enc(accountId)}/folders`)).folders,
      agent: async (orgId, agentId) =>
        (await request<{ mailboxes: AgentMailbox[] }>(`${org(orgId)}/agents/${enc(agentId)}/mail`)).mailboxes,
      setAgent: (orgId, agentId, accountId, input) =>
        request<AgentMailbox>(`${org(orgId)}/agents/${enc(agentId)}/mail/${enc(accountId)}`, {
          method: "PUT",
          json: input,
        }),
    },
    databases: {
      list: async (orgId) =>
        (await request<{ connections: DatabaseConnection[] }>(`${org(orgId)}/databases`)).connections,
      connect: async (orgId, input) =>
        (await request<{ connection: DatabaseConnection }>(`${org(orgId)}/databases`, { json: input })).connection,
      update: async (orgId, connectionId, input) =>
        (
          await request<{ connection: DatabaseConnection }>(`${org(orgId)}/databases/${enc(connectionId)}`, {
            method: "PATCH",
            json: input,
          })
        ).connection,
      disconnect: (orgId, connectionId) =>
        request<void>(`${org(orgId)}/databases/${enc(connectionId)}`, { method: "DELETE" }),
      tables: async (orgId, connectionId, database) =>
        (
          await request<{ tables: DatabaseTable[] }>(
            `${org(orgId)}/databases/${enc(connectionId)}/tables${database ? `?database=${enc(database)}` : ""}`,
          )
        ).tables,
      serverDatabases: async (orgId, connectionId, refresh) =>
        (
          await request<{ databases: string[] }>(
            `${org(orgId)}/databases/${enc(connectionId)}/databases${refresh ? "?refresh=1" : ""}`,
          )
        ).databases,
      agent: async (orgId, agentId) =>
        (await request<{ databases: AgentDatabase[] }>(`${org(orgId)}/agents/${enc(agentId)}/databases`)).databases,
      setAgent: (orgId, agentId, connectionId, input) =>
        request<AgentDatabase>(`${org(orgId)}/agents/${enc(agentId)}/databases/${enc(connectionId)}`, {
          method: "PUT",
          json: input,
        }),
    },
    browser: {
      settings: (orgId, agentId) => request<AgentBrowserSettings>(`${org(orgId)}/agents/${enc(agentId)}/browser`),
      setDomains: (orgId, agentId, allowedDomains) =>
        request<AgentBrowserSettings>(`${org(orgId)}/agents/${enc(agentId)}/browser`, {
          method: "PUT",
          json: { allowedDomains },
        }),
      agentHandoff: async (orgId, agentId, screen = "browser", seat) =>
        (
          await request<{ handoff: BrowserHandoff | null }>(`${org(orgId)}/agents/${enc(agentId)}/${screen}/handoff`, {
            query: seat ? { seat } : {},
          })
        ).handoff,
      agentControl: async (orgId, agentId, screen = "browser", seat) =>
        (
          await request<{ canControl: boolean }>(`${org(orgId)}/agents/${enc(agentId)}/${screen}/control`, {
            query: seat ? { seat } : {},
          })
        ).canControl,
      handoff: (orgId, handoffId) => request<BrowserHandoff>(`${org(orgId)}/browser/handoffs/${enc(handoffId)}`),
      takeControl: (orgId, handoffId) =>
        request<BrowserHandoff>(`${org(orgId)}/browser/handoffs/${enc(handoffId)}/control`, { json: {} }),
      done: (orgId, handoffId, note) =>
        request<BrowserHandoff>(`${org(orgId)}/browser/handoffs/${enc(handoffId)}/done`, {
          json: note ? { note } : {},
        }),
      failed: (orgId, handoffId, note) =>
        request<BrowserHandoff>(`${org(orgId)}/browser/handoffs/${enc(handoffId)}/failed`, {
          json: note ? { note } : {},
        }),
      cancel: (orgId, handoffId) =>
        request<BrowserHandoff>(`${org(orgId)}/browser/handoffs/${enc(handoffId)}/cancel`, { json: {} }),
      takeover: (orgId, agentId, runId, screen = "browser", seat) =>
        request<BrowserHandoff>(`${org(orgId)}/agents/${enc(agentId)}/${screen}/takeover`, {
          json: { ...(runId ? { runId } : {}), ...(seat ? { seat } : {}) },
        }),
      open: (orgId, agentId, to) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/browser/open`, { json: pageBody(to) }),
      stop: (orgId, agentId, seat) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/browser/stop`, { json: {}, query: seat ? { seat } : {} }),
      restart: (orgId, agentId) => request<void>(`${org(orgId)}/agents/${enc(agentId)}/browser/restart`, { json: {} }),
    },
    browserProfiles: {
      list: async (orgId, machineId) =>
        (
          await request<{ profiles: BrowserProfile[] }>(`${org(orgId)}/browser-profiles`, {
            query: machineId ? { machineId } : {},
          })
        ).profiles,
      create: (orgId, input) => request<BrowserProfile>(`${org(orgId)}/browser-profiles`, { json: input }),
      update: (orgId, profileId, input) =>
        request<BrowserProfile>(`${org(orgId)}/browser-profiles/${enc(profileId)}`, { method: "PATCH", json: input }),
      remove: (orgId, profileId) =>
        request<void>(`${org(orgId)}/browser-profiles/${enc(profileId)}`, { method: "DELETE" }),
      takeover: (orgId, profileId) =>
        request<BrowserProfile>(`${org(orgId)}/browser-profiles/${enc(profileId)}/takeover`, { json: {} }),
      handback: (orgId, profileId) =>
        request<BrowserProfile>(`${org(orgId)}/browser-profiles/${enc(profileId)}/handback`, { json: {} }),
      open: (orgId, profileId, to) =>
        request<void>(`${org(orgId)}/browser-profiles/${enc(profileId)}/open`, { json: pageBody(to) }),
      setDefault: (orgId, agentId, profileId) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/browser-profile`, { method: "PUT", json: { profileId } }),
      request: (orgId, agentId) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/browser-profile/request`, { json: {} }),
    },
    desktop: {
      status: (orgId, agentId, seat) =>
        request<DesktopStatus>(`${org(orgId)}/agents/${enc(agentId)}/desktop`, { query: seat ? { seat } : {} }),
      picture: (orgId, agentId, seat) =>
        request<DesktopPictureView>(`${org(orgId)}/agents/${enc(agentId)}/desktop/picture`, {
          query: seat ? { seat } : {},
        }),
      holds: (orgId, agentId) => request<AgentHolds>(`${org(orgId)}/agents/${enc(agentId)}/holds`),
      stopHold: (orgId, agentId, holdId) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/holds/${enc(holdId)}`, { method: "DELETE" }),
    },
    vault: {
      overview: (orgId) => request<VaultOverview>(`${org(orgId)}/vault`),
      item: (orgId, itemId) => request<VaultItemDetail>(`${org(orgId)}/vault/items/${enc(itemId)}`),
      create: (orgId, input) => request<VaultItem>(`${org(orgId)}/vault/items`, { json: input }),
      update: (orgId, itemId, patch) =>
        request<VaultItem>(`${org(orgId)}/vault/items/${enc(itemId)}`, { method: "PATCH", json: patch }),
      remove: (orgId, itemId) => request<void>(`${org(orgId)}/vault/items/${enc(itemId)}`, { method: "DELETE" }),
      importCsv: (orgId, input) => request<VaultImportResult>(`${org(orgId)}/vault/import`, { json: input }),
      importKeys: (orgId, input) => request<VaultKeysImportResult>(`${org(orgId)}/vault/keys`, { json: input }),
      move: (orgId, itemId, scope) =>
        request<VaultItem>(`${org(orgId)}/vault/items/${enc(itemId)}/move`, { json: { scope } }),
      connect: (orgId, input) => request<VaultConnection>(`${org(orgId)}/vault/connections`, { json: input }),
      updateConnection: (orgId, connectionId, patch) =>
        request<VaultConnection>(`${org(orgId)}/vault/connections/${enc(connectionId)}`, {
          method: "PATCH",
          json: patch,
        }),
      syncConnection: (orgId, connectionId) =>
        request<VaultConnection>(`${org(orgId)}/vault/connections/${enc(connectionId)}/sync`, { json: {} }),
      removeConnection: (orgId, connectionId) =>
        request<void>(`${org(orgId)}/vault/connections/${enc(connectionId)}`, { method: "DELETE" }),
    },
    gifs: {
      search: (orgId, query) =>
        request<GifPage>(`${org(orgId)}/gifs`, {
          query: {
            q: query.q?.trim() || undefined,
            category: query.category ?? undefined,
            offset: query.offset || undefined,
            limit: query.limit,
            lang: query.lang,
          },
        }),
    },
    reminders: {
      create: (orgId, input) => request<Reminder>(`${org(orgId)}/reminders`, { json: input }),
      list: async (orgId) => (await request<{ reminders: Reminder[] }>(`${org(orgId)}/reminders`)).reminders,
      cancel: (orgId, reminderId) =>
        request<Reminder>(`${org(orgId)}/reminders/${enc(reminderId)}`, { method: "DELETE" }),
    },
    system: {
      health: async () => {
        try {
          return await request<Health>(HEALTH_PATH);
        } catch (error) {
          // 503 still carries the edition; anything else: assume Cloud.
          if (error instanceof ApiError) return { status: "degraded", version: "", edition: "cloud" };
          throw error;
        }
      },
      instance: () => request<Instance>("/api/instance"),
      telemetry: () => nullOn(404, () => request<ServerTelemetry>("/api/app/telemetry")),
      setTelemetry: (enabled) => request<ServerTelemetry>("/api/app/telemetry", { method: "PUT", json: { enabled } }),
      sendFeedback: (input) => request<void>("/api/app/feedback", { json: input }),
      uploadFeedbackFile: (file) => {
        const form = new FormData();
        form.append("file", file, file.name);
        return files.upload<FeedbackFile>("/api/app/feedback/files", form);
      },
      dropFeedbackFile: (id) => request<void>(`/api/app/feedback/files/${enc(id)}`, { method: "DELETE" }),
      decideFeedbackOffer: async (orgId, messageId, decision) =>
        (
          await request<{ offer: FeedbackOffer }>(`/api/app/feedback/offers/${enc(messageId)}`, {
            json: { orgId, decision },
          })
        ).offer,
      jev: () => nullOn(404, () => request<JevKey>("/api/app/jev")),
      saveJev: (apiKey) => request<JevKey>("/api/app/jev", { method: "PUT", json: { apiKey } }),
      checkJev: () => request<JevKey>("/api/app/jev/check", { method: "POST" }),
      removeJev: () => request<JevKey>("/api/app/jev", { method: "DELETE" }),
      gifKey: () => nullOn(404, () => request<GifKey>("/api/app/gif-key")),
      saveGifKey: (apiKey) => request<GifKey>("/api/app/gif-key", { method: "PUT", json: { apiKey } }),
      removeGifKey: () => request<GifKey>("/api/app/gif-key", { method: "DELETE" }),
      speechKey: () => nullOn(404, () => request<SpeechKey>("/api/app/speech-key")),
      saveSpeechKey: (input) => request<SpeechKey>("/api/app/speech-key", { method: "PUT", json: input }),
      removeSpeechKey: () => request<SpeechKey>("/api/app/speech-key", { method: "DELETE" }),
    },
    account: {
      authConfig: () => request<AuthConfig>("/api/app/auth-config"),
      signInOptions: (input, humanCheck) =>
        request<SignInOptions>("/api/app/sign-in-options", { json: input, headers: humanCheckHeaders(humanCheck) }),
      me: () => nullOn(401, () => request<Me>("/api/app/me")),
      unread: () =>
        nullOn(401, () =>
          request<{ organizations: { orgId: string; unread: number; waiting: number }[] }>("/api/app/me/unread"),
        ),
      deviceAccounts: async () =>
        (await nullOn(404, () => request<{ accounts: DeviceAccount[] }>("/api/app/device-accounts")))?.accounts ?? [],
      switchDeviceAccount: (userId) =>
        request<void>("/api/app/device-accounts/switch", { method: "POST", json: { userId } }),
      signOutDeviceAccount: (userId) =>
        request<{ signedIn: boolean }>("/api/app/device-accounts/sign-out", {
          method: "POST",
          json: userId ? { userId } : {},
        }),
      updateMe: (input) => request<void>("/api/app/me", { method: "PATCH", json: input }),
      setWorkArea: (area) => request<void>("/api/app/me/work-area", { method: "PUT", json: { area } }),
      phoneSignIn: () => request<PhoneSignIn>("/api/app/phone-sign-in", { json: {} }),
      addPassword: (password) => request<void>("/api/app/me/password", { json: { password } }),
      deletionPlan: () => request<AccountDeletionPlan>("/api/app/account/deletion"),
      deletionCode: () => request<CodeSent>("/api/app/account/deletion/code", { json: {} }),
      delete: (input = {}) => request<void>("/api/app/account", { method: "DELETE", json: input }),
      restore: () => request<void>("/api/app/account/deletion", { method: "DELETE" }),
      changeEmail: (input) => request<EmailChange>("/api/app/account/email", { json: input }),
      undoEmailChange: (token) => request<{ email: string }>("/api/app/email-undo", { json: { token } }),
    },
    push: {
      webKey: async () =>
        (await nullOn(404, () => request<{ publicKey: string }>("/api/app/push/web")))?.publicKey ?? null,
      register: (input) => request<void>("/api/app/push/devices", { json: input }),
      unregister: (token) => request<void>("/api/app/push/devices/forget", { json: { token } }),
      stale: async (ids) => (await request<{ stale: string[] }>("/api/app/push/stale", { json: { ids } })).stale,
    },
    orgs: {
      create: (input) =>
        request<{ organization: Organization; generalChannelId: string } & OpenedWorkspace>("/api/app/organizations", {
          json: input,
        }),
      saveOnboarding: (orgId, input) =>
        nullOn(404, () =>
          request<{ step: OnboardingStepId; finished: boolean } & OpenedWorkspace>(`${org(orgId)}/onboarding`, {
            method: "PATCH",
            json: input,
          }),
        ),
      get: (orgId) => request<Organization>(org(orgId)),
      deletionCode: (orgId) => request<CodeSent>(`${org(orgId)}/deletion/code`, { json: {} }),
      deleteWorkspace: async (orgId, input = {}) =>
        (await request<{ deletion: { dueAt: string } }>(`${org(orgId)}/deletion`, { json: input })).deletion,
      restore: (orgId) => request<void>(`${org(orgId)}/deletion`, { method: "DELETE" }),
      setAvatar: (orgId, input) =>
        request<{ avatarUrl: string }>(`${org(orgId)}/me/avatar`, { method: "PUT", json: input }),
      removeAvatar: (orgId) => request<void>(`${org(orgId)}/me/avatar`, { method: "DELETE" }),
      setLogo: (orgId, input) => request<{ logo: string }>(`${org(orgId)}/logo`, { method: "PUT", json: input }),
      removeLogo: (orgId) => request<void>(`${org(orgId)}/logo`, { method: "DELETE" }),
      billingLink: (orgId, from, returnTo, plan) =>
        request<{ url: string; expiresAt: string }>(`${org(orgId)}/billing-link`, {
          json: { from, returnTo, ...(plan ? { plan } : {}) },
        }),
      limits: (orgId) => request<WorkspaceLimits>(`${org(orgId)}/limits`),
      updateMe: (orgId, input) => request<Person>(`${org(orgId)}/me`, { method: "PATCH", json: input }),
      setStatus: (orgId, input) => request<Person>(`${org(orgId)}/me/status`, { method: "PUT", json: input }),
      setStart: (orgId, input) => request<StartChoice>(`${org(orgId)}/me/start`, { method: "PUT", json: input }),
      setShowActivity: async (orgId, show) =>
        (await request<{ show: boolean }>(`${org(orgId)}/me/activity`, { method: "PUT", json: { show } })).show,
      setAgentStyle: async (orgId, style) =>
        (await request<{ style: AgentStyle }>(`${org(orgId)}/me/agent-style`, { method: "PUT", json: { style } }))
          .style,
      setChatPrefs: (orgId, patch) => request<ChatPrefs>(`${org(orgId)}/me/chat`, { method: "PUT", json: patch }),
      sidebarItems: async (orgId) => (await request<{ items: SidebarItems }>(`${org(orgId)}/me/sidebar`)).items,
      setSidebarItem: async (orgId, item, place) =>
        (await request<{ items: SidebarItems }>(`${org(orgId)}/me/sidebar`, { method: "PATCH", json: { item, place } }))
          .items,
      setSidebarItems: async (orgId, items) =>
        (await request<{ items: SidebarItems }>(`${org(orgId)}/me/sidebar`, { method: "PUT", json: { items } })).items,
      sidebarOrder: async (orgId) =>
        (await request<{ order: SidebarSection[] }>(`${org(orgId)}/me/sidebar/order`)).order,
      setSidebarOrder: async (orgId, order) =>
        (
          await request<{ order: SidebarSection[] }>(`${org(orgId)}/me/sidebar/order`, {
            method: "PUT",
            json: { order },
          })
        ).order,
      issuesView: async (orgId) => (await request<{ view: IssuesView }>(`${org(orgId)}/me/issues-view`)).view,
      setIssuesView: async (orgId, view) =>
        (await request<{ view: IssuesView }>(`${org(orgId)}/me/issues-view`, { method: "PUT", json: { view } })).view,
      sidebarView: async (orgId) => (await request<{ view: SidebarView }>(`${org(orgId)}/me/sidebar/view`)).view,
      setSidebarView: async (orgId, view) =>
        (await request<{ view: SidebarView }>(`${org(orgId)}/me/sidebar/view`, { method: "PUT", json: { view } })).view,
      sidebarToolOrder: async (orgId) =>
        (await request<{ order: SidebarItem[] }>(`${org(orgId)}/me/sidebar/tools`)).order,
      setSidebarToolOrder: async (orgId, order) =>
        (await request<{ order: SidebarItem[] }>(`${org(orgId)}/me/sidebar/tools`, { method: "PUT", json: { order } }))
          .order,
      update: (orgId, input) => request<void>(org(orgId), { method: "PATCH", json: input }),
      members: async (orgId) => (await request<{ members: Member[] }>(`${org(orgId)}/members`)).members,
      changeRole: (orgId, userId, role, via) =>
        request<void>(`${org(orgId)}/members/${enc(userId)}`, {
          method: "PATCH",
          json: { role },
          query: via ? { via } : {},
        }),
      removal: (orgId, userId) => request<RemovalPreview>(`${org(orgId)}/members/${enc(userId)}/removal`),
      removeMember: (orgId, userId, via) =>
        request<void>(`${org(orgId)}/members/${enc(userId)}`, { method: "DELETE", query: via ? { via } : {} }),
      passwordLink: (orgId, userId) =>
        request<{ url: string; expiresAt: string }>(`${org(orgId)}/members/${enc(userId)}/password-link`, {
          method: "POST",
          json: {},
        }),
      invitations: async (orgId) =>
        (await request<{ invitations: Invitation[] }>(`${org(orgId)}/invitations`)).invitations,
      invite: (orgId, input) =>
        request<{ invitation: Invitation; url: string }>(`${org(orgId)}/invitations`, { json: input }),
      revokeInvitation: (orgId, id) => request<void>(`${org(orgId)}/invitations/${enc(id)}`, { method: "DELETE" }),
      previewInvitation: (token) => nullOn(404, () => request<InvitationPreview>(`/api/app/invitations/${enc(token)}`)),
      invitationState: (token) =>
        nullOn(404, () => request<InvitationState>(`/api/app/invitations/${enc(token)}/state`)),
      acceptInvitation: (token, mail) =>
        request<{ orgId: string }>(
          `/api/app/invitations/${enc(token)}/accept${mail ? `?${new URLSearchParams({ mail })}` : ""}`,
          { json: {} },
        ),
      settings: (orgId) => request<OrgSettings>(`${org(orgId)}/settings`),
      updateSettings: (orgId, input) =>
        request<OrgSettings>(`${org(orgId)}/settings`, { method: "PATCH", json: input }),
      overview: (orgId) => request<OrgOverview>(`${org(orgId)}/overview`),
      people: async (orgId) => (await request<{ people: Person[] }>(`${org(orgId)}/people`)).people,
      allInvitations: async (orgId) =>
        (await request<{ invitations: InvitationWithStatus[] }>(`${org(orgId)}/invitations/all`)).invitations,
      inviteMany: async (orgId, input) =>
        (await request<{ results: BatchInviteResult[] }>(`${org(orgId)}/invitations/batch`, { json: input })).results,
      resendInvitation: (orgId, id) =>
        request<{ url: string; expiresAt: string }>(`${org(orgId)}/invitations/${enc(id)}/resend`, { json: {} }),
      updateInvitation: (orgId, id, change) =>
        request<{ roleIds: string[]; channelIds: string[]; agentIds: string[] }>(
          `${org(orgId)}/invitations/${enc(id)}`,
          {
            method: "PATCH",
            json: change,
          },
        ),
      usageReport: (orgId, since) => request<UsageReport>(`${org(orgId)}/usage/report`, { query: { since } }),
      planUsage: (orgId) => request<OrgPlanUsage>(`${org(orgId)}/usage/plans`),
      peopleUsage: (orgId, period = {}) => request<PeopleUsage>(`${org(orgId)}/usage/people`, { query: period }),
      peopleUsageCsvUrl: (orgId, period = {}) => {
        const qs = new URLSearchParams(Object.entries(period).filter((e): e is [string, string] => !!e[1]));
        return `${base}${org(orgId)}/usage/people.csv${qs.size ? `?${qs}` : ""}`;
      },
      personUsage: (orgId, userId, period = {}) =>
        request<PersonUsage>(`${org(orgId)}/usage/people/${enc(userId)}`, { query: period }),
      personLimits: (orgId) => request<PersonLimits>(`${org(orgId)}/usage/limits`),
      setPersonLimits: (orgId, limits) =>
        request<PersonLimits>(`${org(orgId)}/usage/limits`, { method: "PUT", json: limits }),
      requestMoreUsage: (orgId) => request<{ requestedAt: string }>(`${org(orgId)}/usage/limits/request`, { json: {} }),
      raisePersonLimit: (orgId, userId, limitUsd) =>
        request<void>(`${org(orgId)}/usage/people/${enc(userId)}/raise`, { json: { limitUsd } }),
      refuseMoreUsage: (orgId, userId) =>
        request<void>(`${org(orgId)}/usage/people/${enc(userId)}/refuse`, { json: {} }),
      teamWeek: (orgId) => request<LodiPrefs>(`${org(orgId)}/team-week`).then(lodiPrefsOf),
      setTeamWeek: (orgId, patch) =>
        request<LodiPrefs>(`${org(orgId)}/team-week`, { method: "PUT", json: patch }).then(lodiPrefsOf),
      actOnTeamWeek: (orgId, messageId, act) =>
        request<void>(`${org(orgId)}/team-week/${enc(messageId)}`, { json: act }),
      audit: (orgId, query = {}) =>
        request<AuditPage>(`${org(orgId)}/audit`, {
          query: {
            actorType: query.actorType,
            actorId: query.actorId,
            via: query.via,
            outcome: query.outcome?.length ? query.outcome.join(",") : undefined,
            waiting: query.waiting ? "true" : undefined,
            kind: query.kind,
            before: query.before,
            limit: query.limit,
          },
        }),
    },
    roles: {
      list: (orgId) => request<OrgRoles>(`${org(orgId)}/roles`),
      create: (orgId, input) => request<{ id: string }>(`${org(orgId)}/roles`, { json: input }),
      update: (orgId, roleId, patch) =>
        request<void>(`${org(orgId)}/roles/${enc(roleId)}`, { method: "PATCH", json: patch }),
      remove: (orgId, roleId) => request<void>(`${org(orgId)}/roles/${enc(roleId)}`, { method: "DELETE" }),
      reorder: (orgId, ids) => request<void>(`${org(orgId)}/roles/order`, { method: "PUT", json: { ids } }),
      setFor: (orgId, userId, roleIds, via, mailLossSeen) =>
        request<{ roleIds: string[] }>(`${org(orgId)}/members/${enc(userId)}/roles`, {
          method: "PUT",
          json: { roleIds, ...(mailLossSeen ? { mailLossSeen } : {}) },
          query: via ? { via } : {},
        }),
      setRow: (orgId, row, holders) =>
        request<OrgRoles>(`${org(orgId)}/permissions/${enc(row)}`, { method: "PUT", json: holders }),
      mailLoss: async (orgId, roleId, userIds) =>
        (
          await request<{ mailboxes: RoleMailLoss[] }>(`${org(orgId)}/roles/${enc(roleId)}/members/preview`, {
            json: { userIds },
          })
        ).mailboxes,
    },
    agentGroups: {
      list: async (orgId) => (await request<{ groups: AgentGroup[] }>(`${org(orgId)}/agent-groups`)).groups,
      create: async (orgId, input) =>
        (await request<{ groups: AgentGroup[] }>(`${org(orgId)}/agent-groups`, { json: input })).groups,
      update: async (orgId, groupId, patch) =>
        (
          await request<{ groups: AgentGroup[] }>(`${org(orgId)}/agent-groups/${enc(groupId)}`, {
            method: "PATCH",
            json: patch,
          })
        ).groups,
      remove: async (orgId, groupId) =>
        (await request<{ groups: AgentGroup[] }>(`${org(orgId)}/agent-groups/${enc(groupId)}`, { method: "DELETE" }))
          .groups,
      move: async (orgId, agentId, input) =>
        (
          await request<{ groups: AgentGroup[] }>(`${org(orgId)}/agents/${enc(agentId)}/group`, {
            method: "PUT",
            json: input,
          })
        ).groups,
    },
    agents: {
      list: async (orgId) => (await request<{ agents: Agent[] }>(`${org(orgId)}/agents`)).agents,
      planUsage: (orgId, agentId) => request<AgentPlanUsage>(`${org(orgId)}/agents/${enc(agentId)}/usage`),
      team: (orgId) => request<Team>(`${org(orgId)}/team`),
      setLines: (orgId, changes) =>
        request<{ previous: AgentLineChange[] }>(`${org(orgId)}/agent-lines`, { method: "PUT", json: { changes } }),
      proposeChannelMove: (orgId, input) => request(`${org(orgId)}/team/channel-move`, { json: input }),
      create: (orgId, input) => request<Agent>(`${org(orgId)}/agents`, { json: input }),
      proposal: (orgId, messageId) => request<AgentProposal>(`${org(orgId)}/agent-proposals/${enc(messageId)}`),
      denyProposal: (orgId, messageId) =>
        request<AgentProposal>(`${org(orgId)}/agent-proposals/${enc(messageId)}/deny`, { json: {} }),
      createProposed: (orgId, messageId, options) =>
        request<{ agent: Agent; proposal: AgentProposal; ai: SuggestedAi["kind"]; testChannelId?: string | null }>(
          `${org(orgId)}/agent-proposals/${enc(messageId)}/create`,
          { json: options?.test ? { test: true } : {} },
        ),
      askProposal: (orgId, messageId) =>
        request<AgentProposal>(`${org(orgId)}/agent-proposals/${enc(messageId)}/ask`, { json: {} }),
      createTeam: (orgId, messageId) =>
        request<{ card: TeamProposalCard; noAi?: string[] }>(`${org(orgId)}/team-proposals/${enc(messageId)}/create`, {
          json: {},
        }),
      denyTeam: (orgId, messageId) =>
        request<{ card: TeamProposalCard }>(`${org(orgId)}/team-proposals/${enc(messageId)}/deny`, { json: {} }),
      undoTeam: (orgId, messageId) =>
        request<{ card: TeamProposalCard }>(`${org(orgId)}/team-proposals/${enc(messageId)}/undo`, { json: {} }),
      adjustTeamAgent: (orgId, messageId, handle, patch) =>
        request<{ card: TeamProposalCard }>(`${org(orgId)}/team-proposals/${enc(messageId)}/agents/${enc(handle)}`, {
          method: "PATCH",
          json: patch,
        }),
      teamTemplates: async (orgId, locale) =>
        (
          await request<{ templates: TeamTemplate[] }>(`${org(orgId)}/team-templates`, {
            ...(locale ? { query: { locale } } : {}),
          })
        ).templates,
      applyTeamTemplate: (orgId, templateId, locale) =>
        request<{
          channelId: string;
          messageId: string;
          state: TeamProposalCard["state"];
          error: TeamProposalCard["error"] | null;
        }>(`${org(orgId)}/team-templates/${enc(templateId)}/use`, { json: locale ? { locale } : {} }),
      decideCostly: (orgId, signalId, decision) =>
        request<{ state: CostlyDecision }>(`${org(orgId)}/autonomy-proposals/${enc(signalId)}`, {
          json: { decision },
        }),
      proposalRoutine: (orgId, messageId) =>
        request<AgentProposal>(`${org(orgId)}/agent-proposals/${enc(messageId)}/routine`, { json: {} }),
      update: (orgId, agentId, input) =>
        request<Agent>(`${org(orgId)}/agents/${enc(agentId)}`, { method: "PATCH", json: input }),
      confirmSetup: (orgId, agentId, step) =>
        request<Agent>(`${org(orgId)}/agents/${enc(agentId)}/setup/${enc(step)}`, { json: {} }),
      mailLoss: async (orgId, agentId, audience) =>
        (
          await request<{ mailboxes: ForeignMailbox[] }>(`${org(orgId)}/agents/${enc(agentId)}/audience/mail-loss`, {
            json: { audience },
          })
        ).mailboxes,
      archive: (orgId, agentId) => request<void>(`${org(orgId)}/agents/${enc(agentId)}`, { method: "DELETE" }),
      unarchive: (orgId, agentId) => request<void>(`${org(orgId)}/agents/${enc(agentId)}/unarchive`, { json: {} }),
      purge: (orgId, agentId) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}`, { method: "DELETE", query: { purge: "true" } }),
      former: async (orgId) => (await request<{ agents: FormerAgent[] }>(`${org(orgId)}/former-agents`)).agents,
      models: () => request<{ models: Model[]; defaultModel: string }>("/api/app/models"),
      credentials: async (orgId) =>
        (await request<{ credentials: Credential[] }>(`${org(orgId)}/credentials`)).credentials,
      addCredential: (orgId, input) =>
        request<Credential & { checks?: EndpointCheck[] }>(`${org(orgId)}/credentials`, { json: input }),
      endpointModels: (orgId, input) =>
        request<{ baseURL: string; models: { id: string; label?: string }[]; error?: string }>(
          `${org(orgId)}/credentials/endpoint-models`,
          { json: input },
        ),
      setEndpointModels: (orgId, id, models) =>
        request<{ models: EndpointModel[]; checks: EndpointCheck[] }>(`${org(orgId)}/credentials/${enc(id)}/models`, {
          method: "PUT",
          json: { models },
        }),
      rotateCredential: (orgId, id, input) =>
        request<Credential>(`${org(orgId)}/credentials/${enc(id)}/rotate`, { json: input }),
      removeCredential: (orgId, id, purge, release) =>
        request<void>(`${org(orgId)}/credentials/${enc(id)}`, {
          method: "DELETE",
          query: { purge: purge ? "true" : undefined, release: release ? "true" : undefined },
        }),
      makeDefaultCredential: (orgId, id) =>
        request<Credential>(`${org(orgId)}/credentials/${enc(id)}/make-default`, { json: {} }),
      checkCredential: (orgId, id) =>
        request<{ check: "ok" | "unchecked" }>(`${org(orgId)}/credentials/${enc(id)}/check`, { json: {} }),
      platformKeyAvailable: async (orgId) =>
        (await request<{ available: boolean }>(`${org(orgId)}/credentials/platform`)).available,
      aiStatus: (orgId) => request<AiStatus>(`${org(orgId)}/ai-status`),
      statuses: async (orgId) => (await request<{ agents: AgentStatus[] }>(`${org(orgId)}/agent-status`)).agents,
      usageQueue: (orgId, agentId) => request<UsageQueue>(`${org(orgId)}/agents/${enc(agentId)}/usage-queue`),
      cancelUsageQueue: (orgId, agentId) =>
        request<{ canceled: number; skipped: number }>(`${org(orgId)}/agents/${enc(agentId)}/usage-queue/cancel`, {
          method: "POST",
        }),
      importFromGithub: (orgId, url) =>
        request<{ files: { path: string; text: string }[]; skipped?: string[] }>(`${org(orgId)}/agent-imports/github`, {
          json: { url },
        }),
      detail: (orgId, agentId) => request<AgentDetail>(`${org(orgId)}/agents/${enc(agentId)}`),
      channels: async (orgId, agentId) =>
        (await request<{ channels: AgentChannel[] }>(`${org(orgId)}/agents/${enc(agentId)}/channels`)).channels,
      setChannels: async (orgId, agentId, channels) =>
        (
          await request<{ channels: AgentChannel[] }>(`${org(orgId)}/agents/${enc(agentId)}/channels`, {
            method: "PUT",
            json: { channels },
          })
        ).channels,
      brain: (orgId, agentId, scope) =>
        request<AgentBrain>(`${org(orgId)}/agents/${enc(agentId)}/brain${scope ? `?scope=${scope}` : ""}`),
      setBrain: (orgId, agentId, input) =>
        request<AgentBrain>(`${org(orgId)}/agents/${enc(agentId)}/brain`, { method: "PUT", json: input }),
      brainMachines: async (orgId) =>
        (await request<{ machines: BrainMachine[] }>(`${org(orgId)}/brain-machines`)).machines,
      // ponytail: past 200 agents each call is its own transaction, so a preview's later calls don't see a one-agent
      // sign-in an earlier one took (the real run does). One transaction over all of them if workspaces grow so big.
      applySetup: async (orgId, input) => {
        const results: AgentSetupResult[] = [];
        for (let i = 0; i < input.agentIds.length; i += SETUP_AGENTS_PER_CALL) {
          const agentIds = input.agentIds.slice(i, i + SETUP_AGENTS_PER_CALL);
          const page = await request<{ results: AgentSetupResult[] }>(`${org(orgId)}/agent-setup`, {
            json: { ...input, agentIds },
          });
          results.push(...page.results);
        }
        return results;
      },
      newAgentSetup: async (orgId) =>
        (await request<{ setup: NewAgentSetup | null }>(`${org(orgId)}/agent-setup`)).setup,
      runs: async (orgId, filter = {}) =>
        (await request<{ runs: Run[] }>(`${org(orgId)}/runs`, { query: filter })).runs,
      run: (orgId, runId) => request<{ run: Run; steps: RunStep[] }>(`${org(orgId)}/runs/${enc(runId)}`),
      cancelRun: (orgId, runId, reason, chain) =>
        request<void>(`${org(orgId)}/runs/${enc(runId)}/cancel`, {
          json: { ...(reason ? { reason } : {}), ...(chain ? { chain } : {}) },
        }),
      stopReason: (orgId, runId, reason) =>
        request<void>(`${org(orgId)}/runs/${enc(runId)}/stop-reason`, { json: { reason } }),
      continueRun: (orgId, runId) =>
        request<{ runId: string }>(`${org(orgId)}/runs/${enc(runId)}/continue`, { json: {} }),
      activeRuns: async (orgId, channelId) => {
        const askedAt = Date.now();
        const res = await nullOn(404, () =>
          request<{ runs: ActiveRun[]; consults?: OpenConsult[] }>(
            `${org(orgId)}/channels/${enc(channelId)}/active-runs`,
          ),
        );
        // What the agents working here haven't read yet ("lê na próxima pausa" after a reload).
        if (res) steerStore.reconcile(channelId, res.runs, askedAt);
        // Questions agents asked from here still out (the "asking…" line after a reload).
        if (res?.consults) consultSeeds.publish(channelId, res.consults, askedAt);
        return res ? res.runs : null;
      },
      consultations: async (orgId, channelId) =>
        (
          (await nullOn(404, () =>
            request<{ consultations: RunConsultation[] }>(`${org(orgId)}/channels/${enc(channelId)}/consultations`),
          )) ?? { consultations: [] }
        ).consultations,
      consultation: (orgId, channelId, consultationId) =>
        nullOn(404, () =>
          request<ConsultationConversation>(
            `${org(orgId)}/channels/${enc(channelId)}/consultations/${enc(consultationId)}`,
          ),
        ),
      usage: async (orgId) => {
        const res = await nullOn(403, () => request<{ usage: AgentUsage[] }>(`${org(orgId)}/usage`));
        return res ? res.usage : null;
      },
    },
    imports: {
      apply: (orgId, input) => request<ImportPlan>(`${org(orgId)}/imports`, { json: input }),
      sources: async (orgId) => (await request<{ sources: ImportedSource[] }>(`${org(orgId)}/imports`)).sources,
      copyFile: (orgId, input) => {
        const form = new FormData();
        form.append("file", input.file, input.name);
        form.append("agentId", input.agentId);
        form.append("path", input.path);
        if (input.note) form.append("note", input.note);
        return files.upload<ImportedFile>(`${org(orgId)}/imports/files`, form);
      },
      exportUrl: (orgId) => `${base}${org(orgId)}/export`,
    },
    voice: {
      allowed: (orgId) => request<{ allowed: boolean }>(`${org(orgId)}/voice/allowed`),
      send: (orgId, channelId, input) => {
        const form = new FormData();
        const name = input.blob.type.startsWith("audio/webm") ? "voice.webm" : "voice.m4a";
        form.set("file", input.blob, name);
        form.set("durationMs", String(Math.round(input.durationMs)));
        form.set("peaks", JSON.stringify(input.peaks));
        form.set("clientId", input.clientId);
        if (input.threadId) form.set("threadId", input.threadId);
        if (input.replyTo) form.set("replyTo", input.replyTo);
        if (input.language) form.set("language", input.language);
        return files.upload<{ clipId: string }>(`${org(orgId)}/channels/${enc(channelId)}/voice`, form);
      },
    },
    chat: {
      channels: async (orgId) => (await request<{ channels: Channel[] }>(`${org(orgId)}/channels`)).channels,
      createChannel: (orgId, input) => request<Channel>(`${org(orgId)}/channels`, { json: input }),
      categories: async (orgId) =>
        (await request<{ categories: ChannelCategory[] }>(`${org(orgId)}/channel-categories`)).categories,
      createCategory: (orgId, input) => request<ChannelCategory>(`${org(orgId)}/channel-categories`, { json: input }),
      renameCategory: (orgId, categoryId, name) =>
        request<ChannelCategory>(`${org(orgId)}/channel-categories/${enc(categoryId)}`, {
          method: "PATCH",
          json: { name },
        }),
      deleteCategory: (orgId, categoryId) =>
        request<void>(`${org(orgId)}/channel-categories/${enc(categoryId)}`, { method: "DELETE" }),
      placeCategory: (orgId, categoryId, beforeCategoryId) =>
        request<void>(`${org(orgId)}/channel-categories/${enc(categoryId)}/place`, {
          method: "PUT",
          json: { beforeCategoryId },
        }),
      place: (orgId, channelId, input) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/place`, { method: "PUT", json: input }),
      join: (orgId, channelId) => request<void>(`${org(orgId)}/channels/${enc(channelId)}/join`, { json: {} }),
      leave: (orgId, channelId) => request<void>(`${org(orgId)}/channels/${enc(channelId)}/leave`, { json: {} }),
      card: (orgId, channelId) => request<ChannelCard>(`${org(orgId)}/channels/${enc(channelId)}/card`),
      messageCard: (orgId, messageId) => request<MessageCard>(`${org(orgId)}/messages/${enc(messageId)}/card`),
      idRef: (orgId, id) => request<IdRef>(`${org(orgId)}/refs/${enc(id)}`),
      update: (orgId, channelId, input) =>
        request<Channel>(`${org(orgId)}/channels/${enc(channelId)}`, { method: "PATCH", json: input }),
      reactions: async (orgId, messageId) =>
        (await request<{ reactions: ReactionCount[] }>(`${org(orgId)}/messages/${enc(messageId)}/reactions`)).reactions,
      react: async (orgId, messageId, reaction) =>
        (
          await request<{ reactions: ReactionCount[] }>(`${org(orgId)}/messages/${enc(messageId)}/reactions`, {
            json: { reaction },
          })
        ).reactions,
      unreact: async (orgId, messageId, reaction) =>
        (
          await request<{ reactions: ReactionCount[] }>(`${org(orgId)}/messages/${enc(messageId)}/reactions`, {
            method: "DELETE",
            query: { reaction },
          })
        ).reactions,
      correct: async (orgId, messageId, body) => {
        await request<unknown>(`${org(orgId)}/messages/${enc(messageId)}/correction`, { json: { body } });
      },
      answerNow: (orgId, messageId) =>
        request<{ runs: { agentId: string; runId: string }[] }>(`${org(orgId)}/messages/${enc(messageId)}/answer-now`, {
          json: {},
        }),
      followUps: async (orgId, channelId) =>
        (
          (await nullOn(404, () =>
            request<{ followUps: PendingReturn[] }>(`${org(orgId)}/channels/${enc(channelId)}/follow-ups`),
          )) ?? { followUps: [] }
        ).followUps,
      cancelFollowUp: (orgId, messageId) =>
        request<void>(`${org(orgId)}/messages/${enc(messageId)}/cancel-follow-up`, { json: {} }),
      answerGitHub: (orgId, messageId) =>
        request<void>(`${org(orgId)}/messages/${enc(messageId)}/github-answer`, { json: {} }),
      archive: (orgId, channelId) => request<void>(`${org(orgId)}/channels/${enc(channelId)}`, { method: "DELETE" }),
      unarchive: (orgId, channelId) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/unarchive`, { json: {} }),
      archived: async (orgId) =>
        (await request<{ channels: ArchivedChannel[] }>(`${org(orgId)}/archived-channels`)).channels,
      deleteChannel: (orgId, channelId, name) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/delete`, { json: { name } }),
      roster: async (orgId, channelId) =>
        (await request<{ members: RosterMember[] }>(`${org(orgId)}/channels/${enc(channelId)}/roster`)).members,
      members: async (orgId, channelId) =>
        (await request<{ members: ChannelMember[] }>(`${org(orgId)}/channels/${enc(channelId)}/members`)).members,
      addMember: (orgId, channelId, member) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/members`, { json: member }),
      removeMember: (orgId, channelId, member) =>
        request<void>(
          "agentId" in member
            ? `${org(orgId)}/channels/${enc(channelId)}/members/agents/${enc(member.agentId)}`
            : `${org(orgId)}/channels/${enc(channelId)}/members/people/${enc(member.userId)}`,
          { method: "DELETE" },
        ),
      setAutoReply: (orgId, channelId, agentId, autoReply) =>
        request<void>(`${org(orgId)}/channels/${enc(channelId)}/members/agents/${enc(agentId)}`, {
          method: "PATCH",
          json: { autoReply },
        }),
      permissions: async (orgId, channelId) =>
        (await request<{ overrides: ChannelOverride[] }>(`${org(orgId)}/channels/${enc(channelId)}/permissions`))
          .overrides,
      setPermission: async (orgId, channelId, override) =>
        (await request<ChannelOverride | undefined>(`${org(orgId)}/channels/${enc(channelId)}/permissions`, {
          method: "PUT",
          json: override,
        })) ?? null,
      messages: async (orgId, channelId, options = {}) => {
        const path = `${org(orgId)}/channels/${enc(channelId)}/messages`;
        const query = { threadId: options.threadId, before: options.before, limit: options.limit };
        const { messages } = await request<{ messages: Message[] }>(path, { query });
        steerStore.seed(channelId, messages);
        return messages;
      },
      post: async (orgId, channelId, input) => {
        const message = await request<Message>(`${org(orgId)}/channels/${enc(channelId)}/messages`, { json: input });
        steerStore.seed(channelId, [message]);
        return message;
      },
    },
    approvals: {
      list: async (orgId, filter = {}) =>
        (await request<{ approvals: Approval[] }>(`${org(orgId)}/approvals`, { query: filter })).approvals,
      get: (orgId, id) => request<Approval>(`${org(orgId)}/approvals/${enc(id)}`),
      approve: (orgId, id, reason, always, via) =>
        request<Approval>(`${org(orgId)}/approvals/${enc(id)}/approve`, {
          json: { ...(reason ? { reason } : {}), ...(always ? { always: true } : {}), ...(via ? { via } : {}) },
        }),
      refuse: (orgId, id, reason, via) =>
        request<Approval>(`${org(orgId)}/approvals/${enc(id)}/refuse`, {
          json: { ...(reason ? { reason } : {}), ...(via ? { via } : {}) },
        }),
      cancel: (orgId, id) => request<Approval>(`${org(orgId)}/approvals/${enc(id)}/cancel`, { json: {} }),
      decideMany: (orgId, input) =>
        request<{ approvals: Approval[]; skipped: string[] }>(`${org(orgId)}/approvals/decide`, { json: input }),
      rules: async (orgId, agentId) =>
        (await request<{ rules: ApprovalRule[] }>(`${org(orgId)}/agents/${enc(agentId)}/approval-rules`)).rules,
      removeRule: (orgId, agentId, ruleId) =>
        request<void>(`${org(orgId)}/agents/${enc(agentId)}/approval-rules/${enc(ruleId)}`, { method: "DELETE" }),
      covers: (orgId) => request<ApprovalCovers>(`${org(orgId)}/me/approval-cover`),
      setCover: (orgId, input) =>
        request<ApprovalCovers>(`${org(orgId)}/me/approval-cover`, { method: "PUT", json: input }),
      endCover: (orgId, userId) => request<void>(`${org(orgId)}/approval-covers/${enc(userId)}`, { method: "DELETE" }),
      rightHand: (orgId) => request<RightHandApprovals>(`${org(orgId)}/me/right-hand-approvals`),
      setRightHand: (orgId, input) =>
        request<RightHandApprovals>(`${org(orgId)}/me/right-hand-approvals`, { method: "PUT", json: input }),
      undoRightHand: (orgId, decisionId) =>
        request<void>(`${org(orgId)}/right-hand-decisions/${enc(decisionId)}/undo`, { method: "POST", json: {} }),
    },
    connectors: {
      catalog: () => request<ConnectorCatalog>("/api/app/connectors/catalog"),
      list: async (orgId) => (await request<{ connections: Connection[] }>(`${org(orgId)}/connectors`)).connections,
      connectWithKey: (orgId, input) => request<Connection>(`${org(orgId)}/connectors`, { json: input }),
      startOAuth: async (orgId, connector, input) =>
        (
          await request<{ authorizeUrl: string }>(`${org(orgId)}/connectors/${enc(connector)}/oauth/start`, {
            json: input,
          })
        ).authorizeUrl,
      composioUsage: (orgId) => request<ComposioUsage>(`${org(orgId)}/usage/composio`),
      completeOAuth: (orgId, input) =>
        request<{ connectionId: string; connector: string; outcome?: ConnectOutcome; returnTo?: string }>(
          `${org(orgId)}/connectors/oauth/complete`,
          {
            json: input,
          },
        ),
      rename: (orgId, connectionId, label) =>
        request<Connection>(`${org(orgId)}/connectors/${enc(connectionId)}`, { method: "PATCH", json: { label } }),
      disconnect: (orgId, connectionId) =>
        request<void>(`${org(orgId)}/connectors/${enc(connectionId)}`, { method: "DELETE" }),
    },
    githubApp: {
      info: (orgId) => request<GitHubAppInfo>(`${org(orgId)}/github-app`),
      install: async (orgId, returnTo) =>
        (await request<{ installUrl: string }>(`${org(orgId)}/github-app/install`, { json: { returnTo } })).installUrl,
      complete: (orgId, input) =>
        request<{ installation: GitHubAppInstallation }>(`${org(orgId)}/github-app/complete`, { json: input }),
      remove: (orgId, id) =>
        request<{ uninstalled: boolean }>(`${org(orgId)}/github-app/installations/${enc(id)}`, { method: "DELETE" }),
      startManifest: async (returnTo) =>
        (await request<{ startUrl: string }>("/api/app/github-app/manifest", { json: { returnTo } })).startUrl,
      removeSettings: () => request<GitHubAppSetup>("/api/app/github-app/settings", { method: "DELETE" }),
      repositories: (orgId) => request<GitHubRepositories>(`${org(orgId)}/github/repositories`),
      access: (orgId) => request<GitHubOrgAccess>(`${org(orgId)}/github/access`),
    },
    search: {
      query: async (orgId, input) =>
        (
          await request<{ hits: SearchHit[] }>(`${org(orgId)}/search`, {
            query: { q: input.q, kinds: input.kinds?.join(","), limit: input.limit, ...filterQuery(input.filters) },
          })
        ).hits,
    },
    memory: {
      listAll: async (orgId) => (await request<{ memories: Memory[] }>(`${org(orgId)}/memories`)).memories,
      listTeam: async (orgId) => (await request<{ memories: Memory[] }>(`${org(orgId)}/team-memories`)).memories,
      makeTeam: (orgId, id) => request<Memory>(`${org(orgId)}/memories/${enc(id)}/team`, { json: {} }),
      list: async (orgId, agentId, filter) =>
        (
          await request<{ memories: Memory[] }>(`${org(orgId)}/agents/${enc(agentId)}/memories`, {
            query: { about: filter?.about },
          })
        ).memories,
      edit: (orgId, id, text) =>
        request<Memory>(`${org(orgId)}/memories/${enc(id)}`, { method: "PATCH", json: { text } }),
      setPinned: (orgId, id, pinned) =>
        request<Memory>(`${org(orgId)}/memories/${enc(id)}`, { method: "PATCH", json: { pinned } }),
      setArchived: (orgId, id, archived) =>
        request<Memory>(`${org(orgId)}/memories/${enc(id)}`, { method: "PATCH", json: { archived } }),
      confirm: (orgId, id) =>
        request<Memory>(`${org(orgId)}/memories/${enc(id)}`, { method: "PATCH", json: { confirmed: true } }),
      revert: async (orgId, id) => {
        await request<unknown>(`${org(orgId)}/memories/${enc(id)}/revert`, { json: {} });
      },
    },
    dms: {
      list: async (orgId) => (await request<{ dms: DirectMessage[] }>(`${org(orgId)}/dms`)).dms,
      open: (orgId, target) =>
        request<{ channelId: string; dm?: DirectMessage }>(`${org(orgId)}/dms`, { json: target }),
      markRead: (orgId, channelId) => request<void>(`${org(orgId)}/channels/${enc(channelId)}/read`, { json: {} }),
      reads: async (orgId, channelId) =>
        (await request<{ reads: DmRead[] }>(`${org(orgId)}/channels/${enc(channelId)}/reads`)).reads,
    },
    sandbox: {
      settings: (orgId) => request<SandboxSettings>(`${org(orgId)}/sandbox-settings`),
      saveSettings: (orgId, input) =>
        request<SandboxSettings>(`${org(orgId)}/sandbox-settings`, { method: "PUT", json: input }),
      computer: (orgId, agentId) => request<AgentComputer>(`${org(orgId)}/agents/${enc(agentId)}/computer`),
      setTarget: (orgId, agentId, machineId) =>
        request<ComputerTarget>(`${org(orgId)}/agents/${enc(agentId)}/computer/target`, {
          method: "PUT",
          json: { machineId },
        }),
    },
    devices: {
      list: (orgId) => request<DevicesList>(`${org(orgId)}/devices`),
      updateComputer: (orgId, machineId, input) =>
        request<ComputerDevice>(`${org(orgId)}/devices/computers/${enc(machineId)}`, { method: "PATCH", json: input }),
      removeComputer: (orgId, machineId) =>
        request<void>(`${org(orgId)}/devices/computers/${enc(machineId)}`, { method: "DELETE" }),
      updatePhone: (orgId, phoneId, input) =>
        request<PhoneDevice>(`${org(orgId)}/devices/phones/${enc(phoneId)}`, { method: "PATCH", json: input }),
      forgetPhone: (orgId, phoneId) =>
        request<void>(`${org(orgId)}/devices/phones/${enc(phoneId)}`, { method: "DELETE" }),
      stopPhone: (orgId, phoneId) => request<void>(`${org(orgId)}/devices/phones/${enc(phoneId)}/stop`, { json: {} }),
      createLink: (orgId, kind) => request<ConnectLink>(`${org(orgId)}/devices/connect-links`, { json: { kind } }),
      link: (orgId, linkId) => request<ConnectLinkState>(`${org(orgId)}/devices/connect-links/${enc(linkId)}`),
      approveRequest: (orgId, requestId, input) =>
        request<{ machineId: string }>(`${org(orgId)}/devices/requests/${enc(requestId)}/approve`, { json: input }),
      denyRequest: (orgId, requestId) =>
        request<void>(`${org(orgId)}/devices/requests/${enc(requestId)}/deny`, { json: {} }),
      decideAccess: (orgId, requestId, decision) =>
        request<void>(`${org(orgId)}/devices/access-requests/${enc(requestId)}/decide`, { json: { decision } }),
      deviceWait: (orgId, runId, action) =>
        request<void>(`${org(orgId)}/runs/${enc(runId)}/device-wait`, { json: { action } }),
      startWifiPairing: (orgId, machineId, input) =>
        request<WifiPairing>(`${org(orgId)}/devices/computers/${enc(machineId)}/wifi-pairings`, { json: input }),
      wifiPairing: (orgId, machineId, pairingId) =>
        request<WifiPairing>(`${org(orgId)}/devices/computers/${enc(machineId)}/wifi-pairings/${enc(pairingId)}`),
      cancelWifiPairing: (orgId, machineId, pairingId) =>
        request<void>(`${org(orgId)}/devices/computers/${enc(machineId)}/wifi-pairings/${enc(pairingId)}`, {
          method: "DELETE",
        }),
      lookForPhones: (orgId, machineId) =>
        request<void>(`${org(orgId)}/devices/computers/${enc(machineId)}/phone-looks`, { json: {} }),
      wifiIphones: (orgId, machineId) =>
        request<WifiIphones>(`${org(orgId)}/devices/computers/${enc(machineId)}/wifi-iphones`),
      pickIphoneOverWifi: (orgId, machineId, serial) =>
        request<WifiIphones>(`${org(orgId)}/devices/computers/${enc(machineId)}/wifi-iphones/${enc(serial)}`, {
          method: "PUT",
          json: {},
        }),
      startXcodeFix: (orgId, machineId, kind) =>
        request<XcodeFixView>(`${org(orgId)}/devices/computers/${enc(machineId)}/xcode-fix`, { json: { kind } }),
      xcodeFix: (orgId, machineId) =>
        request<XcodeFixView>(`${org(orgId)}/devices/computers/${enc(machineId)}/xcode-fix`),
      cancelXcodeFix: (orgId, machineId) =>
        request<XcodeFixView>(`${org(orgId)}/devices/computers/${enc(machineId)}/xcode-fix`, { method: "DELETE" }),
      openXcode: (orgId, machineId) =>
        request<{ opened: boolean }>(`${org(orgId)}/devices/computers/${enc(machineId)}/xcode-open`, { json: {} }),
    },
    machines: {
      list: async (orgId) => (await request<{ machines: Machine[] }>(`${org(orgId)}/machines`)).machines,
      rename: (orgId, machineId, name) =>
        request<{ id: string; name: string }>(`${org(orgId)}/machines/${enc(machineId)}`, {
          method: "PATCH",
          json: { name },
        }),
      remove: (orgId, machineId) => request<void>(`${org(orgId)}/machines/${enc(machineId)}`, { method: "DELETE" }),
      host: (orgId) => nullOn(404, () => request<HostComputer>(`${org(orgId)}/machines/host`)),
      hostOn: (orgId) => request<HostComputer>(`${org(orgId)}/machines/host`, { json: {} }),
      computerSetup: (orgId) => request<ComputerSetup>(`${org(orgId)}/computer-setup`),
      device: (userCode) => request<DeviceRequest>(`/api/app/machines/device/${enc(userCode)}`),
      confirmDevice: (orgId, userCode, input) =>
        request<Machine>(`${org(orgId)}/machines/device/${enc(userCode)}/confirm`, { json: input }),
      denyDevice: (userCode) => request<void>(`/api/app/machines/device/${enc(userCode)}/deny`, { json: {} }),
      reduceAccess: async (orgId, machineId, input) => {
        const out = await request<MachineAccess | { access: MachineAccess }>(
          `${org(orgId)}/machines/${enc(machineId)}/access/reduce`,
          { json: input },
        );
        // The new access, bare or wrapped.
        return "access" in out ? out.access : out;
      },
      allowTool: async (orgId, machineId, tool) =>
        (
          await request<{ access: MachineAccess }>(`${org(orgId)}/machines/${enc(machineId)}/access/allow`, {
            json: { tool },
          })
        ).access,
      askTool: async (orgId, machineId, tool) => {
        await request<unknown>(`${org(orgId)}/machines/${enc(machineId)}/access/ask`, { json: { tool } });
      },
      checkClis: async (orgId, machineId) => {
        await request<unknown>(`${org(orgId)}/machines/${enc(machineId)}/clis/check`, { json: {} });
      },
      cliInstall: (orgId, machineId, tool, action) => {
        const path = `${org(orgId)}/machines/${enc(machineId)}/cli-install`;
        if (action === "start") return request<{ install: CliInstall | null }>(path, { json: { tool } });
        return request<{ install: CliInstall | null }>(`${path}?tool=${enc(tool)}`, {
          ...(action === "cancel" ? { method: "DELETE" } : {}),
        });
      },
      askCliInstall: async (orgId, machineId, tool) => {
        await request<unknown>(`${org(orgId)}/machines/${enc(machineId)}/cli-install/ask`, { json: { tool } });
      },
      setPause: async (orgId, machineId, input) =>
        (
          await request<{ paused: MachinePause | null }>(
            `${org(orgId)}/machines/${enc(machineId)}/${input === "resume" ? "resume" : "pause"}`,
            { json: input === "resume" ? {} : input },
          )
        ).paused,
      // A self-hosted server has no builds of its own (no `DESKTOP_RELEASES_TOKEN`): agentes.chat's, then.
      desktopLatest: async (target, arch) =>
        (await nullOn(404, () => request<DesktopRelease>("/api/desktop/latest", { query: { target, arch } }))) ??
        (await nullOn(404, () => cloud<DesktopRelease>("/api/desktop/latest", { query: { target, arch } }))),
      outages: (orgId) => request<MachineOutages>(`${org(orgId)}/machines/outages`),
      queue: (orgId, machineId) => request<ComputerQueue>(`${org(orgId)}/machines/${enc(machineId)}/queue`),
      moveAgents: (orgId, machineId, input) =>
        request<MoveAgentsResult>(`${org(orgId)}/machines/${enc(machineId)}/move-agents`, { json: input }),
      beginAccountLogin: (orgId, machineId, kind, options = {}) =>
        request<AccountLoginStart>(`${org(orgId)}/machines/${enc(machineId)}/account-logins`, {
          json: {
            kind,
            ...(options.accountId ? { accountId: options.accountId } : {}),
            ...(options.email ? { email: options.email } : {}),
            ...(options.provider ? { provider: options.provider } : {}),
          },
        }),
      sendAccountCode: (orgId, machineId, loginId, box) =>
        request<void>(`${org(orgId)}/machines/${enc(machineId)}/account-logins/${enc(loginId)}/code`, {
          json: { box },
        }),
      accountLogin: (orgId, machineId, loginId) =>
        request<AccountLoginStatus>(`${org(orgId)}/machines/${enc(machineId)}/account-logins/${enc(loginId)}`),
      cancelAccountLogin: (orgId, machineId, loginId) =>
        request<void>(`${org(orgId)}/machines/${enc(machineId)}/account-logins/${enc(loginId)}`, {
          method: "DELETE",
        }),
      refreshAccountUsage: (orgId) => request<void>(`${org(orgId)}/ai-accounts/refresh`, { json: {} }),
      aiAccounts: (orgId) => request<AiAccounts>(`${org(orgId)}/ai-accounts`),
      takeBackPlan: (orgId, accountId, agentId) =>
        request<{ agentIds: string[] }>(`${org(orgId)}/ai-accounts/${enc(accountId)}/take-back`, {
          json: agentId ? { agentId } : {},
        }),
      setAccountServes: (orgId, accountId, serves) =>
        request<{ serves: PlanServes; agentIds: string[] }>(`${org(orgId)}/ai-accounts/${enc(accountId)}/serves`, {
          method: "PUT",
          json: { serves },
        }),
      renameAccount: (orgId, machineId, accountId, label) =>
        request<MachineAccount>(`${org(orgId)}/machines/${enc(machineId)}/accounts/${enc(accountId)}`, {
          method: "PATCH",
          json: { label },
        }),
      removeAccount: (orgId, machineId, accountId) =>
        request<void>(`${org(orgId)}/machines/${enc(machineId)}/accounts/${enc(accountId)}`, { method: "DELETE" }),
    },
    apps: {
      consent: (requestId) => request<AppConsent>(`/api/app/authorize/${enc(requestId)}`),
      decide: (requestId, input) =>
        request<{ redirectTo: string }>(`/api/app/authorize/${enc(requestId)}`, { json: input }),
      list: (orgId, all = false) => request<AppsList>(`${org(orgId)}/apps`, { query: all ? { all: "1" } : {} }),
      disconnect: (orgId, grantId) => request<void>(`${org(orgId)}/apps/${enc(grantId)}`, { method: "DELETE" }),
      createToken: (orgId, input) => request<CreatedPersonalToken>(`${org(orgId)}/tokens`, { json: input }),
      revokeToken: (orgId, grantId) => request<void>(`${org(orgId)}/tokens/${enc(grantId)}`, { method: "DELETE" }),
    },
    skills: {
      list: async (orgId) => (await request<{ skills: Skill[] }>(`${org(orgId)}/skills`)).skills,
      get: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}`),
      create: (orgId, input) => request<SkillDetail>(`${org(orgId)}/skills`, { json: input }),
      import: (orgId, input, upload) =>
        request<SkillDetail | SkillPick>(`${org(orgId)}/skills/import`, {
          json: input,
          signal: upload?.signal,
          onUploadProgress: upload?.onProgress,
        }),
      importPicked: async (orgId, url, paths, forAgentId) =>
        (
          await request<{ skills: SkillDetail[] }>(`${org(orgId)}/skills/import`, {
            json: { url, paths, ...(forAgentId ? { forAgentId } : {}) },
          })
        ).skills,
      update: (orgId, id, patch) =>
        request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}`, { method: "PATCH", json: patch }),
      reimport: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/reimport`, { json: {} }),
      remove: (orgId, id) => request<void>(`${org(orgId)}/skills/${enc(id)}`, { method: "DELETE" }),
      forAgent: async (orgId, agentId) =>
        (await request<{ skills: AgentSkill[] }>(`${org(orgId)}/agents/${enc(agentId)}/skills`)).skills,
      setForAgent: async (orgId, agentId, skills) =>
        (
          await request<{ skills: AgentSkill[] }>(`${org(orgId)}/agents/${enc(agentId)}/skills`, {
            method: "PUT",
            json: { skills },
          })
        ).skills,
      learned: async (orgId, agentId) =>
        (await request<{ skills: LearnedSkill[] }>(`${org(orgId)}/agents/${enc(agentId)}/learned-skills`)).skills,
      revert: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/revert`, { json: {} }),
      restore: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/restore`, { json: {} }),
      updateFromSource: (orgId, id) =>
        request<SkillSourceUpdate>(`${org(orgId)}/skills/${enc(id)}/update`, { json: {} }),
      approveUpdate: (orgId, id) =>
        request<SkillSourceUpdate>(`${org(orgId)}/skills/${enc(id)}/update/approve`, { json: {} }),
      dismissUpdate: (orgId, id) =>
        request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/update/dismiss`, { json: {} }),
      reopenUpdate: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/update/reopen`, { json: {} }),
      undoUpdate: (orgId, id) => request<SkillDetail>(`${org(orgId)}/skills/${enc(id)}/update/undo`, { json: {} }),
      settings: (orgId) => request<SkillSettings>(`${org(orgId)}/skill-settings`),
      saveSettings: (orgId, input) =>
        request<SkillSettings>(`${org(orgId)}/skill-settings`, { method: "PUT", json: input }),
    },
    access: {
      get: (orgId, agentId) => request<AgentAccess>(`${org(orgId)}/agents/${enc(agentId)}/access`),
      set: (orgId, agentId, input) =>
        request<AgentAccess>(`${org(orgId)}/agents/${enc(agentId)}/access`, { method: "PUT", json: input }),
    },
    invites: {
      createLink: (orgId, choices) => request<InviteLinkMade>(`${org(orgId)}/invite-links`, { json: choices ?? {} }),
      editLink: (orgId, linkId, choices) =>
        request<InviteLinkChanged>(`${org(orgId)}/invite-links/${enc(linkId)}`, { method: "PATCH", json: choices }),
      links: async (orgId) => (await request<{ links: InviteLink[] }>(`${org(orgId)}/invite-links`)).links,
      turnOff: (orgId, linkId) => request<void>(`${org(orgId)}/invite-links/${enc(linkId)}`, { method: "DELETE" }),
      renewLink: (orgId, linkId) =>
        request<{ expiresAt: string }>(`${org(orgId)}/invite-links/${enc(linkId)}/renew`, { json: {} }),
      sendCode: (token, input, humanCheck) =>
        request<CodeSent>(`/api/app/invitations/${enc(token)}/code`, {
          json: input,
          headers: humanCheckHeaders(humanCheck),
        }),
      checkCode: (token, input) =>
        request<{ verified: true }>(`/api/app/invitations/${enc(token)}/code/check`, { json: input }),
      ask: (token, input) => request<AskToJoinResult>(`/api/app/invitations/${enc(token)}/requests`, { json: input }),
      requestNew: (token) => request<void>(`/api/app/invitations/${enc(token)}/request-new`, { json: {} }),
      claim: (token, key) =>
        nullOn(404, () => request<JoinClaim>(`/api/app/invitations/${enc(token)}/requests/claim`, { json: { key } })),
    },
    joinRequests: {
      list: async (orgId) => (await request<{ requests: JoinRequest[] }>(`${org(orgId)}/join-requests`)).requests,
      approve: (orgId, id, roleIds, start) =>
        request<JoinApproval>(`${org(orgId)}/join-requests/${enc(id)}/approve`, {
          json: { roleIds: roleIds ?? [], ...start },
        }),
      deny: (orgId, id, reason) =>
        request<void>(`${org(orgId)}/join-requests/${enc(id)}/deny`, { json: reason ? { reason } : {} }),
      suggest: (orgId, input) => request<{ id: string }>(`${org(orgId)}/join-requests/suggest`, { json: input }),
      mine: async (orgId) =>
        (await request<{ suggestions: MySuggestion[] }>(`${org(orgId)}/join-requests/mine`)).suggestions,
      cancel: (orgId, id) => request<void>(`${org(orgId)}/join-requests/${enc(id)}`, { method: "DELETE" }),
    },
    storage: {
      get: (orgId) => request<StorageConfig>(`${org(orgId)}/storage`),
      test: (orgId, input) => request<StorageTestResult>(`${org(orgId)}/storage/test`, { json: input }),
      save: (orgId, input) => request<StorageConfig>(`${org(orgId)}/storage`, { method: "PUT", json: input }),
      migrate: (orgId) => request<StorageMigration>(`${org(orgId)}/storage/migrate`, { json: {} }),
      migration: (orgId) => request<StorageMigration | null>(`${org(orgId)}/storage/migration`),
    },
    artifacts: {
      list: async (orgId, filters = {}) =>
        (await request<ArtifactPage>(`${org(orgId)}/artifacts`, { query: artifactQuery(filters) })).artifacts,
      page: (orgId, filters = {}, cursor) =>
        request<ArtifactPage>(`${org(orgId)}/artifacts`, { query: { ...artifactQuery(filters), cursor } }),
      get: (orgId, id, version) =>
        request<ArtifactDetail>(`${org(orgId)}/artifacts/${enc(id)}`, { query: { version } }),
      keep: (orgId, id) => request<Artifact>(`${org(orgId)}/artifacts/${enc(id)}/keep`, { method: "POST" }),
      reply: (orgId, id, text, clientId) =>
        request<{ id: string }>(`${org(orgId)}/artifacts/${enc(id)}/reply`, {
          json: { text, clientId },
        }),
      blockState: (orgId, id, version) =>
        request<BlockState>(`${org(orgId)}/blocks/${enc(id)}/state`, { query: { version } }),
      setBlockState: (orgId, id, version, values) =>
        request<BlockState>(`${org(orgId)}/blocks/${enc(id)}/state`, { method: "PUT", json: { version, values } }),
      drawBlock: (orgId, id, version, name, options) =>
        request<BlockState>(`${org(orgId)}/blocks/${enc(id)}/draw`, { json: { version, name, options } }),
      poll: (orgId, id) => request<Poll>(`${org(orgId)}/polls/${enc(id)}`),
      vote: (orgId, id, options) =>
        request<Poll>(`${org(orgId)}/polls/${enc(id)}/vote`, { method: "PUT", json: { options } }),
      choices: (orgId, id) => request<Choices>(`${org(orgId)}/choices/${enc(id)}`),
      answerChoices: (orgId, id, picks, clientId, others) =>
        request<{ choices: Choices; messageId: string }>(`${org(orgId)}/choices/${enc(id)}/answer`, {
          json: { picks, clientId, ...(others ? { others } : {}) },
        }),
      versions: async (orgId, id) =>
        (await request<{ versions: ArtifactVersion[] }>(`${org(orgId)}/artifacts/${enc(id)}/versions`)).versions,
      download: (orgId, id, version) =>
        request<{ url: string; expiresAt: string }>(`${org(orgId)}/artifacts/${enc(id)}/download`, {
          query: { version },
        }),
      fileUrl: (orgId, id, options = {}) => {
        const params = new URLSearchParams();
        if (options.version) params.set("version", String(options.version));
        if (options.format) params.set("format", options.format);
        const qs = params.toString();
        return `${base}${org(orgId)}/artifacts/${enc(id)}/file${qs ? `?${qs}` : ""}`;
      },
      upload: (orgId, file, options = {}) => {
        const form = new FormData();
        form.append("file", file, file.name);
        if (options.title) form.append("title", options.title);
        if (options.channelId) form.append("channelId", options.channelId);
        if (options.threadId) form.append("threadId", options.threadId);
        return files.upload<ArtifactDetail>(`${org(orgId)}/artifacts/files`, form);
      },
      uploadVersion: (orgId, id, file, options = {}) => {
        const form = new FormData();
        form.append("file", file, file.name);
        if (options.note) form.append("note", options.note);
        return files.upload<ArtifactDetail>(`${org(orgId)}/artifacts/${enc(id)}/files`, form);
      },
      fileBlob: (orgId, id, version) =>
        files.blob(`${org(orgId)}/artifacts/${enc(id)}/file${version ? `?version=${version}` : ""}`),
      create: (orgId, input) => request<ArtifactDetail>(`${org(orgId)}/artifacts`, { json: input }),
      update: (orgId, id, input) =>
        request<ArtifactDetail>(`${org(orgId)}/artifacts/${enc(id)}/versions`, { json: input }),
      setSharing: (orgId, id, sharing) =>
        request<Artifact>(`${org(orgId)}/artifacts/${enc(id)}/sharing`, { method: "PUT", json: sharing }),
      remove: (orgId, id) => request<void>(`${org(orgId)}/artifacts/${enc(id)}`, { method: "DELETE" }),
      trash: async (orgId) => {
        // The server answers `{ files }`.
        const res = await request<{ files?: TrashedArtifact[]; artifacts?: TrashedArtifact[] } | TrashedArtifact[]>(
          `${org(orgId)}/artifacts-trash`,
        );
        return Array.isArray(res) ? res : (res.files ?? res.artifacts ?? []);
      },
      restore: (orgId, id) =>
        request<ArtifactDetail | undefined>(`${org(orgId)}/artifacts/${enc(id)}/restore`, { json: {} }),
      purge: (orgId, id) => request<void>(`${org(orgId)}/artifacts-trash/${enc(id)}`, { method: "DELETE" }),
    },
    issues: {
      list: async (orgId, filters = {}) =>
        (
          await request<{ issues: Issue[] }>(`${org(orgId)}/issues`, {
            query: { q: filters.q, projectId: filters.projectId },
          })
        ).issues,
      get: (orgId, number) => request<Issue>(`${org(orgId)}/issues/by-number/${number}`),
      create: (orgId, input) => request<Issue>(`${org(orgId)}/issues`, { json: input }),
      update: (orgId, id, patch) => request<Issue>(`${org(orgId)}/issues/${enc(id)}`, { method: "PATCH", json: patch }),
      delete: (orgId, id) => request<void>(`${org(orgId)}/issues/${enc(id)}`, { method: "DELETE" }),
      share: (orgId, id) => request<Issue>(`${org(orgId)}/issues/${enc(id)}/share`, { method: "POST" }),
      setAudience: (orgId, id, audience) =>
        request<Issue>(`${org(orgId)}/issues/${enc(id)}/audience`, { method: "PUT", json: audience }),
      setCriterion: (orgId, id, criterionId, done) =>
        request<Issue>(`${org(orgId)}/issues/${enc(id)}/criteria/${enc(criterionId)}`, {
          method: "PUT",
          json: { done },
        }),
      activity: async (orgId, id) =>
        (await request<{ activity: IssueActivity[] }>(`${org(orgId)}/issues/${enc(id)}/activity`)).activity,
      comment: (orgId, id, text, attachmentIds) =>
        request<IssueActivity>(`${org(orgId)}/issues/${enc(id)}/comments`, {
          json: { text, ...(attachmentIds?.length ? { attachmentIds } : {}) },
        }),
      askAgent: (orgId, id, agentId) =>
        request<Issue>(`${org(orgId)}/issues/${enc(id)}/ask-agent`, { json: { agentId } }),
      conversation: (orgId, id) =>
        request<IssueConversationRef>(`${org(orgId)}/issues/${enc(id)}/conversation`, { method: "POST" }),
      columns: async (orgId) => (await request<{ columns: IssueColumn[] }>(`${org(orgId)}/issue-columns`)).columns,
      addColumn: async (orgId, input) =>
        (await request<{ columns: IssueColumn[] }>(`${org(orgId)}/issue-columns`, { json: input })).columns,
      updateColumn: async (orgId, columnId, patch) =>
        (
          await request<{ columns: IssueColumn[] }>(`${org(orgId)}/issue-columns/${enc(columnId)}`, {
            method: "PATCH",
            json: patch,
          })
        ).columns,
      deleteColumn: async (orgId, columnId, moveTo) =>
        (
          await request<{ columns: IssueColumn[] }>(`${org(orgId)}/issue-columns/${enc(columnId)}`, {
            method: "DELETE",
            query: { moveTo },
          })
        ).columns,
      projects: (orgId) => request<IssueProjects>(`${org(orgId)}/issue-projects`),
      createProject: (orgId, input) => request<IssueProject>(`${org(orgId)}/issue-projects`, { json: input }),
      updateProject: (orgId, projectId, patch) =>
        request<IssueProjectRef>(`${org(orgId)}/issue-projects/${enc(projectId)}`, { method: "PATCH", json: patch }),
      deleteProject: (orgId, projectId) =>
        request<void>(`${org(orgId)}/issue-projects/${enc(projectId)}`, { method: "DELETE" }),
    },
    threads: {
      list: (orgId, filters = {}) => request<ThreadPage>(`${org(orgId)}/threads`, { query: threadQuery(filters) }),
      inChannel: (orgId, channelId, filters = {}) =>
        request<ThreadPage>(`${org(orgId)}/channels/${enc(channelId)}/threads`, { query: threadQuery(filters) }),
      get: (orgId, threadId) => request<ThreadInfo>(`${org(orgId)}/threads/${enc(threadId)}`),
      create: (orgId, input) => request<ThreadInfo>(`${org(orgId)}/threads`, { json: input }),
      update: (orgId, threadId, patch) =>
        request<ThreadInfo>(`${org(orgId)}/threads/${enc(threadId)}`, { method: "PATCH", json: patch }),
      remove: (orgId, threadId) => request<void>(`${org(orgId)}/threads/${enc(threadId)}`, { method: "DELETE" }),
      act: (orgId, threadId, action) =>
        request<ThreadInfo>(`${org(orgId)}/threads/${enc(threadId)}/${action}`, { json: {} }),
    },
    dashboards: createDashboardsApi(request),
    missions: ((): HttpApi["missions"] => {
      const one = (orgId: string, missionId: string) => `${org(orgId)}/missions/${enc(missionId)}`;
      return {
        list: (orgId, query = {}) =>
          request<MissionList>(`${org(orgId)}/missions`, {
            query: {
              status: query.status,
              channelId: query.channelId,
              agentId: query.agentId,
              q: query.q || undefined,
              limit: query.limit === undefined ? undefined : String(query.limit),
            },
          }),
        eligibleAgents: async (orgId) =>
          (await request<{ agents: MissionEligibleAgent[] }>(`${org(orgId)}/missions/eligible-agents`)).agents,
        taskOutput: (orgId, taskId, tail) =>
          request<TaskOutput>(`${org(orgId)}/tasks/${enc(taskId)}/output`, {
            query: { tail: tail === undefined ? undefined : String(tail) },
          }),
        joinRequests: async (orgId, missionId) =>
          (await request<{ requests: MissionJoinRequest[] }>(`${one(orgId, missionId)}/join-requests`)).requests,
        requestJoin: (orgId, missionId) =>
          request<MissionJoinRequest>(`${one(orgId, missionId)}/join-requests`, { json: {} }),
        decideJoin: (orgId, missionId, userId, outcome, role) =>
          request<MissionJoinRequest>(`${one(orgId, missionId)}/join-requests/${enc(userId)}/${outcome}`, {
            json: outcome === "accept" ? { role: role ?? "comment" } : {},
          }),
        create: (orgId, input) => request<Mission>(`${org(orgId)}/missions`, { json: input }),
        get: (orgId, missionId) => request<Mission>(one(orgId, missionId)),
        ofThread: (orgId, threadId) => request<Mission>(`${org(orgId)}/threads/${enc(threadId)}/mission`),
        threadTasks: async (orgId, threadId) =>
          (await request<{ tasks: MachineTask[] }>(`${org(orgId)}/threads/${enc(threadId)}/tasks`)).tasks,
        control: (orgId, missionId, action) =>
          request<Mission & { canceledTasks?: number }>(`${one(orgId, missionId)}/${action}`, { json: {} }),
        close: (orgId, missionId, input) => request<Mission>(`${one(orgId, missionId)}/close`, { json: input }),
        retryWorktree: (orgId, missionId) => request<Mission>(`${one(orgId, missionId)}/worktree/retry`, { json: {} }),
        message: (orgId, missionId, text) =>
          request<{ delivered: boolean; taskId?: string }>(`${one(orgId, missionId)}/messages`, { json: { text } }),
        participants: (orgId, missionId) => request<MissionParticipants>(`${one(orgId, missionId)}/participants`),
        setParticipant: (orgId, missionId, userId, role, existing) =>
          existing
            ? request<MissionParticipants>(`${one(orgId, missionId)}/participants/${enc(userId)}`, {
                method: "PATCH",
                json: { role },
              })
            : request<MissionParticipants>(`${one(orgId, missionId)}/participants`, { json: { userId, role } }),
        removeParticipant: (orgId, missionId, userId) =>
          request<void>(`${one(orgId, missionId)}/participants/${enc(userId)}`, { method: "DELETE" }),
        transfer: (orgId, missionId, input) =>
          request<Mission & { code?: string }>(`${one(orgId, missionId)}/transfer`, { json: input }),
        setMachine: (orgId, missionId, machineId, repoDir) =>
          request<Mission>(`${one(orgId, missionId)}/machine`, {
            method: "PUT",
            json: { machineId, ...(repoDir ? { repoDir } : {}) },
          }),
        setExecutor: (orgId, missionId, executor) =>
          request<Mission>(`${one(orgId, missionId)}/executor`, { method: "PUT", json: { executor } }),
        setCommandApproval: (orgId, missionId, commandApproval) =>
          request<{ commandApproval: CommandApproval }>(`${one(orgId, missionId)}/command-approval`, {
            method: "PUT",
            json: { commandApproval },
          }),
        settings: (orgId, missionId) => request<MissionSettings>(`${one(orgId, missionId)}/settings`),
        brain: (orgId, missionId) => request<MissionBrain>(`${one(orgId, missionId)}/brain`),
        setBrain: (orgId, missionId, input) =>
          request<MissionBrain>(`${one(orgId, missionId)}/brain`, { method: "PUT", json: input }),
        removeCommandRule: (orgId, missionId, ruleId) =>
          request<{ rules: MissionCommandRule[] }>(`${one(orgId, missionId)}/command-rules/${enc(ruleId)}`, {
            method: "DELETE",
          }),
        setResumeTasks: (orgId, missionId, resumeTasks) =>
          request<Mission>(one(orgId, missionId), { method: "PATCH", json: { resumeTasks } }),
        setAgentDefault: (orgId, agentId, commandApproval) =>
          request<{ commandApproval: CommandApproval }>(
            `${org(orgId)}/agents/${enc(agentId)}/mission-command-approval`,
            { method: "PUT", json: { commandApproval } },
          ),
        decisions: async (orgId, missionId) =>
          (await request<{ decisions: MissionDecision[] }>(`${one(orgId, missionId)}/decisions`)).decisions,
        commands: (orgId, missionId) =>
          request<{ commands: MissionCommand[]; rules: string[] }>(`${one(orgId, missionId)}/commands`),
        decideCommand: (orgId, missionId, commandId, decision) =>
          request<MissionCommand>(`${one(orgId, missionId)}/commands/${enc(commandId)}/decide`, {
            json: { decision },
          }),
        retryCommand: (orgId, missionId, input) =>
          request<{ rules: string[]; delivered: boolean }>(`${one(orgId, missionId)}/commands/retry`, {
            json: input,
          }),
        deliveries: (orgId, missionId) => request<MissionDelivery[]>(`${one(orgId, missionId)}/deliveries`),
        checkDelivery: (orgId, missionId, deliveryId, itemId, checked) =>
          request<MissionDelivery>(`${one(orgId, missionId)}/deliveries/${enc(deliveryId)}/checks/${enc(itemId)}`, {
            method: "PUT",
            json: { checked },
          }),
        acceptDelivery: (orgId, missionId, deliveryId, input) =>
          request<Mission>(`${one(orgId, missionId)}/deliveries/${enc(deliveryId)}/accept`, { json: input }),
        requestDeliveryChanges: (orgId, missionId, deliveryId, note) =>
          request<Mission>(`${one(orgId, missionId)}/deliveries/${enc(deliveryId)}/changes`, { json: { note } }),
        choose: (orgId, missionId, decisionId, option) =>
          request<MissionDecision>(`${one(orgId, missionId)}/decisions/${enc(decisionId)}/choose`, {
            json: { option },
          }),
        opinion: (orgId, missionId, decisionId, option) =>
          request<MissionDecision>(`${one(orgId, missionId)}/decisions/${enc(decisionId)}/opinion`, {
            json: { option },
          }),
        approveProvisional: async (orgId, missionId) =>
          (
            await request<{ decisions: MissionDecision[] }>(`${one(orgId, missionId)}/decisions/approve-provisional`, {
              json: {},
            })
          ).decisions,
        reviews: async (orgId, missionId) =>
          (await request<{ reviews: MissionReview[] }>(`${one(orgId, missionId)}/reviews`)).reviews,
        review: (orgId, missionId, reviewId, outcome, note) =>
          request<MissionReview>(`${one(orgId, missionId)}/reviews/${enc(reviewId)}/${outcome}`, {
            json: note ? { note } : {},
          }),
        suggestion: (orgId, missionId, messageId, outcome) =>
          request<{ messageId: string; status: "accepted" | "declined" }>(
            `${one(orgId, missionId)}/suggestions/${enc(messageId)}/${outcome}`,
            { json: {} },
          ),
        files: (orgId, missionId) => request<MissionFiles>(`${one(orgId, missionId)}/files`),
        summary: (orgId, missionId) => request<MissionSummary>(`${one(orgId, missionId)}/summary`),
        plan: (orgId, missionId) => request<MissionPlan>(`${one(orgId, missionId)}/plan`),
      };
    })(),
    routines: {
      list: async (orgId) => (await request<{ routines: Routine[] }>(`${org(orgId)}/routines`)).routines,
      parseSchedule: (orgId, phrase, timezone) =>
        request<ScheduleParse>(`${org(orgId)}/routines/parse-schedule`, { json: { phrase, timezone } }),
      create: (orgId, input) => request<Routine>(`${org(orgId)}/routines`, { json: input }),
      setActive: (orgId, id, active) =>
        request<Routine>(`${org(orgId)}/routines/${enc(id)}`, { method: "PATCH", json: { active } }),
      runNow: (orgId, id) => request<Routine>(`${org(orgId)}/routines/${enc(id)}/run`, { json: {} }),
      stop: (orgId, id) => request<Routine>(`${org(orgId)}/routines/${enc(id)}/stop`, { json: {} }),
      takeOver: (orgId, id) => request<Routine>(`${org(orgId)}/routines/${enc(id)}/take-over`, { json: {} }),
      continueUsage: (orgId, id) => request<Routine>(`${org(orgId)}/routines/${enc(id)}/continue`, { json: {} }),
      runs: async (orgId, id) => (await request<{ runs: RoutineRun[] }>(`${org(orgId)}/routines/${enc(id)}/runs`)).runs,
      parseRule: (orgId, phrase, timezone) =>
        request<RuleInfo>(`${org(orgId)}/routines/parse-rule`, { json: { phrase, ...(timezone ? { timezone } : {}) } }),
      describeRule: (orgId, rule) => request<RuleInfo>(`${org(orgId)}/routines/describe-rule`, { json: { rule } }),
      update: (orgId, id, patch) =>
        request<Routine>(`${org(orgId)}/routines/${enc(id)}`, { method: "PATCH", json: patch }),
      remove: (orgId, id) => request<void>(`${org(orgId)}/routines/${enc(id)}`, { method: "DELETE" }),
      duplicate: (orgId, id, name) =>
        request<Routine>(`${org(orgId)}/routines/${enc(id)}/duplicate`, { json: name ? { name } : {} }),
      hook: (orgId, id) => request<RoutineHook>(`${org(orgId)}/routines/${enc(id)}/hook`),
      newHookAddress: (orgId, id) =>
        request<RoutineHook>(`${org(orgId)}/routines/${enc(id)}/hook/address`, { json: {} }),
      newHookSecret: (orgId, id) =>
        request<{ secret: string; hook: RoutineHook }>(`${org(orgId)}/routines/${enc(id)}/hook/secret`, { json: {} }),
      removeHookSecret: (orgId, id) =>
        request<RoutineHook>(`${org(orgId)}/routines/${enc(id)}/hook/secret`, { method: "DELETE" }),
      testHook: (orgId, id) =>
        request<{ runId: string | null; hook: RoutineHook }>(`${org(orgId)}/routines/${enc(id)}/hook/test`, {
          json: {},
        }),
      webhookSetup: (orgId, provider) => request<WebhookSetup>(`${org(orgId)}/webhooks/${enc(provider)}`),
      ensureWebhook: (orgId, provider) =>
        request<WebhookSetup>(`${org(orgId)}/webhooks/${enc(provider)}`, { method: "PUT", json: {} }),
      setWebhookSecret: (orgId, provider, secret) =>
        request<WebhookSetup>(`${org(orgId)}/webhooks/${enc(provider)}/secret`, { method: "PUT", json: { secret } }),
      addWebhookToRepo: (orgId, repo) =>
        request<WebhookSetup>(`${org(orgId)}/webhooks/github/repository`, { json: { repo } }),
    },
    wiki: {
      tree: async (orgId) => (await request<{ pages: WikiPageSummary[] }>(`${org(orgId)}/wiki/pages`)).pages,
      get: (orgId, slug) => request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}`),
      search: async (orgId, q) =>
        (await request<{ pages: WikiPageSummary[] }>(`${org(orgId)}/wiki/search`, { query: { q } })).pages,
      create: (orgId, input) => request<WikiPage>(`${org(orgId)}/wiki/pages`, { json: input }),
      update: (orgId, slug, input) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}`, { method: "PUT", json: input }),
      rename: (orgId, slug, title) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/rename`, { json: { title } }),
      history: async (orgId, slug) =>
        (await request<{ versions: WikiVersion[] }>(`${org(orgId)}/wiki/pages/${enc(slug)}/history`)).versions,
      version: (orgId, slug, version) =>
        request<{ version: number; body: string }>(`${org(orgId)}/wiki/pages/${enc(slug)}/versions/${version}`),
      graph: (orgId) => request<WikiGraph>(`${org(orgId)}/wiki/graph`),
      move: (orgId, slug, folder) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/move`, { json: { folder } }),
      lock: (orgId, slug, locked) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/lock`, { json: { locked } }),
      pin: (orgId, slug, pinned) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/pin`, { json: { pinned } }),
      audience: (orgId, slug, access) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/audience`, { method: "PUT", json: access }),
      folderAudience: (orgId, folder) => request(`${org(orgId)}/wiki/folder-audience?folder=${enc(folder)}`),
      setFolderAudience: (orgId, folder, access) =>
        request(`${org(orgId)}/wiki/folder-audience`, { method: "PUT", json: { folder, ...access } }),
      remove: async (orgId, slug) => {
        await request<void>(`${org(orgId)}/wiki/pages/${enc(slug)}`, { method: "DELETE" });
      },
      removeMany: (orgId, target) => request(`${org(orgId)}/wiki/bulk/delete`, { json: target }),
      trash: async (orgId) =>
        (await request<{ pages: WikiPageSummary[] }>(`${org(orgId)}/wiki/pages`, { query: { deleted: "true" } })).pages,
      restoreMany: (orgId, ids) => request(`${org(orgId)}/wiki/trash/restore`, { json: { ids } }),
      purge: (orgId, ids) => request(`${org(orgId)}/wiki/trash/purge`, { json: ids ? { ids } : {} }),
      setAgents: (orgId, ids, agentIds) =>
        request(`${org(orgId)}/wiki/bulk/agents`, { method: "PUT", json: { ids, agentIds } }),
      context: (orgId, slug, on) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/context`, { json: { on } }),
      reads: (orgId) => request<WikiTopRead[]>(`${org(orgId)}/wiki/reads`),
      import: (orgId, input) => request<WikiImportResult>(`${org(orgId)}/wiki/import`, { json: input }),
      githubNotes: (orgId, url) => files.blob(`${org(orgId)}/wiki/import/github?url=${enc(url)}`),
      append: (orgId, slug, input) =>
        request<WikiPage>(`${org(orgId)}/wiki/pages/${enc(slug)}/append`, { json: input }),
    },
    notifications: {
      list: (orgId, query = {}) =>
        request<NotificationPage>(`${org(orgId)}/notifications`, {
          query: { filter: query.filter, cursor: query.cursor, limit: query.limit },
        }),
      count: (orgId) => request<NotificationCount>(`${org(orgId)}/notifications/count`),
      waiting: (orgId, channelId) => request<WaitingList>(`${org(orgId)}/waiting`, { query: { channelId } }),
      read: (orgId, id, read) =>
        request<AppNotification>(`${org(orgId)}/notifications/${enc(id)}/read`, { json: { read } }),
      done: (orgId, id, done) =>
        request<AppNotification>(`${org(orgId)}/notifications/${enc(id)}/done`, { json: { done } }),
      snooze: (orgId, id, until) =>
        request<AppNotification>(`${org(orgId)}/notifications/${enc(id)}/snooze`, { json: { until } }),
      readAll: (orgId, filter) =>
        request<{ ids: string[] }>(`${org(orgId)}/notifications/read-all`, { json: filter ? { filter } : {} }),
      prefs: (orgId) => request<NoticePrefs>(`${org(orgId)}/notification-prefs`),
      setPref: (orgId, category, on) =>
        request<NoticePrefs>(`${org(orgId)}/notification-prefs`, { method: "PUT", json: { category, on } }),
      askAdmins: (orgId, ask) => request<{ sent: number }>(`${org(orgId)}/admin-asks`, { json: ask }),
    },
    calendar: {
      range: (orgId, from, to) => request<CalendarRange>(`${org(orgId)}/calendar`, { query: { from, to } }),
      create: (orgId, input) => request<CalendarEvent>(`${org(orgId)}/calendar/events`, { json: input }),
      confirmProposal: (orgId, id) =>
        request<CalendarEvent>(`${org(orgId)}/calendar/proposals/${enc(id)}/confirm`, { json: {} }),
      dismissProposal: (orgId, id) =>
        request<void>(`${org(orgId)}/calendar/proposals/${enc(id)}/dismiss`, { json: {} }),
      respond: (orgId, id, status) =>
        request<CalendarEvent>(`${org(orgId)}/calendar/events/${enc(id)}/rsvp`, { json: { status } }),
      update: (orgId, id, patch, series) =>
        request<CalendarEvent>(`${org(orgId)}/calendar/events/${enc(id)}`, {
          method: "PATCH",
          json: { ...patch, ...(series ?? {}) },
        }),
      remove: (orgId, id, series) =>
        request<void>(`${org(orgId)}/calendar/events/${enc(id)}`, {
          method: "DELETE",
          ...(series ? { query: series } : {}),
        }),
    },
    customConnectors: {
      list: async (orgId) => (await request<{ servers: CustomServer[] }>(`${org(orgId)}/connectors/custom`)).servers,
      connect: (orgId, input) => request<CustomConnectStart>(`${org(orgId)}/connectors/custom`, { json: input }),
      refresh: (orgId, serverId) =>
        request<CustomServer>(`${org(orgId)}/connectors/custom/${enc(serverId)}/refresh`, { json: {} }),
      saveTools: (orgId, serverId, input) =>
        request<CustomServer>(`${org(orgId)}/connectors/custom/${enc(serverId)}/tools`, {
          method: "PUT",
          json: input,
        }),
      disconnect: (orgId, serverId) =>
        request<void>(`${org(orgId)}/connectors/custom/${enc(serverId)}`, { method: "DELETE" }),
    },
    questions: {
      answer: (orgId, questionId, input) =>
        request<AgentQuestion>(`${org(orgId)}/questions/${enc(questionId)}/answer`, { json: input }),
      dismiss: (orgId, questionId) =>
        request<AgentQuestion>(`${org(orgId)}/questions/${enc(questionId)}/dismiss`, { json: {} }),
    },
    secrets: {
      get: (orgId, requestId) => request<SecretRequest>(`${org(orgId)}/secret-requests/${enc(requestId)}`),
      deliver: (orgId, requestId, box) =>
        request<SecretRequest>(`${org(orgId)}/secret-requests/${enc(requestId)}/deliver`, { json: { box } }),
      decline: (orgId, requestId) =>
        request<SecretRequest>(`${org(orgId)}/secret-requests/${enc(requestId)}/decline`, { json: {} }),
      list: async (orgId, agentId) =>
        (await request<{ secrets: AgentSecret[] }>(`${org(orgId)}/agents/${enc(agentId)}/secrets`)).secrets,
      remove: (orgId, agentId, name, machineId) =>
        request<void>(
          `${org(orgId)}/agents/${enc(agentId)}/secrets/${enc(name)}${machineId ? `?machineId=${enc(machineId)}` : ""}`,
          { method: "DELETE" },
        ),
      saveToVault: (orgId, requestId, input) =>
        request<VaultItem>(`${org(orgId)}/secret-requests/${enc(requestId)}/vault`, { json: input }),
    },
    proposals: {
      list: async (orgId, filter) =>
        (
          await request<{ proposals: Proposal[] }>(
            `${org(orgId)}/proposals${filter?.ids ? `?ids=${enc(filter.ids.join(","))}` : ""}`,
          )
        ).proposals,
      accept: (orgId, id, text) =>
        request<Proposal>(`${org(orgId)}/proposals/${enc(id)}/accept`, { json: text === undefined ? {} : { text } }),
      refuse: (orgId, id) => request<Proposal>(`${org(orgId)}/proposals/${enc(id)}/refuse`, { json: {} }),
      ask: (orgId, id) => request<Proposal>(`${org(orgId)}/proposals/${enc(id)}/ask`, { json: {} }),
    },
    repositories: {
      get: async (orgId, agentId) =>
        (await request<{ repositories: string[] }>(`${org(orgId)}/agents/${enc(agentId)}/repositories`)).repositories,
      set: async (orgId, agentId, repositories) =>
        (
          await request<{ repositories: string[] }>(`${org(orgId)}/agents/${enc(agentId)}/repositories`, {
            method: "PUT",
            json: { repositories },
          })
        ).repositories,
      merge: async (orgId, agentId) =>
        (await request<{ repositories: string[] }>(`${org(orgId)}/agents/${enc(agentId)}/merge-repositories`))
          .repositories,
      setMerge: async (orgId, agentId, repositories) =>
        (
          await request<{ repositories: string[] }>(`${org(orgId)}/agents/${enc(agentId)}/merge-repositories`, {
            method: "PUT",
            json: { repositories },
          })
        ).repositories,
    },
    scopes: {
      get: async (orgId, agentId) =>
        (await request<{ scopes: ScopeGrant[] }>(`${org(orgId)}/agents/${enc(agentId)}/scopes`)).scopes,
      set: async (orgId, agentId, grants) =>
        (
          await request<{ scopes: ScopeGrant[] }>(`${org(orgId)}/agents/${enc(agentId)}/scopes`, {
            method: "PUT",
            json: { scopes: grants },
          })
        ).scopes,
    },
  };
}
