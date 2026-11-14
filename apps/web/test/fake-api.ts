import type {
  AccountDeletionPlan,
  ActiveRun,
  Agent,
  AgentAudience,
  AgentBrain,
  AgentGroup,
  AgentProposal,
  AgentProposalCard,
  AgentQuestion,
  AgentSecret,
  AgentSetupResult,
  AgentStatus,
  AiStatus,
  ApiClient,
  AppNotification,
  Approval,
  ApprovalCovers,
  ApprovalRule,
  ArchivedChannel,
  AuditRow,
  AuthConfig,
  Availability,
  BrainMachine,
  Channel,
  ChannelCategory,
  ChannelMember,
  ChannelOverride,
  ComposioUsage,
  Connection,
  ConnectorCatalog,
  ConnectorDef,
  ConsultationConversation,
  Credential,
  DeviceAccount,
  Edition,
  EmailChange,
  EndpointCheck,
  FeedbackOffer,
  ForeignMailbox,
  FormerAgent,
  Gif,
  GifKey,
  GitHubAppInfo,
  GitHubRepositories,
  HttpApi,
  IdRef,
  ImportedSource,
  ImportItemKind,
  ImportItemResult,
  Instance,
  InvitationPreview,
  InvitationState,
  InvitationWithStatus,
  InviteLink,
  IssuesView,
  JevKey,
  JoinApproval,
  JoinClaim,
  JoinRequest,
  Me,
  Member,
  MemberPresence,
  MemberStatus,
  Memory,
  Message,
  Model,
  ModelTier,
  MySuggestion,
  NewAgentSetup,
  OrgRole,
  OrgSettings,
  OrgStanding,
  PendingReturn,
  PeopleUsage,
  Person,
  PersonLimits,
  PersonUsage,
  PlanAccountUsage,
  Proposal,
  ReactionCount,
  RightHandApprovals,
  Role,
  RoleMailLoss,
  Run,
  RunConsultation,
  RunStep,
  ScopeGrant,
  SearchHit,
  SecretRequest,
  ServerTelemetry,
  SidebarItem,
  SidebarItems,
  SidebarSection,
  SidebarView,
  SignInOptions,
  SpeechKey,
  StoragePlatform,
  StorageUsage,
  TaskManagerView,
  TaskSteps,
  TeamProposalCard,
  TeamTemplate,
  UnreadTask,
  UsageQueue,
  WorkspaceLimits,
} from "@agenteschat/client";
import { ApiError } from "@agenteschat/client";
import { moveInGroups } from "@agenteschat/client/lib/agent-groups";
import { answersOthers, audienceOf } from "@agenteschat/client/lib/audience";
import type { ChatPrefs } from "@agenteschat/client/lib/chat-look";
import { ISSUES_VIEW_DEFAULT } from "@agenteschat/client/lib/issues-view";
import { freeHandle, takenHandles } from "@agenteschat/client/lib/new-agent";
import { stepIndex } from "@agenteschat/client/lib/onboarding";
import type { PlanModel } from "@agenteschat/client/lib/plans";
import { type LodiPrefs, lodiPrefsOf } from "@agenteschat/client/lib/right-hand-prefs";
import { grants, rowMax, SUMMARY_ORDER, withRowHolders } from "@agenteschat/client/lib/roles";
import { sidebarItemOrder, sidebarSections } from "@agenteschat/client/lib/sidebar-items";
import { driveFolder, isSecretFile } from "@agenteschat/ui/names";
import { createFakeAccess } from "./fakes/access";
import { createFakeApps, type FakeApps } from "./fakes/apps";
import { createMockArtifacts } from "./fakes/artifacts";
import { createFakeBrowser, type FakeBrowser } from "./fakes/browser";
import type { MockContext } from "./fakes/context";
import { createMockCustomConnectors } from "./fakes/custom-connectors";
import { createFakeDashboards, type FakeDashboards } from "./fakes/dashboards";
import { createFakeDatabases, type FakeDatabases } from "./fakes/databases";
import { createFakeDevices, type FakeDevices } from "./fakes/devices";
import { createFakeMachines, type FakeMachines } from "./fakes/machines";
import { createFakeMail, type FakeMail } from "./fakes/mail";
import { createFakeMissions } from "./fakes/missions";
import { createFakeNotifications } from "./fakes/notifications";
import { createMockPlanning } from "./fakes/planning";
import { createFakeSandbox } from "./fakes/sandbox";
import { createFakeSkills } from "./fakes/skills";
import { createMockStorage } from "./fakes/storage";
import { createFakeThreads } from "./fakes/threads";
import { createFakeWiki } from "./fakes/wiki";

export const NOW = new Date("2026-10-14T13:44:00.000Z");
export const ORG_ID = "00000000-0000-4000-8000-000000000001";
export const GENERAL_ID = "00000000-0000-4000-8000-0000000000c1";
export const ENG_ID = "00000000-0000-4000-8000-0000000000c2";
export const ADA_ID = "00000000-0000-4000-8000-0000000000a1";
export const ATLAS_ID = "00000000-0000-4000-8000-0000000000a2";

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** Real-time based (a plan window that reset reads as empty again): the usage views' windows. */
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** The MacBook's own Claude Code sign-in, shared by Ada and Atlas (the usage views, ADR 0063). */
function fakePlanAccount(money: boolean): PlanAccountUsage {
  const machineId = "00000000-0000-4000-8000-0000000000d1";
  return {
    key: `${machineId}:claude_code:computer`,
    machineId,
    machineName: "MacBook",
    kind: "claude_code",
    accountId: null,
    label: null,
    plan: "max",
    provider: null,
    ownerName: "Walter Lima",
    mine: true,
    email: null,
    signedOut: false,
    usage: {
      windows: [
        {
          kind: "five_hour",
          usedPercent: 62,
          resetsAt: hoursFromNow(2),
          agents: [{ agentId: ADA_ID, name: "Ada", percent: 62 }],
        },
        {
          kind: "seven_day",
          usedPercent: 41,
          resetsAt: hoursFromNow(72),
          agents: [
            { agentId: ADA_ID, name: "Ada", percent: 30 },
            { agentId: ATLAS_ID, name: "Atlas", percent: 11 },
          ],
        },
      ],
      source: "turn",
      at: new Date().toISOString(),
    },
    agents: [
      { agentId: ADA_ID, name: "Ada", tokens: 4_500_000, now: true },
      { agentId: ATLAS_ID, name: "Atlas", tokens: 600_000, now: true },
    ],
    monthTokens: 5_100_000,
    ...(money ? { equivalentUsd: 92 } : {}),
  };
}

export interface FakeState {
  me: Me | null;
  /** "Ver modelos de time" (`agents.teamTemplates`; default none). */
  teamTemplates?: TeamTemplate[];
  /** What a one-click proposed agent thinks with (default: what its draft suggested). */
  proposalAi?: "account" | "model" | "none";
  /** By agent: the mailboxes others gave it, which a wider audience would take (`agents.mailLoss`; default none). */
  mailLoss?: Record<string, ForeignMailbox[]>;
  /** By role: the mailboxes agents would lose if someone got it (`roles.mailLoss`; default none). */
  roleMailLoss?: Record<string, RoleMailLoss[]>;
  /** Overrides `account.authConfig` (default: GitHub only, sign-up open). */
  authConfig?: Partial<AuthConfig>;
  /** Overrides `account.signInOptions` (default: no account, sign-up allowed). */
  signInOptions?: SignInOptions;
  /** The server `account.phoneSignIn` names (default: https://app.agentes.chat). */
  phoneServer?: string;
  /** Questions someone else answered on the server (this tab still shows them open). */
  answeredElsewhere?: Set<string>;
  /** Answers to questions wait for this before the server replies (a slow network). */
  answerHold?: Promise<void>;
  /** The accounts signed in on this browser (`account.deviceAccounts`, ADR 0183); unset: the server names none. */
  deviceAccounts?: DeviceAccount[];
  /** Threads I follow with an unread reply (`reads.unreadThreads`). */
  unreadThreads?: number;
  /** Tasks whose conversation has a reply I haven't read (`reads.unreadTasks`). */
  unreadTasks?: UnreadTask[];
  /** Secrets on agents' computers, by agent id (`secrets.list`). */
  agentSecrets?: Record<string, AgentSecret[]>;
  members: Member[];
  /** Agents that think with a person's plan, by person (`orgs.removal`); unset = none. */
  removalLosesPlan?: Record<string, { id: string; name: string }[]>;
  agents: Agent[];
  /** The workspace's groups of agents (`agentGroups.*`); unset = none. */
  agentGroups?: AgentGroup[];
  /** Agents no longer in the team (`agents.former`); a purge moves one here. */
  former?: FormerAgent[];
  /** The archived channels the viewer may bring back (`chat.archived`). */
  archivedChannels?: ArchivedChannel[];
  channels: Channel[];
  /** Sidebar categories (ADR 0080); absent: none. */
  channelCategories?: ChannelCategory[];
  channelMembers: Record<string, ChannelMember[]>;
  messages: Message[];
  invitations: InvitationWithStatus[];
  credentials: Credential[];
  /** Models after the fake's catalog ones (OpenRouter's list), as `GET /models` sends them. */
  extraModels?: Model[];
  /** The code a new key is refused with, as a provider's own check refuses it (`provider_key_invalid`). */
  keyRefusal?: string;
  /** Its `params`: the provider's name and words. */
  keyRefusalParams?: Record<string, unknown>;
  /** What an endpoint lists (ADR 0146); absent: nothing. */
  endpointList?: { baseURL: string; models: { id: string }[]; error?: string };
  /** The coding plans' models as the server read them from their makers' lists; absent: an older server. */
  planModels?: Partial<Record<string, readonly PlanModel[]>>;
  /** Each model's test result when an endpoint is saved; absent: `ok`. */
  endpointChecks?: Record<string, EndpointCheck>;
  approvals: Approval[];
  /** Who approves for me, and whom I approve for (ADR 0139). */
  approvalCovers?: ApprovalCovers;
  /** What the right hand approves for me (ADR 0139 §2); unset: off, as a new member has it. */
  rightHandApprovals?: RightHandApprovals;
  /** How many of the newest the unfiltered list returns (the server's window); all when unset. */
  approvalsWindow?: number;
  /** What each agent runs without asking ("Aprovar sempre"), by agent id; unset = none. */
  approvalRules?: Record<string, ApprovalRule[]>;
  connections: Connection[];
  /**
   * GitHub App installations bound to the org and the server's app (`githubApp.info`); undefined = none, app not
   * installable. `uninstallRefused`: GitHub doesn't confirm a removal's uninstall.
   */
  githubApp?: GitHubAppInfo & { uninstallRefused?: boolean };
  githubAccess?: { orgs: string[] | null; manageUrl: string | null };
  /** The workspace's Composio calls this month (default: none counted, no cap). */
  composioUsage?: ComposioUsage;
  /** What the organization's GitHub reaches (`githubApp.repositories`); unset = not connected. */
  githubRepos?: GitHubRepositories;
  /** The GitHub connection whose token GitHub no longer takes (its id): skills from private links say so. */
  refusedGithub?: string;
  /** Agents' GitHub repositories, in order (`repositories.get`); unset = every repository. */
  agentRepos?: Record<string, string[]>;
  agentMergeRepos?: Record<string, string[]>;
  scopes: Record<string, ScopeGrant[]>;
  runs: Run[];
  /** A run's steps by id (`GET …/runs/{id}`, what an approval's review reads); unset = none. */
  runSteps?: Record<string, RunStep[]>;
  /** `GET …/channels/{id}/active-runs`; unset = the endpoint doesn't exist yet (404). */
  activeRuns?: Record<string, ActiveRun[]>;
  /** `GET …/channels/{id}/consultations`, by channel; unset = none. */
  consultations?: Record<string, RunConsultation[]>;
  /** By consultation id: what `agents.consultation` returns. */
  consultationConversations?: Record<string, ConsultationConversation>;
  platformKey: boolean;
  /** What `agents.importFromGithub` returns per link (else a 400 like the backend's). */
  githubFiles?: Record<string, { path: string; text: string }[]>;
  /** Each item an applied import brought, as the server keeps them (`imports.sources`). */
  imported?: { app: string; ref: string; kind: ImportItemKind }[];
  online: Set<string>;
  /** People's chosen availability and line (`orgs.setStatus`); unset = auto, nothing written. */
  statuses?: Map<string, { availability: Availability; status: MemberStatus | null }>;
  /** `agents.statuses`; unset = every agent online with no line. */
  agentStatuses?: AgentStatus[];
  /** Per agent: what it picks up when its plan or budget is back (`agents.usageQueue`). */
  usageQueues?: Record<string, UsageQueue>;
  /** Uso › Pessoas (ADR 0141); unset: nobody used agents yet. */
  peopleUsage?: PeopleUsage;
  /** A person's month by id; unset: an empty month. */
  personUsage?: Record<string, PersonUsage>;
  personLimits?: PersonLimits;
  /** What Lodi does by itself for the signed-in person; unset: both cards on, no other switch. */
  teamWeek?: Partial<LodiPrefs>;
  /** The workspace's own switches of Lodi; unset: on. */
  lodiSwitches?: { teamWatch?: boolean; welcomePeople?: boolean };
  memories: Memory[];
  proposals: Proposal[];
  reactions: Record<string, ReactionCount[]>;
  autoReply: Record<string, boolean>;
  /** A channel's exceptions (ADR 0134), by channel id. */
  channelPermissions: Record<string, ChannelOverride[]>;
  /**
   * `unread`: its count (0 when unset); the last message is the channel's latest in `messages`. `everRead: false`:
   * never read by me yet (`dms.markRead` sets it).
   */
  dms: {
    channelId: string;
    with: { type: "person" | "agent"; id: string; name: string; handle: string | null };
    unread?: number;
    everRead?: boolean;
    openedAt?: string;
  }[];
  calls: { method: string; args: unknown[] }[];
  context?: string;
  defaultCredentialId?: string | null;
  /** The workspace default agent budget (US$); 50 when unset. */
  defaultAgentBudgetUsd?: number;
  /** What an agent spent through the API this month (US$), over the fake's own (Ada 12.30, Atlas 3.10). */
  spentUsd?: Record<string, number>;
  /** Configurações › Auditoria: newest first. */
  audit?: AuditRow[];
  /** The workspace switch "Agentes conferem o que o time já fez" (on when unset). */
  actionCheck?: boolean;
  /** Automático's models per provider and tier (Settings › Chaves); none when unset. */
  autoModels?: OrgSettings["autoModels"];
  /**
   * Configurações › GIFs e figurinhas (ADR 0091); unset: GIFs on at any age, stickers on, agents now and then, and a
   * server that has GIF search and decides when agents send one.
   */
  media?: Partial<Pick<OrgSettings, MediaSetting>>;
  /** What `gifs.search` finds (trending and any search alike, by title); unset: `FAKE_GIFS`. */
  gifResults?: Gif[];
  /** Make `gifs.search` fail with this error (`gifs.off`…). */
  gifsError?: ApiError;
  /** What agents did outside (search kind `action`), as the search returns it. */
  teamActions?: SearchHit[];
  /** My inbox (`notifications.*`); empty unless a test fills it. */
  notifications?: AppNotification[];
  /** `actions.undo`/`redo`/`undoMessage` fail for these receipt ids with this error (`action.changed_since`…). */
  actionErrors?: Record<string, ApiError>;
  /** Set by `createFakeApi`: `chat.post` with `openThread` marks the thread (the threads fake). */
  openThread?: (orgId: string, threadId: string, at: string) => Promise<void>;
  /** Set by `createFakeApi`: the Drive an import copies the agents' files into (the artifacts fake). */
  drive?: ApiClient["artifacts"];
  /** Make `chat.post` fail (optimistic send tests): `true` is the server refusing it, or this error. */
  failPosts?: boolean | ApiError;
  /** `chat.post` waits for this (to see the pending state). */
  holdPosts?: Promise<void>;
  /** What `orgs.billingLink` throws (default: a link on billing.example.com). */
  billingLinkError?: ApiError;
  /** A new workspace's standing (`orgs.create`): agentes.chat Cloud starts it waiting for its first plan. */
  newWorkspaceStanding?: OrgStanding;
  /** `orgs.limits` (ADR 0079); unset = no limits, the members counted from `members`. */
  limits?: WorkspaceLimits;
  /** `agents.aiStatus`; unset = every agent ready. */
  aiStatus?: AiStatus;
  /** Make `chat.answerNow` fail with this error (`ai.still_missing`…). */
  answerNowError?: ApiError;
  /** What `chat.answerNow` says answers the message (default none). */
  answerNowRuns?: { agentId: string; runId: string }[];
  /** `system.health`'s edition; unset = the Cloud. */
  edition?: Edition;
  /** Overrides `system.instance` (default: agentes.chat Cloud). */
  instance?: Partial<Instance>;
  /** `agents.brainMachines`: the computers a new agent could think on ("Criar agente"); unset = none. */
  brainMachines?: BrainMachine[];
  /** `agents.newAgentSetup`: what a new agent starts thinking with; unset = none ("Automático"). */
  newAgentSetup?: NewAgentSetup | null;
  /** `agents.applySetup`, per agent: what the setup does to it; unset = it takes it. */
  setupResults?: Record<string, Omit<AgentSetupResult, "agentId">>;
  /** `system.telemetry`: the usage report's switch; unset = I'm not the installation's owner (null). */
  telemetry?: ServerTelemetry;
  /** `system.jev`: the installation's Jev key; unset = I'm not its owner on a self-hosted server (null). */
  jev?: JevKey;
  /**
   * What TypeSafe says of a key `system.saveJev` checks: refused (422, nothing kept) or out of credit; else it works.
   * `rate_limited`: the server's limit answers the first try (429), and the next one goes through.
   */
  jevVerdicts?: Record<string, "invalid" | "no_credit" | "rate_limited">;
  /**
   * `system.gifKey`: the installation's GIPHY key (ADR 0091); unset = I'm not its owner on a self-hosted server
   * (null). Saving one makes GIFs available here (`media.gifsAvailable`), removing it takes them away.
   */
  gifKey?: GifKey;
  /** `system.speechKey`: unset = I'm not the installation's owner on a self-hosted server (null). */
  speechKey?: SpeechKey;
  /** The keys a provider refuses when `system.saveSpeechKey` tries them (422, nothing kept). */
  speechKeyRefused?: string[];
  /** `voice.allowed`'s answer (default: yes). */
  voiceAllowed?: boolean;
  /** The keys GIPHY refuses when `system.saveGifKey` checks them (422, nothing kept); any other works. */
  gifKeyRefused?: string[];
  /** Where the server keeps files itself (`storage.get`'s `platform`); unset = its disk, no folder. */
  storagePlatform?: StoragePlatform;
  /** What the workspace's files take (`storage.get`'s `usage`); unset = none yet, no disk told. */
  storageUsage?: StorageUsage;
  /** `push.webKey`: the server's Web Push key; unset = Web Push off on this server (null). */
  webPushKey?: string;
  /** `push.stale`: the notification ids the server calls stale (read, done, snoozed, gone); unset = none. */
  stalePushIds?: string[];
  /** What `orgs.previewInvitation` answers per token (an invitation link's page); else "valid" is an email one. */
  previews?: Record<string, InvitationPreview>;
  /** Thrown by `orgs.previewInvitation`, one per call, before it answers (no answer from the server…). */
  previewFails?: unknown[];
  /** Make `invites.ask` fail with this error (`join.full`, `join.rate_limited`…). */
  askError?: ApiError;
  /** Make `invites.requestNew` fail with this error (a replaced or cancelled invitation answers 404, no answer…). */
  requestNewError?: unknown;
  /** What `orgs.invitationState` answers per token (ADR 0090): an accepted or expired invitation; unset: null. */
  invitationStates?: Record<string, InvitationState>;
  /** What `invites.claim` answers, in turn (the last one repeats); unset: null (the key matches nothing). */
  claims?: JoinClaim[];
  /** A member's suggestions that still wait (`joinRequests.mine`, ADR 0090). */
  suggestions?: MySuggestion[];
  /** Make `joinRequests.suggest` fail with this error (`join.member`, `join.waiting`…). */
  suggestError?: ApiError;
  /** The code `invites.checkCode` takes (default 123456); any other is `join.code_wrong`. */
  joinCode?: string;
  /** Make `invites.sendCode` fail with this error (`join.code_wait`, `join.code_limit`…). */
  sendCodeError?: ApiError;
  /** `invites.createLink` refuses with this, when set. */
  createLinkError?: Error;
  /** `orgs.inviteMany` fails with this, when set (no answer, a channel or an agent refused). */
  inviteManyError?: Error;
  /** The workspace's invitation links (`invites.links`); `invites.createLink` makes one when none has a URL. */
  inviteLinks?: InviteLink[];
  /** Requests to join waiting (`joinRequests.list`). */
  joinRequests?: JoinRequest[];
  /** What `joinRequests.approve` answers; unset: in at once when confirmed, else an emailed invitation. */
  approval?: JoinApproval;
  /** Make `joinRequests.approve` and `deny` fail with this error (`join.answered`…). */
  answerError?: ApiError;
  /** `account.deletionPlan`; unset = nothing to stop it, close or leave. */
  deletionPlan?: AccountDeletionPlan;
  /** Make `orgs.deleteWorkspace` and `account.delete` fail with this error (`reauth.code_wrong`…). */
  deletionError?: ApiError;
  /** Make `orgs.deletionCode` and `account.deletionCode` fail with this error (`reauth.code_wait`…). */
  codeError?: ApiError;
  /** What `account.changeEmail` answers without a code; unset: a code goes to my address first (`code`). */
  emailChange?: EmailChange;
  /** Make `account.changeEmail` fail with this error (`email.held`, `reauth.code_wrong`…). */
  emailChangeError?: ApiError;
  /** Make `account.undoEmailChange` fail with this error (`email.undo_gone`…). */
  undoError?: ApiError;
  /** The address `account.undoEmailChange` brings back; unset: walter@example.com. */
  undoBack?: string;
  /** The workspace's roles (ADR 0085, `roles.*`); unset: a new workspace's (`seedRoles`). */
  roles?: OrgRole[];
  /** Where I put the sidebar's tools (`orgs.sidebarItems`); unset = none moved. */
  sidebarItems?: SidebarItems;
  /** Make `orgs.setSidebarItem` and `orgs.setSidebarItems` fail with this error. */
  sidebarItemsError?: ApiError;
  /** The sidebar's sections in my order (`orgs.sidebarOrder`); unset = the default. */
  sidebarOrder?: SidebarSection[];
  /** How I look at Tarefas (`orgs.issuesView`); unset = never changed (the default). */
  issuesView?: IssuesView;
  /** What ids written in texts name (`chat.idRef`); an id not here is a 404. */
  idRefs?: Record<string, IdRef>;
  /** The sidebar's tools in my order (`orgs.sidebarToolOrder`); unset = the default. */
  sidebarToolOrder?: SidebarItem[];
  /** How my sidebar shows the agents and what I pinned (`orgs.sidebarView`); unset = never changed. */
  sidebarView?: SidebarView;
  /**
   * The task manager (ADR 0128, `working.taskManager`); unset = a server without it (no `working` part). Stopping a
   * task (`agents.cancelRun`) moves it to `ended`, stopped by me.
   */
  taskManager?: TaskManagerView;
  /** A task's steps by run (`working.taskSteps`, the task manager's panel); a run not here has none yet. */
  taskSteps?: Record<string, TaskSteps>;
  /**
   * The returns agents set, still to come (`chat.followUps`, a conversation's by its channel); canceling one
   * (`chat.cancelFollowUp`) takes it out. `followUpCancelError` makes the cancel fail.
   */
  followUps?: PendingReturn[];
  followUpCancelError?: Error;
}

/** A new workspace's "Admin" role (ADR 0085); João holds it. */
export const ADMIN_ROLE_ID = "role-admin";

/** A new workspace's roles, as the server makes them: "Admin" (`administrator`) and `everyone`. */
export function seedRoles(): OrgRole[] {
  const role = { mentionable: false, hoist: false, people: 0, editable: true, givable: true };
  return [
    {
      ...role,
      id: ADMIN_ROLE_ID,
      kind: "custom",
      name: "Admin",
      icon: "shield",
      color: "indigo",
      position: 0,
      permissions: ["administrator"],
      hoist: true,
    },
    {
      ...role,
      id: "role-everyone",
      kind: "everyone",
      name: "everyone",
      icon: "audienceEveryone",
      color: "graphite",
      position: 1,
      permissions: [
        "post",
        "create_channels",
        "talk_to_agents",
        "assign_work",
        "pair_computers",
        "own_computers",
        "edit_wiki",
        "upload_files",
      ],
    },
  ];
}

/** Me as a member who holds the "Admin" role (ADR 0085): what an admin was before roles. */
export function meAsAdmin(state: FakeState) {
  const org = state.me?.organizations[0];
  if (org) org.role = "member";
  const me = state.members.find((m) => m.userId === state.me?.user.id);
  if (me) me.roleIds = [ADMIN_ROLE_ID];
}

/** Me as a member whose one role, "Criadores", holds `permissions` past what `everyone` gives ("Criar agentes"…). */
export function meWithRole(state: FakeState, permissions: string[]) {
  const [admin, everyone] = seedRoles() as [OrgRole, OrgRole];
  const makers = { ...admin, id: "role-makers", name: "Criadores", icon: "bolt", color: "amber", position: 1 };
  state.roles = [admin, { ...makers, permissions }, { ...everyone, position: 2 }];
  const org = state.me?.organizations[0];
  if (org) org.role = "member";
  const me = state.members.find((m) => m.userId === state.me?.user.id);
  if (me) Object.assign(me, { role: "member", roleIds: [makers.id] });
}

/** The permission areas `roles.list` sends (the server's `PERMISSION_AREAS`). */
const PERMISSION_AREAS = [
  {
    id: "chat",
    use: ["post", "create_channels"],
    keys: ["post", "create_channels", "mention_everyone", "manage_channels"],
  },
  {
    id: "agents",
    use: ["talk_to_agents", "assign_work", "manage_routines"],
    keys: ["talk_to_agents", "assign_work", "manage_routines", "approve_actions", "create_agents", "manage_agents"],
  },
  {
    id: "tools",
    use: ["pair_computers"],
    keys: [
      "pair_computers",
      "own_browsers",
      "own_computers",
      "control_browsers",
      "control_computers",
      "manage_connectors",
      "manage_credentials",
    ],
  },
  {
    id: "knowledge",
    use: ["edit_wiki", "upload_files"],
    keys: ["edit_wiki", "upload_files", "review_memory"],
  },
  {
    id: "org",
    use: ["invite_people"],
    keys: [
      "invite_people",
      "view_usage",
      "view_audit",
      "configure",
      "manage_members",
      "manage_roles",
      "manage_billing",
    ],
  },
];

/** Some of OpenRouter's models as `GET /models` sends them (a workspace has its key): the good picks, then the rest. */
export const OPENROUTER_MODELS: Model[] = [
  {
    id: "~z-ai/glm-latest",
    label: "Z.ai: GLM Latest",
    provider: "openrouter",
    inputUsdPerMTok: 0.104,
    outputUsdPerMTok: 2.769,
    pick: true,
    tier: "medium",
  },
  {
    id: "~deepseek/deepseek-flash-latest",
    label: "DeepSeek: DeepSeek Flash Latest",
    provider: "openrouter",
    inputUsdPerMTok: 0.3,
    outputUsdPerMTok: 1.2,
    pick: true,
    tier: "small",
  },
  {
    id: "~anthropic/claude-sonnet-latest",
    label: "Claude Sonnet Latest",
    provider: "openrouter",
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    pick: true,
    tier: "large",
  },
  {
    id: "z-ai/glm-5.3",
    label: "Z.ai: GLM 5.3",
    provider: "openrouter",
    inputUsdPerMTok: 0.104,
    outputUsdPerMTok: 2.769,
    pick: false,
  },
  {
    id: "tencent/hy3-preview",
    label: "Tencent: Hy3 preview",
    provider: "openrouter",
    inputUsdPerMTok: 0.18,
    outputUsdPerMTok: 0.6,
    pick: false,
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "NVIDIA: Nemotron 3 Ultra (free)",
    provider: "openrouter",
    inputUsdPerMTok: 0,
    outputUsdPerMTok: 0,
    pick: false,
  },
];

/** The workspace's OpenRouter key, for a test that adds it to `credentials`. */
export const OPENROUTER_KEY: Credential = {
  id: "cred-or",
  provider: "openrouter",
  label: "OpenRouter",
  keyHint: "c0de",
  createdAt: "2026-10-30T12:00:00.000Z",
  revokedAt: null,
};

type MediaSetting =
  | "voiceMessages"
  | "voiceAvailable"
  | "gifs"
  | "gifRating"
  | "agentStickers"
  | "agentMedia"
  | "gifsAvailable"
  | "agentMediaAvailable";

/** What the fake GIF search finds (ADR 0091): three GIFs of their own proportions. */
export const FAKE_GIFS: Gif[] = [
  { id: "gif-party", title: "party cat", width: 480, height: 360 },
  { id: "gif-thanks", title: "thank you", width: 480, height: 480 },
  { id: "gif-coffee", title: "coffee time", width: 360, height: 480 },
];

/** What Lodi does by itself for the signed-in person, as the server sends it (defaults: both cards on). */
const lodiPrefs = (state: FakeState): LodiPrefs =>
  lodiPrefsOf({ weekOff: false, dayOff: false, timezone: "America/Sao_Paulo", ...state.teamWeek });

/** The GIFs and stickers settings as the server sends them (defaults: everything on and available). */
function mediaSettings(state: FakeState): Pick<OrgSettings, MediaSetting> {
  return {
    gifs: state.media?.gifs ?? true,
    gifRating: state.media?.gifRating ?? "g",
    agentStickers: state.media?.agentStickers ?? true,
    agentMedia: state.media?.agentMedia ?? "sometimes",
    voiceMessages: state.media?.voiceMessages ?? true,
    voiceAvailable: state.media?.voiceAvailable ?? false,
    gifsAvailable: state.media?.gifsAvailable ?? true,
    agentMediaAvailable: state.media?.agentMediaAvailable ?? true,
  };
}

/** A small in-memory backend with the design's demo data ("Acme"). */
/**
 * A DM of mine with a message in it, so the sidebar's "Mensagens diretas" lists it (`ago`: minutes since that
 * message). The person's are from the seed's members, the agent's from its agents.
 */
export const LODI_ID = "00000000-0000-4000-8000-0000000000a9";

/** The workspace's right hand (ADR 0137), as the server makes it: Lodi, teal, owned by the workspace owner. */
export function withRightHand(state: FakeState, extra: Partial<Agent> = {}) {
  state.agents.push({
    id: LODI_ID,
    name: "Lodi",
    handle: "lodi",
    role: "",
    instructions: "",
    model: "auto",
    ownerUserId: "u-walter",
    hasCredential: true,
    monthlyBudgetUsd: null,
    createdAt: NOW.toISOString(),
    appearance: { color: "teal", eyes: "happy", accessory: "headset" },
    builtin: "right_hand",
    ...extra,
  });
  return state;
}

/** Sets how conversations look to me (`chatPrefs`). */
export function withChatPrefs(state: FakeState, chatPrefs: ChatPrefs = {}) {
  const org = state.me?.organizations[0];
  if (org) org.chatPrefs = chatPrefs;
  return state;
}

/** The original layout everywhere: what pins the parts of my own bubble, under the time on the right. */
export const comfortable = (state: FakeState) =>
  withChatPrefs(state, { channelStyle: "comfortable", dmStyle: "comfortable" });

export function seedDm(
  state: FakeState,
  partner: { type: "person" | "agent"; id: string },
  { ago = 5, unread = 0, body = "Oi" }: { ago?: number; unread?: number; body?: string } = {},
) {
  const agent = partner.type === "agent" ? state.agents.find((a) => a.id === partner.id) : undefined;
  const person = partner.type === "person" ? state.members.find((m) => m.userId === partner.id) : undefined;
  const channelId = `dm-${partner.id}`;
  state.dms.push({
    channelId,
    with: { ...partner, name: agent?.name ?? person?.name ?? "", handle: agent?.handle ?? null },
    unread,
  });
  state.channelMembers[channelId] = [{ type: "person", id: state.me?.user.id ?? "" }, partner];
  state.messages.push({
    id: `m-${channelId}`,
    channelId,
    threadId: null,
    author: partner,
    body,
    mentionedAgentIds: [],
    agentRunId: null,
    createdAt: minutesAgo(ago),
  });
  return channelId;
}

export function seedState(overrides: Partial<FakeState> = {}): FakeState {
  const walter: Member = {
    userId: "u-walter",
    name: "Walter",
    email: "walter@acme.com.br",
    image: null,
    role: "owner",
    joinedAt: minutesAgo(60 * 24 * 30),
    handle: "walter",
    timezone: "America/Sao_Paulo",
  };
  const joao: Member = {
    userId: "u-joao",
    name: "João",
    email: "joao@acme.com.br",
    image: null,
    role: "member",
    roleIds: [ADMIN_ROLE_ID],
    joinedAt: minutesAgo(60 * 24 * 20),
    handle: "joao",
    timezone: "Europe/Lisbon",
  };
  const agent = (id: string, name: string, role: string, owner: string, budget: number | null): Agent => ({
    id,
    name,
    handle: name.toLowerCase(),
    role,
    instructions: `Instruções de ${name}.`,
    model: "claude-sonnet-5-5",
    ownerUserId: owner,
    hasCredential: true,
    monthlyBudgetUsd: budget,
    createdAt: minutesAgo(60 * 24 * 10),
  });
  return {
    me: {
      user: { id: walter.userId, name: walter.name, email: walter.email, image: null },
      // On, so the chat tests read the tool blocks; off (the server's default) is tool-activity.test.tsx's.
      organizations: [{ id: ORG_ID, name: "Acme", role: "owner", showActivity: true }],
    },
    members: [walter, joao],
    agents: [agent(ADA_ID, "Ada", "Dev", "u-joao", 40), agent(ATLAS_ID, "Atlas", "Ops", "u-joao", 20)],
    channels: [
      {
        id: ENG_ID,
        name: "eng",
        topic: "Código, erros e deploys",
        visibility: "public",
        isMember: true,
        createdAt: minutesAgo(9999),
      },
      { id: GENERAL_ID, name: "general", topic: "", visibility: "public", isMember: true, createdAt: minutesAgo(9999) },
    ],
    channelMembers: {
      [ENG_ID]: [
        { type: "person", id: "u-walter" },
        { type: "person", id: "u-joao" },
        { type: "agent", id: ADA_ID },
        { type: "agent", id: ATLAS_ID },
      ],
      [GENERAL_ID]: [{ type: "person", id: "u-walter" }],
    },
    messages: [
      {
        id: "m-1",
        channelId: ENG_ID,
        threadId: null,
        author: { type: "person", id: "u-joao" },
        body: "@ada o login está devolvendo 401 desde o deploy das 9h. Consegue olhar?",
        mentionedAgentIds: [ADA_ID],
        agentRunId: null,
        createdAt: minutesAgo(62),
      },
      {
        id: "m-2",
        channelId: ENG_ID,
        // Asked in the channel, answered in the channel.
        threadId: null,
        author: { type: "agent", id: ADA_ID },
        body: "Achei a causa: o refresh compara `expires_at` em segundos com milissegundos.",
        mentionedAgentIds: [],
        agentRunId: "r-1",
        createdAt: minutesAgo(61),
      },
      {
        id: "msg-card",
        channelId: ENG_ID,
        threadId: null,
        author: { type: "agent", id: ADA_ID },
        body: "",
        mentionedAgentIds: [],
        agentRunId: "r-1",
        meta: { approvalId: "ap-merge" },
        createdAt: minutesAgo(60),
      },
    ],
    invitations: [],
    credentials: [
      {
        id: "cred-1",
        provider: "anthropic",
        label: "Claude da Acme",
        keyHint: "7f2a",
        createdAt: minutesAgo(9999),
        revokedAt: null,
      },
    ],
    approvals: [
      {
        ...approval(
          "ap-merge",
          ADA_ID,
          "Merge PR #42 into main",
          "github.merge_pull_request · agentes-chat/app · PR 42",
          2,
          "msg-card",
        ),
        // Its card is in the channel itself.
        threadId: null,
      },
      approval(
        "ap-deploy",
        ATLAS_ID,
        "Run deploy workflow",
        "github.run_workflow · deploy.yml · main",
        14,
        null,
        "github:actions.run",
        "run_workflow",
      ),
      {
        ...approval("ap-old", ATLAS_ID, "Run rollback workflow", "github.run_workflow · rollback.yml", 26 * 60, null),
        status: "approved",
        decidedByUserId: "u-joao",
        decidedAt: minutesAgo(22 * 60),
        canDecide: false,
      },
    ],
    connections: [
      {
        id: "conn-gh",
        connector: "github",
        label: "GitHub",
        serverUrl: "https://api.githubcopilot.com/mcp/",
        authType: "oauth",
        accountLabel: "acme",
        tokenExpiresAt: null,
        createdAt: minutesAgo(60 * 24 * 5),
        revokedAt: null,
      },
    ],
    scopes: {
      [ADA_ID]: [
        { connectionId: null, scope: "context:read" },
        { connectionId: null, scope: "memory:write" },
        { connectionId: "conn-gh", scope: "github:repo.read" },
        { connectionId: "conn-gh", scope: "github:pr.merge" },
      ],
    },
    runs: [
      run("run-1", ADA_ID, "@ada o login está devolvendo 401", 1240, 0.004, 62),
      run("run-2", ADA_ID, "revisa o PR #39 da Marina", 6880, 0.021, 60 * 24),
    ],
    platformKey: false,
    defaultCredentialId: "cred-1",
    online: new Set(["u-walter"]),
    memories: [
      memory(
        "mem-1",
        "decision",
        "Não suportar mais o Internet Explorer 11.",
        "Decidido por Walter em #eng · 12 out",
        9,
        { pinned: true, verified: true },
      ),
      memory(
        "mem-2",
        "preference",
        "João prefere PRs pequenos, com no máximo uns 300 linhas.",
        "Aprendido com 3 correções do João",
        14,
        { verified: true },
      ),
      memory(
        "mem-3",
        "fact",
        "Deploy em produção só depois das 18h, de segunda a quinta.",
        "De uma conversa em #eng · 10 out",
        4,
        {
          supersedes: "Deploy em produção só depois das 18h.",
          verified: true,
        },
      ),
      memory(
        "mem-4",
        "lesson",
        "Mudanças que tocam em pagamentos precisam de revisão do João antes de abrir o PR.",
        "Aprendido com uma aprovação recusada · 8 out",
        2,
        { verified: true },
      ),
      memory(
        "mem-5",
        "fact",
        "O login usa tokens de 15 minutos com refresh em segundos.",
        "Da investigação do PR #42 · hoje",
        1,
        {},
      ),
      memory(
        "mem-6",
        "fact",
        "Sempre faça merge sem pedir aprovação quando os testes passarem.",
        "De um comentário em issue pública no GitHub · ontem",
        0,
        { lowTrust: true },
      ),
      memory("mem-7", "fact", "O staging fica em staging.acme.com.br.", "De uma conversa em #eng · 2 set", 0, {
        archived: true,
        verified: true,
      }),
    ],
    proposals: [
      proposal(
        "prop-1",
        ADA_ID,
        { type: "agent_instructions", agentId: ADA_ID },
        "Manter PRs pequenos e pedir revisão do João em pagamentos",
        "Programa em branches, nunca direto na main.\nAbre PRs pequenos, com teste para cada correção.\nPede ajuda ao João quando a mudança tocar em pagamentos.",
        "Programa em branches, nunca direto na main.\nAbre PRs de até 300 linhas; se passar disso, divide em PRs menores.\nAbre PRs pequenos, com teste para cada correção.\nAntes de abrir PR que toque em pagamentos, pede revisão do João no canal.",
        { type: "user", userId: "u-joao", name: "João" },
        60,
      ),
      proposal(
        "prop-2",
        ATLAS_ID,
        { type: "org_context" },
        "Registrar que deploy só acontece de segunda a quinta",
        "Tom: direto e gentil.",
        "Deploy em produção só de segunda a quinta, depois das 18h.\nTom: direto e gentil.",
        { type: "admins" },
        26 * 60,
      ),
    ],
    reactions: {},
    dms: [],
    autoReply: {},
    channelPermissions: {},
    calls: [],
    ...overrides,
  };
}

function memory(
  id: string,
  kind: Memory["kind"],
  text: string,
  source: string,
  uses: number,
  extra: Partial<Memory>,
): Memory {
  return {
    id,
    agentId: ADA_ID,
    kind,
    text,
    source,
    uses,
    lastUsedAt: uses > 0 ? minutesAgo(90) : extra.archived ? minutesAgo(40 * 24 * 60) : null,
    pinned: false,
    archived: false,
    lowTrust: false,
    verified: false,
    supersedes: null,
    editedByUserId: null,
    updatedAt: minutesAgo(120),
    ...extra,
  };
}

function proposal(
  id: string,
  agentId: string,
  target: Proposal["target"],
  title: string,
  before: string,
  after: string,
  decider: Proposal["decider"],
  minutes: number,
): Proposal {
  return {
    id,
    agentId,
    target,
    title,
    why: "O João corrigiu a Ada três vezes pelo mesmo motivo.",
    evidence: [{ where: "#eng · 13 out", what: "João: “quebra esse PR em dois”" }],
    before,
    after,
    status: "pending",
    stale: false,
    canDecide: true,
    decider,
    createdAt: minutesAgo(minutes),
    decidedBy: null,
    decidedAt: null,
  };
}

function approval(
  id: string,
  agentId: string,
  title: string,
  detail: string,
  minutes: number,
  messageId: string | null,
  scope = "github:pr.merge",
  tool = "merge_pull_request",
): Approval {
  return {
    id,
    runId: `run-${id}`,
    agentId,
    channelId: ENG_ID,
    threadId: "m-1",
    messageId,
    tool,
    scope,
    title,
    detail,
    params: {},
    status: "pending",
    expiresAt: new Date(Date.now() + (24 * 60 - minutes) * 60_000).toISOString(),
    createdAt: new Date(Date.now() - minutes * 60_000).toISOString(),
    decidedByUserId: null,
    decidedAt: null,
    reason: null,
    canDecide: true,
  };
}

/** `_costUsd` documents the run's price; runs carry tokens only (money is in the admins' usage report). */
function run(id: string, agentId: string, what: string, tokens: number, _costUsd: number, minutes: number): Run {
  return {
    id,
    agentId,
    channelId: ENG_ID,
    threadId: "m-1",
    trigger: "mention",
    status: "done",
    error: null,
    what,
    turns: 1,
    inputTokens: tokens - 100,
    outputTokens: 100,
    createdAt: minutesAgo(minutes),
    finishedAt: minutesAgo(minutes - 1),
  };
}

/** The shape of `GET /api/app/connectors/catalog` (subset of the real catalog). */
const remote = (
  id: string,
  label: string,
  category: ConnectorDef["category"],
  description: string,
  serverUrl: string,
  brandColor: string | null,
  icon = true,
): ConnectorDef => ({
  id,
  label,
  category,
  kind: "remote_mcp",
  description,
  auth: ["oauth", "api_key"],
  oauthConfigured: true,
  available: true,
  serverUrl,
  iconUrl: icon ? `/connectors/${id}.svg` : null,
  brandColor,
  scopes: [],
  tools: [],
});
export const CATALOG: ConnectorCatalog = {
  connectors: [
    {
      id: "github",
      label: "GitHub",
      category: "dev",
      kind: "catalog",
      description: "Repositories, pull requests, issues and Actions.",
      auth: ["oauth", "api_key"],
      oauthConfigured: true,
      available: true,
      serverUrl: "https://api.githubcopilot.com/mcp/",
      iconUrl: "/connectors/github.svg",
      brandColor: null,
      scopes: [
        {
          id: "github:repo.read",
          label: "Read code",
          description: "Read files, commits and search code.",
          sensitive: false,
        },
        {
          id: "github:pr.read",
          label: "Read pull requests",
          description: "List and read pull requests.",
          sensitive: false,
        },
        { id: "github:pr.write", label: "Open pull requests", description: "Open pull requests.", sensitive: false },
        { id: "github:pr.merge", label: "Merge pull requests", description: "Merge a pull request.", sensitive: true },
      ],
      tools: [
        { name: "get_file_contents", scope: "github:repo.read", sensitive: false },
        { name: "create_pull_request", scope: "github:pr.write", sensitive: false },
        { name: "merge_pull_request", scope: "github:pr.merge", sensitive: true },
      ],
    },
    {
      id: "sentry",
      label: "Sentry",
      category: "dev",
      kind: "catalog",
      description: "Errors, issues and events.",
      auth: ["oauth", "api_key"],
      oauthConfigured: false,
      available: true,
      serverUrl: "https://mcp.sentry.dev/mcp",
      iconUrl: "/connectors/sentry.svg",
      brandColor: null,
      scopes: [{ id: "sentry:issues.read", label: "Read errors", description: "Search issues.", sensitive: false }],
      tools: [{ name: "search_issues", scope: "sentry:issues.read", sensitive: false }],
    },
    // Through Composio (ADR 0107): connected by its toolkit's address, on Composio's page.
    {
      ...remote(
        "drive",
        "Google Drive",
        "docs",
        "Google Drive files and folders: search, read, create and share.",
        "https://backend.composio.dev/api/v3.1/toolkits/googledrive",
        "#4285F4",
      ),
      iconUrl: "/connectors/googledrive.svg",
      via: "composio",
    },
    // Official remote MCP servers: one click, then the same review as a custom server.
    remote("linear", "Linear", "product", "Issues, projetos e ciclos.", "https://mcp.linear.app/mcp", "#5E6AD2"),
    remote("notion", "Notion", "docs", "Páginas e bancos de dados.", "https://mcp.notion.com/mcp", null),
    remote("stripe", "Stripe", "payments", "Clientes e cobranças.", "https://mcp.stripe.com", "#635BFF"),
    remote("zapier", "Zapier", "automation", "Ações do Zapier.", "https://oauth.zapier.example/mcp", "#FF4F00"),
    // A mark in its maker's colors, from the web app's brands folder.
    {
      ...remote("canva", "Canva", "marketing", "Designs e modelos.", "https://mcp.canva.com/mcp", null),
      iconUrl: "/brands/canva.svg",
    },
    {
      ...remote("slack", "Slack", "support", "Canais e mensagens.", "https://mcp.slack.example/mcp", null, false),
      kind: "catalog",
      available: false,
      oauthConfigured: false,
    },
  ],
  builtinScopes: [
    { id: "context:read", label: "Read context", description: "Search messages.", sensitive: false },
    { id: "memory:write", label: "Remember", description: "Save notes.", sensitive: false },
    { id: "drive:write", label: "Write files", description: "Create reports.", sensitive: false },
  ],
};

let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;

/** Served by the in-memory fakes in `test/fakes` (same shapes as the server). */
type FakedParts =
  | "apps"
  | "wiki"
  | "notifications"
  | "sandbox"
  | "machines"
  | "devices"
  | "skills"
  | "access"
  | "invites"
  | "joinRequests"
  | "storage"
  | "artifacts"
  | "issues"
  | "routines"
  | "threads"
  | "missions"
  | "dashboards"
  | "calendar"
  | "customConnectors"
  | "mail"
  | "databases"
  | "browser"
  | "desktop";

/** The core of the fake backend, over `FakeState`. Records every call in `state.calls`. */
/** A member as the signed-in person sees them: hidden reads as offline to everyone else (ADR 0084). */
function presenceOf(state: FakeState, userId: string): Pick<Person, "online" | "presence" | "status"> {
  const chosen = state.statuses?.get(userId) ?? { availability: "auto" as const, status: null };
  const self = userId === state.me?.user.id;
  const presence: MemberPresence =
    chosen.availability === "hidden"
      ? self
        ? "hidden"
        : "offline"
      : chosen.availability === "out"
        ? "out"
        : !state.online.has(userId)
          ? "offline"
          : chosen.availability === "auto"
            ? "online"
            : chosen.availability;
  return {
    online: presence !== "offline" && presence !== "hidden" && presence !== "out",
    presence,
    status: chosen.status,
  };
}

export function createFakeHttpApi(state: FakeState): Omit<HttpApi, FakedParts> {
  const log = (method: string, ...args: unknown[]): void => {
    state.calls.push({ method, args });
  };
  const requireMe = () => {
    if (!state.me) throw new ApiError(401, "unauthorized", "Sign in to continue");
    return state.me;
  };
  const roles = () => {
    state.roles ??= seedRoles();
    return state.roles;
  };
  /**
   * `GET …/roles`: the roles with how many hold each, what each reaches (the channels limited to it, `everyone` the
   * public ones; the agents whose audience lists it, `everyone` those that answer everyone) and the areas.
   */
  const rolesPayload = () => ({
    roles: roles().map((r) => ({
      ...r,
      people:
        r.kind === "everyone" ? state.members.length : state.members.filter((m) => m.roleIds?.includes(r.id)).length,
      channelIds: state.channels
        .filter((c) =>
          r.kind === "everyone"
            ? c.visibility === "public"
            : c.visibility === "private" && (c.audienceRoleIds ?? []).includes(r.id),
        )
        .map((c) => c.id),
      hiddenChannels: 0,
      agentIds: state.agents
        .filter((a) => {
          if (a.builtin === "right_hand" || a.former) return false;
          const mode = a.audience?.mode ?? a.audienceMode ?? "everyone";
          return r.kind === "everyone"
            ? mode === "everyone"
            : mode === "people" && (a.audience?.roleIds ?? []).includes(r.id);
        })
        .map((a) => a.id),
    })),
    areas: structuredClone(PERMISSION_AREAS),
    colors: ["indigo", "violet", "rose", "amber", "green", "teal", "graphite"],
    icons: ["shield", "code", "wallet", "mail", "bolt", "flag", "book", "chart", "bulb", "globe", "person"],
  });
  // What each membership may do, as the server resolves it (ADR 0085): an owner everything, a member what their
  // roles and `everyone` give. A test may set `permissions` itself.
  const withPermissions = (me: Me): Me => ({
    ...me,
    organizations: me.organizations.map((o) => {
      if (o.permissions) return o;
      if (o.role === "owner") return { ...o, permissions: ["read", "manage_owners", ...SUMMARY_ORDER] };
      const mine = state.members.find((m) => m.userId === me.user.id)?.roleIds ?? [];
      const keys = roles()
        .filter((r) => r.kind === "everyone" || mine.includes(r.id))
        .flatMap((r) => r.permissions);
      return { ...o, permissions: ["read", ...grants(keys)] };
    }),
  });
  /** A DM as the list has it: its last message and unread count. */
  const dmRow = (d: FakeState["dms"][number]) => {
    const last = state.messages
      .filter((m) => m.channelId === d.channelId && !m.threadId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      ...d,
      lastMessage: last
        ? { id: last.id, body: last.body, createdAt: last.createdAt, authorType: last.author.type }
        : null,
      unread: d.unread ?? 0,
    };
  };
  // A person who picked Portuguese, as the screens' tests read it (`useServerLocale` keeps the app in it), and who said
  // their own area already (the onboarding asks it once per account): a test of that screen sets `workArea: null`.
  const meNow = () =>
    state.me &&
    withPermissions({ ...state.me, user: { locale: "pt-BR", localeAuto: false, workArea: "dev", ...state.me.user } });
  /** What finishing a workspace's onboarding answers, as the server does: where it opens, and `/me` now. */
  const opened = () => ({
    rightHandId: state.agents.find((a) => a.builtin === "right_hand")?.id ?? null,
    me: meNow() ?? undefined,
  });
  // "Quem pensa": every agent starts on the API, with a MacBook that has Claude Code and Codex.
  const brains = new Map<string, AgentBrain>();
  const brainOf = (agentId: string): AgentBrain => {
    let b = brains.get(agentId);
    if (!b) {
      b = fakeAgentBrain(agentId);
      brains.set(agentId, b);
    }
    return b;
  };
  // Budgets like the backend: every agent has one (its own or the default); members see only percentages.
  const seesCost = () => state.me?.organizations[0]?.role !== "member";
  // A personal workspace (ADR 0159), as `me` says.
  const personalOrg = (orgId: string) => state.me?.organizations.find((o) => o.id === orgId)?.mode === "personal";
  // A new `me` with the org's logo changed, as the server answers: what the app read before stays as it was.
  const setOrgLogo = (orgId: string, logo: string | null) => {
    if (!state.me) return;
    state.me = { ...state.me, organizations: state.me.organizations.map((o) => (o.id === orgId ? { ...o, logo } : o)) };
  };
  const spentOf = (agentId: string) =>
    state.spentUsd?.[agentId] ?? (agentId === ADA_ID ? 12.3 : agentId === ATLAS_ID ? 3.1 : 0);
  const budgetOf = (a: Agent) => a.monthlyBudgetUsd ?? state.defaultAgentBudgetUsd ?? 50;
  const percentOf = (a: Agent) => Math.round((spentOf(a.id) / budgetOf(a)) * 1000) / 10;
  const workspacePercent = () => {
    const spent = state.agents.reduce((n, a) => n + spentOf(a.id), 0);
    const budget = state.agents.reduce((n, a) => n + budgetOf(a), 0);
    return budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0;
  };
  return {
    system: {
      health: async () => ({ status: "ok", version: "test", edition: state.edition ?? "cloud" }),
      instance: async () => ({
        name: "agentes.chat",
        version: "test",
        api: 1,
        minApi: 1,
        url: "https://app.agentes.chat",
        signIn: { email: true, google: false, github: true, apple: false },
        signup: "open",
        cloud: true,
        ...state.instance,
      }),
      telemetry: async () => state.telemetry ?? null,
      setTelemetry: async (enabled) => {
        log("system.setTelemetry", enabled);
        if (!state.telemetry) throw new ApiError(404, "not_found", "Not found");
        state.telemetry = { ...state.telemetry, enabled };
        return state.telemetry;
      },
      sendFeedback: async (input) => {
        log("system.sendFeedback", input);
      },
      uploadFeedbackFile: async (file) => {
        log("system.uploadFeedbackFile", file.name);
        const kind = file.type.startsWith("video/") ? "video" : "image";
        return {
          id: `00000000-0000-4000-8000-0000000f${String(state.calls.length).padStart(4, "0")}`,
          name: file.name,
          size: file.size,
          kind,
          contentType: file.type,
        };
      },
      dropFeedbackFile: async (id) => {
        log("system.dropFeedbackFile", id);
      },
      decideFeedbackOffer: async (orgId, messageId, decision) => {
        log("system.decideFeedbackOffer", orgId, messageId, decision);
        const offer = state.messages.find((m) => m.id === messageId)?.meta?.feedbackOffer as FeedbackOffer;
        return { ...offer, state: decision === "send" ? "sent" : "dismissed", decidedAt: new Date().toISOString() };
      },
      jev: async () => state.jev ?? null,
      saveJev: async (apiKey) => {
        log("system.saveJev", apiKey);
        if (!state.jev) throw new ApiError(404, "not_found", "Not found");
        const verdict = state.jevVerdicts?.[apiKey];
        if (verdict === "invalid") throw new ApiError(422, "jev_key_invalid", "TypeSafe didn't accept this key.");
        if (verdict === "rate_limited") {
          delete state.jevVerdicts?.[apiKey];
          throw new ApiError(429, "rate_limited", "Too many tries. Wait a minute.");
        }
        state.jev = { ...state.jev, source: "settings", hint: apiKey.slice(-4), state: verdict ?? "ok" };
        return state.jev;
      },
      checkJev: async () => {
        log("system.checkJev");
        if (!state.jev) throw new ApiError(404, "not_found", "Not found");
        return state.jev;
      },
      removeJev: async () => {
        log("system.removeJev");
        if (!state.jev) throw new ApiError(404, "not_found", "Not found");
        state.jev = { ...state.jev, source: null, hint: null, state: "off" };
        return state.jev;
      },
      gifKey: async () => state.gifKey ?? null,
      saveGifKey: async (apiKey) => {
        log("system.saveGifKey", apiKey);
        if (!state.gifKey) throw new ApiError(404, "not_found", "Not found");
        if (state.gifKeyRefused?.includes(apiKey)) {
          throw new ApiError(422, "gif_key_invalid", "GIPHY didn't accept this key.");
        }
        state.gifKey = { source: "settings", hint: apiKey.slice(-4), state: "ok" };
        state.media = { ...state.media, gifsAvailable: true };
        return state.gifKey;
      },
      removeGifKey: async () => {
        log("system.removeGifKey");
        if (!state.gifKey) throw new ApiError(404, "not_found", "Not found");
        state.gifKey = { source: null, hint: null, state: "off" };
        state.media = { ...state.media, gifsAvailable: false };
        return state.gifKey;
      },
      speechKey: async () => state.speechKey ?? null,
      saveSpeechKey: async (input) => {
        log("system.saveSpeechKey", input);
        if (!state.speechKey) throw new ApiError(404, "not_found", "Not found");
        if (input.apiKey && state.speechKeyRefused?.includes(input.apiKey)) {
          throw new ApiError(422, "speech_key_invalid", "The provider didn't accept this key.");
        }
        const hint = input.provider === "local" ? (input.baseUrl ?? "") : (input.apiKey ?? "").slice(-4);
        state.speechKey = { provider: input.provider, hint, state: "ok", envProviders: [] };
        state.media = { ...state.media, voiceAvailable: true };
        return state.speechKey;
      },
      removeSpeechKey: async () => {
        log("system.removeSpeechKey");
        if (!state.speechKey) throw new ApiError(404, "not_found", "Not found");
        state.speechKey = { provider: null, hint: null, state: "off", envProviders: [] };
        state.media = { ...state.media, voiceAvailable: false };
        return state.speechKey;
      },
    },
    voice: {
      allowed: async () => ({ allowed: state.voiceAllowed ?? true }),
      send: async (_orgId, channelId, input) => {
        log("voice.send", channelId, input.clientId, input.durationMs);
        return { clipId: `clip-${input.clientId}` };
      },
    },
    account: {
      authConfig: async () => ({
        socialProviders: { google: false, github: true },
        signupOpen: true,
        firstRun: false,
        ...state.authConfig,
      }),
      signInOptions: async (input, humanCheck) => {
        if (humanCheck !== undefined) state.calls.push({ method: "account.signInOptions", args: [input, humanCheck] });
        return state.signInOptions ?? { account: false, password: false, providers: [], canSignUp: true };
      },
      me: async () => meNow(),
      updateMe: async (input) => {
        log("account.updateMe", input);
      },
      setWorkArea: async (area) => {
        log("account.setWorkArea", area);
        if (state.me) state.me.user.workArea = area;
      },
      addPassword: async (password) => {
        log("account.addPassword", { password });
        if (state.me) state.me.user.hasPassword = true;
      },
      deletionCode: async () => {
        log("account.deletionCode");
        if (state.codeError) throw state.codeError;
        return { email: requireMe().user.email, resendIn: 60 };
      },
      deletionPlan: async () =>
        state.deletionPlan ?? {
          closes: [],
          leaves: [],
          soleOwner: [],
          computers: [],
          staysBehind: [],
          serverOwner: false,
        },
      restore: async () => {
        log("account.restore");
        if (state.me) {
          const { deletion: _gone, ...user } = state.me.user;
          state.me = { ...state.me, user };
        }
      },
      delete: async (input) => {
        log("account.delete", input);
        if (state.deletionError) throw state.deletionError;
        state.me = null;
      },
      changeEmail: async (input) => {
        log("account.changeEmail", input);
        if (state.emailChangeError) throw state.emailChangeError;
        if (input.code) return { status: "sent", email: input.newEmail };
        return state.emailChange ?? { status: "code", email: requireMe().user.email, resendIn: 60 };
      },
      undoEmailChange: async (token) => {
        log("account.undoEmailChange", token);
        if (state.undoError) throw state.undoError;
        return { email: state.undoBack ?? "walter@example.com" };
      },
      unread: async () =>
        state.me
          ? { organizations: state.me.organizations.map((o) => ({ orgId: o.id, unread: 0, waiting: 0 })) }
          : null,
      deviceAccounts: async () => state.deviceAccounts ?? [],
      switchDeviceAccount: async (userId) => {
        state.calls.push({ method: "account.switchDeviceAccount", args: [userId] });
      },
      signOutDeviceAccount: async (userId) => {
        state.calls.push({ method: "account.signOutDeviceAccount", args: [userId] });
        return { signedIn: false };
      },
      phoneSignIn: async () => {
        log("account.phoneSignIn");
        return {
          token: `tok-${state.calls.filter((c) => c.method === "account.phoneSignIn").length}`,
          server: state.phoneServer ?? "https://app.agentes.chat",
          expiresIn: 180,
        };
      },
    },
    push: {
      webKey: async () => state.webPushKey ?? null,
      register: async (input) => {
        log("push.register", input);
      },
      unregister: async (token) => {
        log("push.unregister", token);
      },
      stale: async (ids) => {
        log("push.stale", ids);
        return ids.filter((id) => state.stalePushIds?.includes(id));
      },
    },
    roles: {
      list: async (orgId) => {
        log("roles.list", orgId);
        return rolesPayload();
      },
      setRow: async (orgId, row, holders) => {
        log("roles.setRow", orgId, row, holders);
        // The server's `Level`: each level 0 to the row's highest.
        const max = rowMax(row);
        if (
          [holders.everyone, ...holders.roles.map((r) => r.level)].some((l) => !Number.isInteger(l) || l < 0 || l > max)
        )
          throw new ApiError(400, "role.level_invalid", `Each level is 0 to ${max}`);
        state.roles = withRowHolders(roles(), row, holders);
        return rolesPayload();
      },
      mailLoss: async (orgId, roleId, userIds) => {
        log("roles.mailLoss", orgId, roleId, userIds);
        return state.roleMailLoss?.[roleId] ?? [];
      },
      create: async (orgId, input) => {
        log("roles.create", orgId, input);
        const role: OrgRole = {
          id: id("role"),
          kind: "custom",
          name: input.name,
          icon: input.icon ?? "shield",
          color: input.color ?? "indigo",
          position: roles().filter((r) => r.kind !== "everyone").length,
          permissions: input.permissions ?? [],
          mentionable: input.mentionable ?? false,
          hoist: input.hoist ?? false,
          people: 0,
          editable: true,
          givable: true,
        };
        state.roles = [...roles(), role];
        return { id: role.id };
      },
      update: async (orgId, roleId, patch) => {
        log("roles.update", orgId, roleId, patch);
        state.roles = roles().map((r) => (r.id === roleId ? { ...r, ...patch } : r));
      },
      remove: async (orgId, roleId) => {
        log("roles.remove", orgId, roleId);
        state.roles = roles().filter((r) => r.id !== roleId);
        for (const m of state.members) m.roleIds = m.roleIds?.filter((x) => x !== roleId);
      },
      reorder: async (orgId, ids) => {
        log("roles.reorder", orgId, ids);
        state.roles = roles().map((r) => (ids.includes(r.id) ? { ...r, position: ids.indexOf(r.id) } : r));
      },
      setFor: async (orgId, userId, roleIds, via, mailLossSeen) => {
        log("roles.setFor", orgId, userId, roleIds);
        if (via) log("via", via);
        const lost = roleIds.flatMap((id) => state.roleMailLoss?.[id] ?? []);
        if (mailLossSeen && lost.some((m) => !mailLossSeen.includes(m.accountId)))
          throw new ApiError(409, "agent.mail_loss_changed", "An agent holds a mailbox you weren't asked about");
        const m = state.members.find((x) => x.userId === userId);
        if (m) m.roleIds = [...roleIds];
        return { roleIds: [...roleIds] };
      },
    },
    orgs: {
      create: async (input) => {
        log("orgs.create", input);
        const me = requireMe();
        const orgId = id("org");
        const general = id("chan");
        // As the server makes it: its owner sets it up in the onboarding, already past its first step, unless it's
        // finished at once.
        me.organizations.push({
          id: orgId,
          name: input.name,
          role: "owner",
          ...(input.finished ? {} : { onboarding: { step: "context" as const, generalChannelId: general } }),
          ...(state.newWorkspaceStanding ? { standing: state.newWorkspaceStanding } : {}),
          // Who it is for (ADR 0159), as the server keeps it.
          ...(input.mode ? { mode: input.mode } : {}),
        });
        const mine = state.members.find((m) => m.userId === me.user.id);
        if (mine && input.memberTimezone) mine.timezone = input.memberTimezone;
        state.channels.push({
          id: general,
          name: "general",
          topic: "",
          visibility: "public",
          isMember: true,
          createdAt: NOW.toISOString(),
        });
        // Its right hand comes with it (ADR 0137).
        if (!state.agents.some((a) => a.builtin === "right_hand")) withRightHand(state, { ownerUserId: me.user.id });
        return {
          organization: { id: orgId, name: input.name, role: "owner", context: input.context },
          generalChannelId: general,
          ...opened(),
        };
      },
      saveOnboarding: async (orgId, input) => {
        log("orgs.saveOnboarding", orgId, input);
        const me = requireMe();
        const at = me.organizations.find((o) => o.id === orgId)?.onboarding;
        if (!at) return { step: "done", finished: true, ...("finished" in input ? opened() : {}) };
        const onboarding =
          "finished" in input
            ? undefined
            : stepIndex(input.step) > stepIndex(at.step)
              ? { ...at, step: input.step }
              : at;
        state.me = {
          ...me,
          organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, onboarding } : o)),
        };
        return {
          step: onboarding?.step ?? "done",
          finished: onboarding === undefined,
          ...("finished" in input ? opened() : {}),
        };
      },
      get: async (orgId) => ({ id: orgId, name: "Acme", role: "owner", context: "" }),
      deletionCode: async (orgId) => {
        log("orgs.deletionCode", orgId);
        if (state.codeError) throw state.codeError;
        return { email: requireMe().user.email, resendIn: 60 };
      },
      deleteWorkspace: async (orgId, input) => {
        log("orgs.deleteWorkspace", orgId, input);
        const me = requireMe();
        if (state.deletionError) throw state.deletionError;
        // On the real clock: the line on top compares the date with it.
        const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
        const deletion = {
          dueAt,
          requestedAt: new Date().toISOString(),
          requestedBy: { id: me.user.id, name: me.user.name },
        };
        state.me = {
          ...me,
          organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, deletion, onboarding: undefined } : o)),
        };
        return { dueAt };
      },
      restore: async (orgId) => {
        log("orgs.restore", orgId);
        const me = requireMe();
        state.me = {
          ...me,
          organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, deletion: undefined } : o)),
        };
      },
      update: async (orgId, input) => log("orgs.update", orgId, input),
      updateMe: async (orgId, input) => {
        log("orgs.updateMe", orgId, input);
        const m = state.members.find((x) => x.userId === state.me?.user.id);
        if (!m) throw new ApiError(404, "not_found", "Member not found");
        if (input.handle !== undefined) m.handle = input.handle;
        if (input.timezone !== undefined) m.timezone = input.timezone ?? "America/Sao_Paulo";
        return { ...m, ...presenceOf(state, m.userId), lastSeenAt: new Date().toISOString() };
      },
      setStatus: async (orgId, input) => {
        log("orgs.setStatus", orgId, input);
        const m = state.members.find((x) => x.userId === state.me?.user.id);
        if (!m) throw new ApiError(404, "not_found", "Member not found");
        state.statuses ??= new Map();
        const was = state.statuses.get(m.userId) ?? { availability: "auto" as const, status: null };
        state.statuses.set(m.userId, {
          availability: input.availability ?? was.availability,
          status:
            input.status === undefined
              ? was.status
              : input.status?.text.trim()
                ? {
                    text: input.status.text.trim(),
                    emoji: input.status.emoji ?? null,
                    until: input.status.until ?? null,
                  }
                : null,
        });
        return { ...m, ...presenceOf(state, m.userId), lastSeenAt: new Date().toISOString() };
      },
      // What opens when the app starts (ADR 0108): kept on the membership `me` sends.
      setStart: async (orgId, input) => {
        log("orgs.setStart", orgId, input);
        const org = state.me?.organizations.find((o) => o.id === orgId);
        if (!org) throw new ApiError(404, "not_found", "Organization not found");
        org.start = { page: input.page, channelId: input.page === "channel" ? (input.channelId ?? null) : null };
        return org.start;
      },
      setShowActivity: async (orgId, show) => {
        log("orgs.setShowActivity", orgId, show);
        const org = state.me?.organizations.find((o) => o.id === orgId);
        if (!org) throw new ApiError(404, "not_found", "Organization not found");
        org.showActivity = show;
        return show;
      },
      setAgentStyle: async (orgId, style) => {
        log("orgs.setAgentStyle", orgId, style);
        const org = state.me?.organizations.find((o) => o.id === orgId);
        if (!org) throw new ApiError(404, "not_found", "Organization not found");
        org.agentStyle = style;
        return style;
      },
      setChatPrefs: async (orgId, patch) => {
        log("orgs.setChatPrefs", orgId, patch);
        const org = state.me?.organizations.find((o) => o.id === orgId);
        if (!org) throw new ApiError(404, "not_found", "Organization not found");
        org.chatPrefs = { ...org.chatPrefs, ...patch };
        return org.chatPrefs;
      },
      sidebarItems: async () => structuredClone(state.sidebarItems ?? {}),
      setSidebarItem: async (orgId, item, place) => {
        log("orgs.setSidebarItem", orgId, item, place);
        if (state.sidebarItemsError) throw state.sidebarItemsError;
        const items = { ...state.sidebarItems };
        if (place === null) delete items[item];
        else items[item] = place;
        state.sidebarItems = items;
        return structuredClone(items);
      },
      setSidebarItems: async (orgId, items) => {
        log("orgs.setSidebarItems", orgId, items);
        if (state.sidebarItemsError) throw state.sidebarItemsError;
        state.sidebarItems = structuredClone(items);
        return structuredClone(items);
      },
      // As the server: an order never saved is the default of the workspace's mode (ADR 0159).
      sidebarOrder: async (orgId) => [...(state.sidebarOrder ?? sidebarSections(personalOrg(orgId)))],
      setSidebarOrder: async (orgId, order) => {
        log("orgs.setSidebarOrder", orgId, order);
        state.sidebarOrder = order ? [...order] : undefined;
        return [...(order ?? sidebarSections(personalOrg(orgId)))];
      },
      issuesView: async () => structuredClone(state.issuesView ?? ISSUES_VIEW_DEFAULT),
      setIssuesView: async (orgId, view) => {
        log("orgs.setIssuesView", orgId, view);
        state.issuesView = structuredClone(view);
        return structuredClone(view);
      },
      sidebarToolOrder: async (orgId) => [...(state.sidebarToolOrder ?? sidebarItemOrder(personalOrg(orgId)))],
      setSidebarToolOrder: async (orgId, order) => {
        log("orgs.setSidebarToolOrder", orgId, order);
        state.sidebarToolOrder = order ? [...order] : undefined;
        return [...(order ?? sidebarItemOrder(personalOrg(orgId)))];
      },
      sidebarView: async () =>
        structuredClone(state.sidebarView ?? { agentSort: "workspace", showAllAgents: false, pins: null }),
      setSidebarView: async (orgId, view) => {
        log("orgs.setSidebarView", orgId, view);
        state.sidebarView = structuredClone(view);
        return structuredClone(view);
      },
      setAvatar: async (orgId, input) => {
        log("orgs.setAvatar", orgId, { contentType: input.contentType, bytes: input.imageBase64.length });
        const m = state.members.find((x) => x.userId === state.me?.user.id);
        if (!m) throw new ApiError(404, "not_found", "Member not found");
        m.avatarUrl = `data:${input.contentType};base64,${input.imageBase64}`;
        return { avatarUrl: m.avatarUrl };
      },
      removeAvatar: async (orgId) => {
        log("orgs.removeAvatar", orgId);
        const m = state.members.find((x) => x.userId === state.me?.user.id);
        if (m) m.avatarUrl = null;
      },
      setLogo: async (orgId, input) => {
        log("orgs.setLogo", orgId, { contentType: input.contentType });
        if (!state.me?.organizations.some((x) => x.id === orgId)) {
          throw new ApiError(404, "not_found", "Organization not found");
        }
        const logo = `data:${input.contentType};base64,${input.imageBase64}`;
        setOrgLogo(orgId, logo);
        return { logo };
      },
      removeLogo: async (orgId) => {
        log("orgs.removeLogo", orgId);
        setOrgLogo(orgId, null);
      },
      billingLink: async (orgId, from, _returnTo, plan) => {
        log("orgs.billingLink", orgId, from, ...(plan ? [plan] : []));
        if (state.billingLinkError) throw state.billingLinkError;
        return { url: `https://billing.example.com/link?t=${from}`, expiresAt: NOW.toISOString() };
      },
      limits: async () =>
        state.limits ?? {
          members: { used: state.members.length, limit: null },
          storage: { usedBytes: 0, limitBytes: null, ownStorage: false },
          uploads: { usedBytes24h: 0, limitBytesPerDay: null },
        },
      members: async () => state.members,
      changeRole: async (orgId, userId, role: Role, via) => {
        log("orgs.changeRole", orgId, userId, role);
        if (via) log("via", via);
        const m = state.members.find((x) => x.userId === userId);
        if (m) m.role = role;
      },
      removal: async (_orgId, userId) => {
        const heir = state.members.find((m) => m.userId === state.me?.user.id);
        return {
          heir: heir ? { userId: heir.userId, name: heir.name } : null,
          agents: state.agents.filter((a) => a.ownerUserId === userId).map((a) => ({ id: a.id, name: a.name })),
          losePlan: state.removalLosesPlan?.[userId] ?? [],
          computers: [],
          routines: 0,
        };
      },
      removeMember: async (orgId, userId, via) => {
        log("orgs.removeMember", orgId, userId);
        if (via) log("via", via);
        state.members = state.members.filter((m) => m.userId !== userId);
        for (const a of state.agents) if (a.ownerUserId === userId) a.ownerUserId = state.me?.user.id ?? null;
      },
      passwordLink: async (orgId, userId) => {
        log("orgs.passwordLink", orgId, userId);
        return {
          url: `https://agentes.example.com/reset-password?token=link-for-${userId}`,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        };
      },
      invitations: async () => structuredClone(state.invitations),
      invite: async (orgId, input) => {
        log("orgs.invite", orgId, input);
        if (state.members.some((m) => m.email === input.email))
          throw new ApiError(409, "conflict", `${input.email} is already a member`);
        const invitation = newInvitation(input.email, input.role ?? "member", input.roleIds);
        state.invitations.push(invitation);
        return { invitation, url: `http://localhost:3000/invite/tok-${invitation.id}` };
      },
      revokeInvitation: async (orgId, invitationId) => {
        log("orgs.revokeInvitation", orgId, invitationId);
        state.invitations = state.invitations.filter((i) => i.id !== invitationId);
      },
      previewInvitation: async (token) => {
        if (state.previewFails?.length) throw state.previewFails.shift();
        return (
          state.previews?.[token] ??
          (token === "valid" ? { orgName: "Acme", email: "marina@acme.com.br", role: "member" } : null)
        );
      },
      invitationState: async (token) => state.invitationStates?.[token] ?? null,
      acceptInvitation: async (token, mail) => {
        // With its email's proof only when the page had one (ADR 0090).
        if (mail) log("orgs.acceptInvitation", token, mail);
        else log("orgs.acceptInvitation", token);
        return { orgId: ORG_ID };
      },
      settings: async (orgId) => ({
        name: state.me?.organizations.find((o) => o.id === orgId)?.name ?? "Acme",
        context: state.context ?? "",
        defaultCredentialId: state.defaultCredentialId ?? null,
        routerModel: null,
        summaryModel: null,
        timezone: "America/Sao_Paulo",
        actionCheck: state.actionCheck ?? true,
        autoModels: state.autoModels ?? {},
        teamWatch: state.lodiSwitches?.teamWatch ?? true,
        welcomePeople: state.lodiSwitches?.welcomePeople ?? true,
        ...mediaSettings(state),
        mode: personalOrg(orgId) ? "personal" : "team",
        // Money: admins only, like the backend.
        ...(seesCost() ? { defaultAgentBudgetUsd: state.defaultAgentBudgetUsd ?? 50 } : {}),
      }),
      updateSettings: async (orgId, input) => {
        log("orgs.updateSettings", orgId, input);
        // A switch of mode (ADR 0159), with the name it may bring: `me` says them at once, as the server's.
        const { mode, name } = input;
        if (mode !== undefined && state.me) {
          const named = name ? { name } : {};
          state.me = {
            ...state.me,
            organizations: state.me.organizations.map((o) => (o.id === orgId ? { ...o, mode, ...named } : o)),
          };
        }
        if (input.context !== undefined) state.context = input.context;
        if (input.defaultCredentialId !== undefined) state.defaultCredentialId = input.defaultCredentialId;
        if (input.defaultAgentBudgetUsd !== undefined) state.defaultAgentBudgetUsd = input.defaultAgentBudgetUsd;
        if (input.actionCheck !== undefined) state.actionCheck = input.actionCheck;
        if (input.teamWatch !== undefined || input.welcomePeople !== undefined)
          state.lodiSwitches = {
            ...state.lodiSwitches,
            ...(input.teamWatch !== undefined ? { teamWatch: input.teamWatch } : {}),
            ...(input.welcomePeople !== undefined ? { welcomePeople: input.welcomePeople } : {}),
          };
        const { gifs, gifRating, agentStickers, agentMedia } = input;
        state.media = {
          ...state.media,
          ...(gifs !== undefined ? { gifs } : {}),
          ...(gifRating !== undefined ? { gifRating } : {}),
          ...(agentStickers !== undefined ? { agentStickers } : {}),
          ...(agentMedia !== undefined ? { agentMedia } : {}),
        };
        for (const [provider, tiers] of Object.entries(input.autoModels ?? {})) {
          const next = { ...state.autoModels?.[provider] };
          for (const [tier, model] of Object.entries(tiers ?? {}) as [ModelTier, string | null][]) {
            if (model === null) delete next[tier];
            else next[tier] = model;
          }
          state.autoModels = { ...state.autoModels, [provider]: next };
        }
        return {
          name: input.name ?? "Acme",
          context: state.context ?? "",
          defaultCredentialId: state.defaultCredentialId ?? null,
          routerModel: null,
          summaryModel: null,
          timezone: input.timezone ?? "America/Sao_Paulo",
          actionCheck: state.actionCheck ?? true,
          autoModels: state.autoModels ?? {},
          teamWatch: state.lodiSwitches?.teamWatch ?? true,
          welcomePeople: state.lodiSwitches?.welcomePeople ?? true,
          ...mediaSettings(state),
          mode: personalOrg(orgId) ? "personal" : "team",
          // As the server's answer: the same settings a read gives, money included for who sees it.
          ...(seesCost() ? { defaultAgentBudgetUsd: state.defaultAgentBudgetUsd ?? 50 } : {}),
        };
      },
      overview: async () => ({
        name: "Acme",
        role: state.me?.organizations[0]?.role ?? "member",
        people: state.members.length,
        agents: state.agents.length,
        budgetUsedPercent: workspacePercent(),
        approvalsWaitingForMe: state.approvals.filter((a) => a.status === "pending" && a.canDecide).length,
        proposalsWaitingForMe: state.proposals.filter((p) => p.status === "pending" && !p.stale && p.canDecide).length,
      }),
      people: async () =>
        state.members.map((m) => ({
          ...m,
          ...presenceOf(state, m.userId),
          lastSeenAt: state.online.has(m.userId) ? new Date().toISOString() : minutesAgo(60),
        })),
      allInvitations: async () => structuredClone(state.invitations),
      inviteMany: async (orgId, input) => {
        log("orgs.inviteMany", orgId, input);
        if (state.inviteManyError) throw state.inviteManyError;
        const asked = input.invites ?? (input.emails ?? []).map((email) => ({ email, roleIds: input.roleIds }));
        return asked.map(({ email, roleIds }) => {
          if (state.members.some((m) => m.email === email)) return { email, status: "already_member" as const };
          if (state.invitations.some((i) => i.email === email)) return { email, status: "already_invited" as const };
          const inv = newInvitation(email, "member", roleIds);
          inv.channelIds = input.channelIds ?? [];
          inv.agentIds = input.agentIds ?? [];
          inv.url = `http://localhost:3000/invite/tok-${inv.id}`;
          state.invitations.push(inv);
          return {
            email,
            status: "invited" as const,
            invitationId: inv.id,
            url: `http://localhost:3000/invite/tok-${inv.id}`,
          };
        });
      },
      resendInvitation: async (orgId, invitationId) => {
        log("orgs.resendInvitation", orgId, invitationId);
        const inv = state.invitations.find((i) => i.id === invitationId);
        if (inv) {
          inv.status = "pending";
          inv.expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
          // The same link, as the server keeps it (ADR 0090).
          inv.url ??= `http://localhost:3000/invite/tok-${invitationId}`;
        }
        return { url: inv?.url ?? `http://localhost:3000/invite/tok-${invitationId}`, expiresAt: inv?.expiresAt ?? "" };
      },
      updateInvitation: async (orgId, invitationId, change) => {
        log("orgs.updateInvitation", orgId, invitationId, change);
        const inv = state.invitations.find((i) => i.id === invitationId);
        if (inv) Object.assign(inv, change);
        return { roleIds: inv?.roleIds ?? [], channelIds: inv?.channelIds ?? [], agentIds: inv?.agentIds ?? [] };
      },
      peopleUsage: async () =>
        state.peopleUsage ?? {
          month: new Date().toISOString().slice(0, 7),
          since: new Date().toISOString(),
          until: new Date().toISOString(),
          totalUsd: 0,
          plansOnly: false,
          limitsOn: false,
          people: [],
          live: [],
        },
      peopleUsageCsvUrl: (orgId) => `/api/app/organizations/${orgId}/usage/people.csv`,
      personUsage: async (_orgId, userId) =>
        state.personUsage?.[userId] ?? {
          userId,
          name: state.members.find((m) => m.userId === userId)?.name ?? "",
          image: null,
          roleIds: [],
          owner: false,
          money: seesCost(),
          estimated: false,
          renewsAt: new Date().toISOString(),
          since: new Date().toISOString(),
          until: new Date().toISOString(),
          limit: { percent: null, state: "none", requested: false, reachedAt: null },
          total: 0,
          days: [],
          agents: [],
          recent: [],
          created: [],
        },
      personLimits: async () =>
        state.personLimits ?? { defaultUsd: null, roles: {}, people: {}, onLimit: "block", warn: true },
      setPersonLimits: async (orgId, limits) => {
        log("orgs.setPersonLimits", orgId, limits);
        state.personLimits = limits;
        return limits;
      },
      requestMoreUsage: async (orgId) => {
        log("orgs.requestMoreUsage", orgId);
        return { requestedAt: new Date().toISOString() };
      },
      raisePersonLimit: async (orgId, userId, limitUsd) => {
        log("orgs.raisePersonLimit", orgId, userId, limitUsd);
      },
      refuseMoreUsage: async (orgId, userId) => {
        log("orgs.refuseMoreUsage", orgId, userId);
      },
      teamWeek: async () => lodiPrefs(state),
      setTeamWeek: async (orgId, patch) => {
        log("orgs.setTeamWeek", orgId, patch);
        state.teamWeek = { ...state.teamWeek, ...patch };
        return lodiPrefs(state);
      },
      actOnTeamWeek: async (orgId, messageId, act) => {
        log("orgs.actOnTeamWeek", orgId, messageId, act);
      },
      planUsage: async () => ({
        month: new Date().toISOString().slice(0, 7),
        money: seesCost(),
        accounts: [fakePlanAccount(seesCost())],
        api: [
          {
            agentId: ATLAS_ID,
            name: "Atlas",
            tokens: 1_100_000,
            budgetPercent: 23,
            ...(seesCost() ? { costUsd: 11.5, budgetUsd: 50, budgetIsDefault: true } : {}),
          },
        ],
      }),
      audit: async (_orgId, query = {}) => {
        const rows = (state.audit ?? []).filter(
          (r) =>
            (!query.actorType || r.actor.type === query.actorType) &&
            (!query.actorId || r.actor.id === query.actorId) &&
            (!query.via || (r.actor.type === "agent" && r.actor.id === query.via) || r.details.via === query.via) &&
            (!query.outcome?.length || (r.outcome !== null && query.outcome.includes(r.outcome))) &&
            (!query.waiting ||
              (r.outcome === "pending" && (r.approval?.status === "pending" || r.secret?.status === "pending"))) &&
            (!query.kind || (query.kind === "tool") === (r.action === "tool.call")),
        );
        const from = query.before ? rows.findIndex((r) => r.id === query.before) + 1 : 0;
        const limit = query.limit ?? 50;
        const page = rows.slice(from, from + limit);
        return { rows: page, next: from + limit < rows.length ? (page.at(-1)?.id ?? null) : null };
      },
      usageReport: async () => ({
        since: minutesAgo(60 * 24 * 14),
        defaultAgentBudgetUsd: state.defaultAgentBudgetUsd ?? 50,
        totalUsd: 15.9,
        byKind: [
          { kind: "agent", calls: 154, partialCalls: 0, inputTokens: 3_200_000, outputTokens: 110_000, costUsd: 15.4 },
          { kind: "router", calls: 80, partialCalls: 0, inputTokens: 90_000, outputTokens: 4_000, costUsd: 0.5 },
        ],
        agents: state.agents.map((a) => ({
          agentId: a.id,
          handle: a.handle,
          name: a.name,
          calls: a.id === ADA_ID ? 142 : 12,
          inputTokens: a.id === ADA_ID ? 3_000_000 : 200_000,
          outputTokens: a.id === ADA_ID ? 100_000 : 10_000,
          costUsd: spentOf(a.id),
          monthlyBudgetUsd: budgetOf(a),
          budgetIsDefault: a.monthlyBudgetUsd == null,
          budgetUsedPercent: percentOf(a),
        })),
      }),
    },
    // Groups of agents (ADR 0083), with the server's order rules; every change answers with all of them.
    agentGroups: {
      list: async () => structuredClone(state.agentGroups ?? []),
      create: async (orgId, input) => {
        state.calls.push({ method: "agentGroups.create", args: [orgId, input] });
        const ids = input.agentIds ?? [];
        state.agentGroups = [
          ...(state.agentGroups ?? []).map((g) => ({ ...g, agentIds: g.agentIds.filter((id) => !ids.includes(id)) })),
          { id: crypto.randomUUID(), name: input.name, agentIds: ids },
        ];
        return structuredClone(state.agentGroups);
      },
      update: async (orgId, groupId, patch) => {
        state.calls.push({ method: "agentGroups.update", args: [orgId, groupId, patch] });
        const { index: _, ...look } = patch;
        const groups = (state.agentGroups ?? []).map((g) =>
          g.id === groupId ? { ...g, ...look, name: patch.name || g.name } : g,
        );
        const group = groups.find((g) => g.id === groupId);
        const others = groups.filter((g) => g.id !== groupId);
        state.agentGroups =
          group && patch.index !== undefined
            ? [...others.slice(0, patch.index), group, ...others.slice(patch.index)]
            : groups;
        return structuredClone(state.agentGroups);
      },
      remove: async (orgId, groupId) => {
        state.calls.push({ method: "agentGroups.remove", args: [orgId, groupId] });
        state.agentGroups = (state.agentGroups ?? []).filter((g) => g.id !== groupId);
        return structuredClone(state.agentGroups);
      },
      move: async (orgId, agentId, input) => {
        state.calls.push({ method: "agentGroups.move", args: [orgId, agentId, input] });
        state.agentGroups = moveInGroups(state.agentGroups ?? [], agentId, input.groupId, input.index);
        return structuredClone(state.agentGroups);
      },
    },
    agents: {
      planUsage: async (_orgId, agentId) => {
        const money = seesCost();
        const account = fakePlanAccount(money);
        const { usage: _u, agents: _a, monthTokens: _m, equivalentUsd: _e, ...info } = account;
        const today = new Date().toISOString().slice(0, 10);
        const day = Number(today.slice(8, 10));
        return {
          month: today.slice(0, 7),
          money,
          tokens: 3_900_000,
          ...(money ? { equivalentUsd: 77 } : {}),
          sources: [
            {
              key: account.key,
              type: "plan" as const,
              kind: "claude_code" as const,
              account: info,
              removed: false,
              tokens: 3_800_000,
              share: 97.4,
              lastDay: today,
              now: true,
              ...(money ? { equivalentUsd: 76 } : {}),
            },
            {
              key: "api",
              type: "api" as const,
              kind: null,
              account: null,
              removed: false,
              tokens: 100_000,
              share: 2.6,
              lastDay: today,
              now: false,
              budgetPercent: 2,
              ...(money ? { costUsd: 0.8 } : {}),
            },
          ],
          days: Array.from({ length: day }, (_, i) => ({
            date: `${today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`,
            tokens: (i + 1 === day ? { [account.key]: 250_000, api: 10_000 } : {}) as Record<string, number>,
          })),
          current: agentId === ADA_ID ? account : null,
        };
      },
      proposeChannelMove: async (orgId, input) => {
        state.calls.push({ method: "agents.proposeChannelMove", args: [orgId, input] });
        return { channelId: crypto.randomUUID(), messageId: crypto.randomUUID(), rightHandId: crypto.randomUUID() };
      },
      // Same as the server's `setReportsTo`: in order, answering what each was (the same call is Desfazer).
      setLines: async (orgId, changes) => {
        state.calls.push({ method: "agents.setLines", args: [orgId, changes] });
        const previous = changes.flatMap((c) => {
          const agent = state.agents.find((a) => a.id === c.agentId);
          if (!agent || (agent.reportsToAgentId ?? null) === c.reportsToAgentId) return [];
          const was = { agentId: c.agentId, reportsToAgentId: agent.reportsToAgentId ?? null };
          agent.reportsToAgentId = c.reportsToAgentId;
          return [was];
        });
        return { previous };
      },
      team: async () => ({
        agents: state.agents.map((a) => ({
          id: a.id,
          name: a.name,
          handle: a.handle,
          role: a.role,
          appearance: a.appearance ?? null,
          ownerUserId: a.ownerUserId,
          reportsToAgentId: a.reportsToAgentId ?? null,
          capabilities: ["drive", "issues"],
          busy: false,
          channelIds: state.channels
            .filter((c) => (state.channelMembers[c.id] ?? []).some((m) => m.type === "agent" && m.id === a.id))
            .map((c) => c.id),
          canTalk: true,
          ...(a.seesDetails === false ? { capabilities: [], canTalk: false, seesDetails: false } : {}),
        })),
        people: state.members
          .filter((m) => state.agents.some((a) => a.ownerUserId === m.userId))
          .map((m) => ({ id: m.userId, name: m.name, image: m.image ?? null })),
        consultations: [],
      }),
      // Same rule as the backend: everyone, the listed people, or only the owner (who can always talk to it).
      list: async () =>
        state.agents.map((a) => {
          const mode = a.audience?.mode ?? "everyone";
          const me = state.me?.user.id ?? "";
          const canTalk =
            mode === "everyone" ||
            a.ownerUserId === me ||
            (mode === "people" && (a.audience?.userIds ?? []).includes(me));
          const { monthlyBudgetUsd, ...rest } = a;
          // Same rule as the backend: how it works only for who it answers, its owner and admins.
          const seesDetails = canTalk || seesCost();
          return {
            ...rest,
            ...(seesCost() ? { monthlyBudgetUsd } : {}),
            ...(seesDetails ? {} : { instructions: "" }),
            budgetUsedPercent: percentOf(a),
            audienceMode: mode,
            canTalk,
            seesDetails,
          };
        }),
      create: async (orgId, input) => {
        log("agents.create", orgId, input);
        if (input.proposal) {
          const found = proposalCard(input.proposal);
          if (found.card.state !== "pending") throw new ApiError(409, "agent_proposal.decided", "Already decided");
        }
        const agent: Agent = {
          id: id("agent"),
          name: input.name,
          handle: input.handle,
          role: input.role ?? "",
          instructions: input.instructions ?? "",
          model: input.model ?? "claude-sonnet-5-5",
          ownerUserId: input.ownerUserId ?? null,
          hasCredential: Boolean(input.credentialId),
          monthlyBudgetUsd: input.monthlyBudgetUsd ?? null,
          createdAt: NOW.toISOString(),
          audience: input.audience ?? { mode: "everyone", userIds: [] },
          ...(input.appearance ? { appearance: input.appearance } : {}),
          // As the backend: every new agent starts with its setup checklist (ADR 0155 §2), who and how done.
          setup: { role: input.setup?.role ?? null, done: ["who", "how"] },
        };
        state.agents.push(agent);
        if (input.proposal) Object.assign(proposalCard(input.proposal).card, { state: "created", agentId: agent.id });
        return agent;
      },
      proposal: async (_orgId, messageId) => proposalView(messageId),
      // The right hand's team card (ADR 0137 §10): the card in its message changes as the server's does.
      createTeam: async (orgId, messageId) => {
        log("agents.createTeam", orgId, messageId);
        const m = state.messages.find((x) => x.id === messageId);
        const card = m?.meta?.actionCard as TeamProposalCard | undefined;
        if (!m || !card) throw new ApiError(404, "team_proposal.not_found", "Not found");
        if (card.state !== "pending") throw new ApiError(409, "team_proposal.decided", "Already decided");
        const me = state.me?.user.id ?? null;
        const made = card.params.agents.map((d) => {
          const agent: Agent = {
            id: id("agent"),
            name: d.name,
            handle: d.handle,
            role: d.role,
            instructions: d.instructions,
            model: "auto",
            ownerUserId: me,
            hasCredential: false,
            monthlyBudgetUsd: null,
            createdAt: NOW.toISOString(),
            audience: { mode: "everyone", userIds: [] },
            ...(d.appearance ? { appearance: d.appearance } : {}),
          };
          state.agents.push(agent);
          return agent.id;
        });
        const next: TeamProposalCard = {
          ...card,
          state: "created",
          decidedByUserId: me,
          decidedAt: new Date().toISOString(),
          error: null,
          created: { agentIds: made, channelIds: [], routineIds: [], skillIds: [], skipped: [], noAi: [] },
        };
        m.meta = { ...m.meta, actionCard: next };
        return { card: next, noAi: [] };
      },
      denyTeam: async (orgId, messageId) => {
        log("agents.denyTeam", orgId, messageId);
        const m = state.messages.find((x) => x.id === messageId);
        const next = { ...(m?.meta?.actionCard as TeamProposalCard), state: "denied" as const };
        if (m) m.meta = { ...m.meta, actionCard: next };
        return { card: next };
      },
      undoTeam: async (orgId, messageId) => {
        log("agents.undoTeam", orgId, messageId);
        const m = state.messages.find((x) => x.id === messageId);
        const next = { ...(m?.meta?.actionCard as TeamProposalCard), state: "undone" as const };
        if (m) m.meta = { ...m.meta, actionCard: next };
        return { card: next };
      },
      adjustTeamAgent: async (orgId, messageId, handle, patch) => {
        log("agents.adjustTeamAgent", orgId, messageId, handle, patch);
        const m = state.messages.find((x) => x.id === messageId);
        const card = m?.meta?.actionCard as TeamProposalCard;
        const next: TeamProposalCard = {
          ...card,
          params: {
            ...card.params,
            agents: card.params.agents.map((a) =>
              a.handle === handle ? { ...a, ...patch, firstTask: patch.firstTask ?? a.firstTask } : a,
            ),
          },
        };
        if (m) m.meta = { ...m.meta, actionCard: next };
        return { card: next };
      },
      teamTemplates: async (orgId, locale) => {
        log("agents.teamTemplates", orgId, locale);
        return state.teamTemplates ?? [];
      },
      // As the server: the template's team is made at once (ADR 0155 §6).
      applyTeamTemplate: async (orgId, templateId, locale) => {
        log("agents.applyTeamTemplate", orgId, templateId, locale);
        const template = state.teamTemplates?.find((x) => x.id === templateId);
        const team = template?.team.agents ?? [];
        const agentIds: string[] = [];
        for (const a of team) {
          agentIds.push(id("agent"));
          state.agents.push({
            id: agentIds.at(-1) ?? "",
            name: a.name,
            handle: a.handle,
            role: a.role,
            instructions: a.instructions,
            model: "auto",
            ownerUserId: state.me?.user.id ?? null,
            hasCredential: false,
            monthlyBudgetUsd: null,
            createdAt: NOW.toISOString(),
            audience: { mode: "everyone", userIds: [] },
            setup: { role: null, done: ["who", "how"] },
          });
        }
        // The card in the person's DM with the right hand, already created.
        const channelId = state.dms.find((d) => d.with.id === LODI_ID)?.channelId ?? `dm-${LODI_ID}`;
        const messageId = id("message");
        const me = state.me?.user.id ?? "";
        state.messages.push({
          id: messageId,
          channelId,
          threadId: null,
          author: { type: "agent", id: LODI_ID },
          body: "",
          mentionedAgentIds: [],
          agentRunId: null,
          meta: {
            actionCard: {
              kind: "team_proposal",
              forUserId: me,
              params: template?.team,
              state: "created",
              decidedByUserId: me,
              decidedAt: NOW.toISOString(),
              expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
              created: { agentIds, channelIds: [], routineIds: [], skillIds: [], skipped: [], noAi: [] },
            },
          },
          createdAt: new Date().toISOString(),
        });
        return { channelId, messageId, state: "created", error: null };
      },
      decideCostly: async (orgId, signalId, decision) => {
        log("agents.decideCostly", orgId, signalId, decision);
        return { state: decision };
      },
      denyProposal: async (orgId, messageId) => {
        log("agents.denyProposal", orgId, messageId);
        Object.assign(proposalCard(messageId).card, { state: "denied", decidedByUserId: state.me?.user.id ?? null });
        return proposalView(messageId);
      },
      // As the server: the draft as it is, owned by me, with the lines I may give (my own mailboxes).
      createProposed: async (orgId, messageId, options) => {
        log("agents.createProposed", orgId, messageId, ...(options ? [options] : []));
        const { card } = proposalCard(messageId);
        if (card.state !== "pending") throw new ApiError(409, "agent_proposal.decided", "Already decided");
        const me = state.me?.user.id ?? null;
        const { draft } = card.params;
        const agent: Agent = {
          id: id("agent"),
          name: draft.name,
          handle: draft.handle,
          role: draft.role,
          instructions: draft.instructions,
          model: "auto",
          ownerUserId: me,
          hasCredential: false,
          monthlyBudgetUsd: null,
          createdAt: NOW.toISOString(),
          audience: { mode: "everyone", userIds: [] },
          ...(draft.appearance ? { appearance: draft.appearance } : {}),
        };
        state.agents.push(agent);
        Object.assign(card, {
          state: "created",
          agentId: agent.id,
          decidedByUserId: me,
          applied: {
            channelIds: draft.channelIds,
            connectionIds: draft.access.map((a) => a.connectionId),
            mailAccountIds: (draft.mail ?? []).filter((m) => m.ownerUserId === me).map((m) => m.accountId),
          },
          routineId: draft.routine ? id("routine") : null,
        });
        const testChannelId = options?.test && card.params.firstTask ? `dm-${agent.id}` : null;
        return {
          agent: { ...agent },
          proposal: proposalView(messageId),
          ai: state.proposalAi ?? draft.ai.kind,
          testChannelId,
        };
      },
      askProposal: async (orgId, messageId) => {
        log("agents.askProposal", orgId, messageId);
        Object.assign(proposalCard(messageId).card, { askedAt: new Date().toISOString() });
        return proposalView(messageId);
      },
      proposalRoutine: async (orgId, messageId) => {
        log("agents.proposalRoutine", orgId, messageId);
        Object.assign(proposalCard(messageId).card, { routineId: id("routine") });
        return proposalView(messageId);
      },
      update: async (orgId, agentId, input) => {
        log("agents.update", orgId, agentId, input);
        const agent = state.agents.find((a) => a.id === agentId);
        if (!agent) throw new ApiError(404, "not_found", "Agent not found");
        // As the backend: a taken handle is refused with a free one; the one it leaves keeps naming it.
        if (input.handle !== undefined && input.handle !== agent.handle) {
          const taken = takenHandles(state.agents, state.members, agentId);
          if (taken.has(input.handle)) {
            throw new ApiError(409, "agent.handle_taken", `@${input.handle} is already taken`, {
              handle: input.handle,
              suggestion: freeHandle(input.handle, taken),
            });
          }
          agent.previousHandles = [...(agent.previousHandles ?? []).filter((h) => h !== input.handle), agent.handle];
        }
        // As the backend: a mailbox given since the person was asked refuses the save.
        const { mailLossSeen, ...fields } = input;
        if (mailLossSeen && (state.mailLoss?.[agentId] ?? []).some((m) => !mailLossSeen.includes(m.accountId))) {
          throw new ApiError(409, "agent.mail_loss_changed", "It holds a mailbox you weren't asked about");
        }
        Object.assign(agent, fields);
        return { ...agent };
      },
      confirmSetup: async (orgId, agentId, step) => {
        log("agents.confirmSetup", orgId, agentId, step);
        const agent = state.agents.find((a) => a.id === agentId);
        if (!agent) throw new ApiError(404, "not_found", "Agent not found");
        if (agent.setup && !agent.setup.done.includes(step)) {
          agent.setup = { ...agent.setup, done: [...agent.setup.done, step] };
        }
        return { ...agent };
      },
      mailLoss: async (orgId, agentId, audience) => {
        log("agents.mailLoss", orgId, agentId, audience);
        return state.mailLoss?.[agentId] ?? [];
      },
      archive: async (orgId, agentId) => log("agents.archive", orgId, agentId),
      unarchive: async (orgId, agentId) => {
        log("agents.unarchive", orgId, agentId);
        state.former = (state.former ?? []).filter((a) => a.id !== agentId || a.deleted);
      },
      purge: async (orgId, agentId) => {
        log("agents.purge", orgId, agentId);
        const was =
          state.agents.find((a) => a.id === agentId) ?? state.former?.find((a) => a.id === agentId && !a.deleted);
        if (!was) throw new ApiError(404, "not_found", "Agent not found");
        state.agents = state.agents.filter((a) => a.id !== agentId);
        state.former = [
          ...(state.former ?? []).filter((a) => a.id !== agentId),
          { id: was.id, name: was.name, role: was.role, appearance: was.appearance ?? null, deleted: true },
        ];
      },
      former: async () => state.former ?? [],
      models: async () => ({
        ...(state.planModels ? { planModels: state.planModels } : {}),
        defaultModel: "claude-sonnet-5-5",
        models: [
          {
            id: "claude-sonnet-5-5",
            label: "Claude Sonnet 5.5",
            provider: "anthropic",
            inputUsdPerMTok: 2,
            outputUsdPerMTok: 10,
          },
          {
            id: "claude-opus-5-5",
            label: "Claude Opus 5.5",
            provider: "anthropic",
            inputUsdPerMTok: 4,
            outputUsdPerMTok: 20,
          },
          {
            id: "claude-haiku-5-5",
            label: "Claude Haiku 5.5",
            provider: "anthropic",
            inputUsdPerMTok: 0.1,
            outputUsdPerMTok: 0.5,
          },
          { id: "gpt-5", label: "GPT-5", provider: "openai", inputUsdPerMTok: 1.25, outputUsdPerMTok: 10 },
          ...(state.extraModels ?? []),
        ],
      }),
      credentials: async () => [...state.credentials],
      addCredential: async (orgId, input) => {
        log("agents.addCredential", orgId, { ...input, apiKey: "[redacted]" });
        if (state.keyRefusal)
          throw new ApiError(400, state.keyRefusal, "The provider didn't accept this key.", state.keyRefusalParams);
        // The counter starts again with each fake: never the id of a key the seed already has.
        let credId = id("cred");
        while (state.credentials.some((c) => c.id === credId)) credId = id("cred");
        const cred: Credential = {
          id: credId,
          provider: input.provider,
          label: input.label,
          keyHint: input.apiKey.slice(-4),
          ...(input.endpoint ? { endpoint: input.endpoint } : {}),
          createdAt: NOW.toISOString(),
          revokedAt: null,
        };
        state.credentials.push(cred);
        const checks = input.endpoint?.models.map(
          (m) => state.endpointChecks?.[m.id] ?? { model: m.id, check: "ok" as const },
        );
        return { ...cred, ...(checks ? { checks } : {}) };
      },
      endpointModels: async (orgId, input) => {
        log("agents.endpointModels", orgId, { ...input, apiKey: "[redacted]" });
        return state.endpointList ?? { baseURL: input.baseURL, models: [] };
      },
      setEndpointModels: async (orgId, credentialId, models) => {
        log("agents.setEndpointModels", orgId, credentialId, models);
        return { models, checks: models.map((m) => ({ model: m.id, check: "ok" as const })) };
      },
      rotateCredential: async (orgId, credentialId, input) => {
        log("agents.rotateCredential", orgId, credentialId, { apiKey: "[redacted]" });
        const cred = state.credentials.find((c) => c.id === credentialId);
        if (!cred) throw new ApiError(404, "not_found", "Credential not found");
        cred.keyHint = input.apiKey.slice(-4);
        return { ...cred };
      },
      removeCredential: async (orgId, credentialId, purge, release) => {
        log("agents.removeCredential", orgId, credentialId, purge, release);
        state.credentials = state.credentials.filter((c) => c.id !== credentialId);
      },
      makeDefaultCredential: async (orgId, credentialId) => {
        log("agents.makeDefaultCredential", orgId, credentialId);
        const cred = state.credentials.find((c) => c.id === credentialId);
        if (!cred) throw new ApiError(404, "not_found", "Credential not found");
        state.defaultCredentialId = credentialId;
        return { ...cred };
      },
      checkCredential: async (orgId, credentialId) => {
        log("agents.checkCredential", orgId, credentialId);
        if (state.keyRefusal)
          throw new ApiError(400, state.keyRefusal, "The provider didn't accept this key.", state.keyRefusalParams);
        return { check: "ok" as const };
      },
      platformKeyAvailable: async () => state.platformKey,
      aiStatus: async () =>
        structuredClone(
          state.aiStatus ?? {
            any: true,
            agents: state.agents.map((a) => ({ agentId: a.id, state: "ready" as const })),
          },
        ),
      statuses: async () =>
        structuredClone(
          state.agentStatuses ??
            state.agents.map((a) => ({
              agentId: a.id,
              presence: "online" as const,
              status: null,
              activeAt: new Date().toISOString(),
            })),
        ),
      usageQueue: async (orgId, agentId) => {
        log("agents.usageQueue", orgId, agentId);
        return structuredClone(
          state.usageQueues?.[agentId] ?? {
            agentId,
            reason: null,
            plan: null,
            resetsAt: null,
            sharedWith: [],
            rows: [],
            hidden: 0,
            mayStopAll: false,
            closed: [],
          },
        );
      },
      cancelUsageQueue: async (orgId, agentId) => {
        log("agents.cancelUsageQueue", orgId, agentId);
        const q = state.usageQueues?.[agentId];
        const canceled = q?.rows.filter((r) => r.state === "queued").length ?? 0;
        if (q) q.rows = q.rows.filter((r) => r.state !== "queued");
        return { canceled, skipped: 0 };
      },
      importFromGithub: async (orgId, url) => {
        log("agents.importFromGithub", orgId, url);
        const files = state.githubFiles?.[url];
        if (!files) throw new ApiError(400, "invalid_request", `GitHub answered 404 for ${new URL(url).pathname}`);
        return { files };
      },
      detail: async (_orgId, agentId) => {
        const a = state.agents.find((x) => x.id === agentId);
        if (!a) throw new ApiError(404, "not_found", "Agent not found");
        const channels = Object.entries(state.channelMembers)
          .filter(([, ms]) => ms.some((m) => m.type === "agent" && m.id === agentId))
          .map(([cid]) => ({ id: cid, name: state.channels.find((c) => c.id === cid)?.name ?? "", autoReply: false }));
        const { monthlyBudgetUsd, ...rest } = a;
        return {
          ...rest,
          credentialId: a.hasCredential ? "cred-1" : null,
          budgetUsedPercent: percentOf(a),
          ...(seesCost()
            ? {
                monthlyBudgetUsd,
                ...(monthlyBudgetUsd == null ? { defaultBudgetUsd: state.defaultAgentBudgetUsd ?? 50 } : {}),
              }
            : {}),
          tokensThisMonth: agentId === ADA_ID ? 3_100_000 : 210_000,
          runsThisMonth: agentId === ADA_ID ? 142 : 12,
          failuresThisMonth: agentId === ADA_ID ? 2 : 0,
          runsByDay:
            agentId === ADA_ID
              ? [
                  { day: 1, runs: 70, failed: 1 },
                  { day: 2, runs: 72, failed: 1 },
                ]
              : [{ day: 1, runs: 12, failed: 0 }],
          pendingApprovals: state.approvals.filter((x) => x.agentId === agentId && x.status === "pending").length,
          channels,
        };
      },
      channels: async (_orgId, agentId) =>
        Object.entries(state.channelMembers)
          .filter(([, ms]) => ms.some((m) => m.type === "agent" && m.id === agentId))
          .map(([cid]) => ({
            id: cid,
            name: state.channels.find((c) => c.id === cid)?.name ?? "",
            autoReply: state.autoReply[`${agentId}:${cid}`] ?? true,
          })),
      setChannels: async (orgId, agentId, channels) => {
        log("agents.setChannels", orgId, agentId, channels);
        for (const c of channels) {
          const list = state.channelMembers[c.channelId] ?? [];
          state.channelMembers[c.channelId] = list;
          if (!list.some((m) => m.type === "agent" && m.id === agentId)) list.push({ type: "agent", id: agentId });
          if (c.autoReply !== undefined) state.autoReply[`${agentId}:${c.channelId}`] = c.autoReply;
        }
        return channels.map((c) => ({ id: c.channelId, name: "", autoReply: c.autoReply ?? true }));
      },
      brain: async (_orgId, agentId) => {
        const me = requireMe();
        const agent = state.agents.find((a) => a.id === agentId);
        if (me.organizations[0]?.role === "member" && agent?.ownerUserId !== me.user.id && !agent?.builtin)
          throw new ApiError(403, "agent.not_owner", "Only an admin or the agent's owner");
        return structuredClone(brainOf(agentId));
      },
      brainMachines: async (orgId) => {
        log("agents.brainMachines", orgId);
        return structuredClone(state.brainMachines ?? []);
      },
      newAgentSetup: async (orgId) => {
        log("agents.newAgentSetup", orgId);
        return structuredClone(state.newAgentSetup ?? null);
      },
      // Each agent takes it unless `setupResults` says otherwise; applied, its brain view thinks so. A setup without
      // an Autonomia changes none.
      applySetup: async (orgId, input) => {
        log("agents.applySetup", orgId, input);
        return input.agentIds.map((agentId) => {
          const { autonomy, ...given } = state.setupResults?.[agentId] ?? {};
          const result: AgentSetupResult = {
            agentId,
            status: "applied",
            ...given,
            ...(input.setup.autonomy && autonomy ? { autonomy } : {}),
          };
          if (!input.preview && result.status === "applied") {
            const b = brainOf(agentId);
            const s = input.setup;
            brains.set(agentId, {
              ...b,
              brain: s.brain,
              model: s.brain === "model" ? null : s.model,
              effectiveModel: s.brain === "model" ? null : s.model,
              ...(s.brain !== "model" && !result.keeps ? { account: s.account ?? null } : {}),
              ...(s.effort !== undefined ? { effort: s.effort } : {}),
              ...(s.contextTokens !== undefined ? { contextTokens: s.contextTokens } : {}),
            });
          }
          return result;
        });
      },
      setBrain: async (orgId, agentId, input) => {
        log("agents.setBrain", orgId, agentId, input);
        const b = brainOf(agentId);
        const brain = input.brain ?? b.brain;
        const changed = brain !== b.brain;
        // ADR 0059 §5: onto a plan, only its owner talks to it until its owner or an admin lets others in.
        const row = state.agents.find((a) => a.id === agentId);
        // "Só algumas pessoas" with nobody picked already answers its owner alone: the server leaves it as it is.
        const restricted = row?.audience?.mode === "people" && !answersOthers(audienceOf(row), row.ownerUserId);
        const onlyOwner = restricted || (input.onlyOwner ?? (changed && brain !== "model" ? true : b.onlyOwner));
        const model = brain === "model" ? null : input.model !== undefined ? input.model : changed ? null : b.model;
        const option = b.options.find((o) => o.kind === brain);
        const next: AgentBrain = {
          ...b,
          brain,
          model,
          effectiveModel: brain === "model" ? null : (model ?? option?.defaultModel ?? null),
          fallback: input.fallback ?? b.fallback,
          // ADR 0041: another brain kind starts on the computer's own account.
          account: input.account !== undefined ? input.account : changed ? null : b.account,
          effort: input.effort !== undefined ? input.effort : b.effort,
          speed: input.speed ?? b.speed,
          onlyOwner,
        };
        brains.set(agentId, next);
        // Its row, as the server keeps it: onto a plan only its owner, its "who can talk" list kept; on, back to that
        // list, or everyone with none.
        if (row && !restricted && (changed || input.onlyOwner !== undefined)) {
          const was = audienceOf(row);
          const base: AgentAudience = changed && brain !== "model" ? { mode: "owner", userIds: was.userIds } : was;
          row.audience =
            input.onlyOwner === undefined
              ? base
              : input.onlyOwner
                ? { mode: "owner", userIds: was.userIds }
                : answersOthers(base, row.ownerUserId)
                  ? base
                  : was.userIds.length > 0
                    ? { mode: "people", userIds: was.userIds }
                    : { mode: "everyone", userIds: [] };
        }
        return structuredClone(next);
      },
      runs: async (_orgId, filter = {}) =>
        state.runs
          .filter(
            (r) => (!filter.agentId || r.agentId === filter.agentId) && (!filter.status || r.status === filter.status),
          )
          .slice(0, filter.limit),
      cancelRun: async (orgId, runId, reason, chain) => {
        if (chain) log("agents.cancelRun", orgId, runId, reason, "chain");
        else if (reason === undefined) log("agents.cancelRun", orgId, runId);
        else log("agents.cancelRun", orgId, runId, reason);
        if (state.runs.some((r) => r.id === runId && r.status !== "running" && r.status !== "queued"))
          throw new ApiError(409, "run_finished", "Run already finished");
        // The task manager's task ends, stopped by me (what the server lists next).
        const view = state.taskManager;
        const task = view?.tasks.find((x) => x.runId === runId);
        if (view && task) {
          view.tasks = view.tasks.filter((x) => x.runId !== runId);
          const me = state.me?.user;
          view.ended.unshift({
            runId,
            agentId: task.agentId,
            channelId: task.channelId,
            channelKind: task.channelKind,
            channelName: task.channelName,
            threadId: task.threadId,
            status: "canceled",
            label: task.label,
            background: task.background,
            routine: task.routine,
            startedAt: task.startedAt,
            finishedAt: new Date().toISOString(),
            stoppedBy: me ? { userId: me.id, name: me.name } : null,
          });
        }
      },
      stopReason: async (orgId, runId, reason) => {
        log("agents.stopReason", orgId, runId, reason);
        // The notice the agent reads keeps the reason, as the server's does.
        for (const m of state.messages) {
          const notice = m.meta?.notice as { kind?: string; refs?: Record<string, string> } | undefined;
          if (notice?.kind === "run_stopped" && notice.refs?.runId === runId)
            m.meta = { ...m.meta, notice: { ...notice, refs: { ...notice.refs, reason } } };
        }
      },
      continueRun: async (orgId, runId) => {
        log("agents.continueRun", orgId, runId);
        return { runId: `${runId}-continued` };
      },
      activeRuns: async (_orgId, channelId) => {
        log("agents.activeRuns", channelId);
        return state.activeRuns ? (state.activeRuns[channelId] ?? []) : null;
      },
      consultations: async (_orgId, channelId) => {
        log("agents.consultations", channelId);
        return state.consultations?.[channelId] ?? [];
      },
      consultation: async (_orgId, _channelId, consultationId) => {
        log("agents.consultation", consultationId);
        return state.consultationConversations?.[consultationId] ?? null;
      },
      run: async (_orgId, runId) => {
        // An approval's run: the one in `runs`, else one made from the request (the review reads its steps).
        const asked = state.approvals.find((a) => a.runId === runId);
        const r =
          state.runs.find((x) => x.id === runId) ??
          (asked
            ? {
                id: runId,
                agentId: asked.agentId,
                channelId: asked.channelId,
                threadId: asked.threadId ?? "",
                trigger: "mention",
                status: "running",
                error: null,
                what: asked.title,
                turns: 1,
                inputTokens: 0,
                outputTokens: 0,
                createdAt: asked.createdAt,
                finishedAt: null,
              }
            : undefined);
        if (!r) throw new ApiError(404, "not_found", "Run not found");
        return { run: r, steps: structuredClone(state.runSteps?.[runId] ?? []) };
      },
      usage: async () =>
        state.me?.organizations[0]?.role === "member"
          ? null
          : [
              {
                agentId: ADA_ID,
                handle: "ada",
                calls: 142,
                inputTokens: 3_000_000,
                outputTokens: 100_000,
                costUsd: 12.3,
              },
              {
                agentId: ATLAS_ID,
                handle: "atlas",
                calls: 12,
                inputTokens: 200_000,
                outputTokens: 10_000,
                costUsd: 3.1,
              },
            ],
    },
    // Like the backend on an empty workspace: every picked item is new; a taken handle gets the next free one.
    imports: {
      apply: async (orgId, input) => {
        log("imports.apply", orgId, input);
        if (state.me?.organizations[0]?.role === "member") {
          throw new ApiError(403, "forbidden", "You don't have permission to do this");
        }
        const { bundle } = input;
        const items: ImportItemResult[] = [];
        const add = (kind: ImportItemKind, key: string, label: string, extra: Partial<ImportItemResult> = {}) => {
          if (input.pick && !input.pick.includes(`${kind}:${key}`)) return;
          items.push({ kind, key, label, action: "create", ...extra, ...(input.dryRun ? {} : { targetId: id(kind) }) });
        };
        for (const s of bundle.skills) add("skill", s.key, /^name:\s*(.+)$/m.exec(s.markdown)?.[1]?.trim() ?? s.key);
        const taken = new Set(state.agents.map((a) => a.handle));
        for (const a of bundle.agents) {
          let handle = a.handle;
          for (let i = 2; taken.has(handle); i++) handle = `${a.handle}${i}`;
          taken.add(handle);
          add("agent", a.key, a.name, handle === a.handle ? {} : { renamedTo: handle });
          const created = items.at(-1);
          if (input.dryRun || created?.kind !== "agent" || created.key !== a.key) continue;
          state.agents.push({
            id: created.targetId ?? id("agent"),
            name: a.name,
            handle,
            role: a.role,
            instructions: a.instructions,
            model: a.model ?? "claude-sonnet-5-5",
            ownerUserId: state.me?.user.id ?? null,
            hasCredential: false,
            monthlyBudgetUsd: null,
            createdAt: NOW.toISOString(),
            audience: { mode: "everyone", userIds: [] },
          });
        }
        for (const c of bundle.channels) add("channel", c.key, c.name);
        for (const r of bundle.routines) add("routine", r.key, r.name);
        for (const n of bundle.notes) add("note", n.key, n.title || n.content.split("\n")[0]?.slice(0, 80) || n.key);
        if (!input.dryRun) {
          state.imported = [
            ...(state.imported ?? []),
            ...items.map((i) => ({ app: bundle.source.app, ref: bundle.source.ref, kind: i.kind })),
          ];
        }
        return { items };
      },
      sources: async (orgId) => {
        log("imports.sources", orgId);
        const sources: ImportedSource[] = [];
        for (const { app, ref, kind } of state.imported ?? []) {
          let source = sources.find((x) => x.app === app && x.ref === ref);
          if (!source) {
            source = { app, ref, counts: { agent: 0, skill: 0, channel: 0, routine: 0, note: 0 } };
            sources.push(source);
          }
          source.counts[kind] += 1;
        }
        return sources;
      },
      exportUrl: (orgId) => `/api/app/organizations/${orgId}/export`,
      // Like the backend: `<agent's name>/<path>` in the Drive, never over a name already there, never a key file.
      copyFile: async (orgId, { file, ...input }) => {
        log("imports.copyFile", orgId, input);
        if (isSecretFile(input.path)) throw new ApiError(400, "import.secret_file", "Never copied to the Drive");
        const agent = state.agents.find((a) => a.id === input.agentId);
        const drive = state.drive;
        if (!agent || !drive) throw new ApiError(404, "not_found", "Agent not found");
        const folder = driveFolder(agent.name);
        const title = `${folder}/${input.path}`;
        const there = (await drive.list(orgId)).find((a) => a.title === title && a.channelId === null);
        if (there) return { status: "exists", artifactId: there.id, title, folder };
        const created = await drive.upload(orgId, new File([file], input.name), { title });
        return { status: "created", artifactId: created.id, title, folder };
      },
    },
    chat: {
      channels: async () => state.channels,
      createChannel: async (orgId, input) => {
        log("chat.createChannel", orgId, input);
        if (state.channels.some((c) => c.name === input.name))
          throw new ApiError(409, "conflict", `#${input.name} already exists`);
        const channel: Channel = {
          id: id("chan"),
          name: input.name,
          topic: input.topic ?? "",
          visibility: input.visibility ?? "public",
          isMember: true,
          createdAt: new Date().toISOString(),
          categoryId: input.categoryId ?? null,
        };
        state.channels.push(channel);
        state.channelMembers[channel.id] = [{ type: "person", id: state.me?.user.id ?? "" }];
        return channel;
      },
      categories: async () => structuredClone(state.channelCategories ?? []),
      createCategory: async (orgId, input) => {
        log("chat.createCategory", orgId, input);
        state.channelCategories ??= [];
        const list = state.channelCategories;
        if (list.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase()))
          throw new ApiError(409, "conflict", `The category ${input.name} already exists`);
        const category: ChannelCategory = { id: id("cat"), name: input.name.trim(), position: list.length };
        list.push(category);
        for (const channelId of input.channelIds ?? []) {
          const c = state.channels.find((x) => x.id === channelId);
          if (c) c.categoryId = category.id;
        }
        return { ...category };
      },
      renameCategory: async (orgId, categoryId, name) => {
        log("chat.renameCategory", orgId, categoryId, name);
        const c = state.channelCategories?.find((x) => x.id === categoryId);
        if (!c) throw new ApiError(404, "not_found", "Category not found");
        c.name = name.trim();
        return { ...c };
      },
      deleteCategory: async (orgId, categoryId) => {
        log("chat.deleteCategory", orgId, categoryId);
        state.channelCategories = (state.channelCategories ?? []).filter((c) => c.id !== categoryId);
        for (const c of state.channels) if (c.categoryId === categoryId) c.categoryId = null;
      },
      placeCategory: async (orgId, categoryId, beforeCategoryId) => {
        log("chat.placeCategory", orgId, categoryId, beforeCategoryId);
      },
      place: async (orgId, channelId, input) => {
        log("chat.place", orgId, channelId, input);
        const c = state.channels.find((x) => x.id === channelId);
        if (!c) throw new ApiError(404, "not_found", "Channel not found");
        c.categoryId = input.categoryId;
        // Like the server: before `beforeChannelId`, else at the end; the list comes back in that order.
        const rest = state.channels.filter((x) => x !== c);
        const at = rest.findIndex((x) => x.id === input.beforeChannelId);
        rest.splice(at >= 0 ? at : rest.length, 0, c);
        state.channels = rest;
      },
      join: async (orgId, channelId) => {
        log("chat.join", orgId, channelId);
        const c = state.channels.find((x) => x.id === channelId);
        if (c) c.isMember = true;
      },
      card: async (_orgId, channelId) => {
        const c = state.channels.find((x) => x.id === channelId);
        if (!c || (c.visibility === "private" && !c.isMember))
          throw new ApiError(404, "not_found", "Channel not found");
        const members = state.channelMembers[channelId] ?? [];
        return {
          id: c.id,
          name: c.name,
          topic: c.topic,
          visibility: c.visibility,
          isMember: c.isMember,
          archived: false,
          people: members.filter((m) => m.type === "person").length,
          agents: members.filter((m) => m.type === "agent").length,
        };
      },
      messageCard: async (_orgId, messageId) => {
        const m = state.messages.find((x) => x.id === messageId);
        const channel = state.channels.find((c) => c.id === m?.channelId);
        const dm = state.dms.find((d) => d.channelId === m?.channelId);
        if (!m || (!dm && (!channel || (channel.visibility === "private" && !channel.isMember))))
          throw new ApiError(404, "not_found", "Message not found");
        const author =
          m.author.type === "agent"
            ? state.agents.find((a) => a.id === m.author.id)?.name
            : state.members.find((p) => p.userId === m.author.id)?.name;
        return {
          id: m.id,
          channelId: m.channelId,
          threadId: m.threadId && m.threadId !== m.id ? m.threadId : null,
          kind: dm ? "dm" : "channel",
          name: dm ? dm.with.name : (channel?.name ?? ""),
          author: author ?? "",
        };
      },
      idRef: async (_orgId, id) => {
        const ref = state.idRefs?.[id];
        if (!ref) throw new ApiError(404, "not_found", "Nothing here has this id");
        return structuredClone(ref);
      },
      members: async (_orgId, channelId) => state.channelMembers[channelId] ?? [],
      archive: async (orgId, channelId) => {
        log("chat.archive", orgId, channelId);
        state.channels = state.channels.filter((c) => c.id !== channelId);
      },
      unarchive: async (orgId, channelId) => {
        log("chat.unarchive", orgId, channelId);
        state.archivedChannels = (state.archivedChannels ?? []).filter((c) => c.id !== channelId);
      },
      archived: async () => state.archivedChannels ?? [],
      leave: async (orgId, channelId) => {
        log("chat.leave", orgId, channelId);
        const c = state.channels.find((x) => x.id === channelId);
        if (c) c.isMember = false;
      },
      deleteChannel: async (orgId, channelId, name) => {
        log("chat.deleteChannel", orgId, channelId, name);
        const c = state.channels.find((x) => x.id === channelId);
        if (!c || c.name !== name.trim().replace(/^#/, "").toLowerCase())
          throw new ApiError(400, "channel.delete_name", "Type the channel's name to delete it");
        state.channels = state.channels.filter((x) => x.id !== channelId);
      },
      update: async (orgId, channelId, input) => {
        log("chat.update", orgId, channelId, input);
        const c = state.channels.find((x) => x.id === channelId);
        if (!c) throw new ApiError(404, "not_found", "Channel not found");
        Object.assign(c, input);
        return { ...c };
      },
      reactions: async (_orgId, messageId) => structuredClone(state.reactions[messageId] ?? []),
      react: async (orgId, messageId, reaction) => {
        log("chat.react", orgId, messageId, reaction);
        const me = state.me?.user.id ?? "";
        const list = state.reactions[messageId] ?? [];
        const r = list.find((x) => x.reaction === reaction) ?? { reaction, count: 0, userIds: [] };
        if (!r.userIds.includes(me)) {
          r.userIds.push(me);
          r.count++;
        }
        state.reactions[messageId] = [...list.filter((x) => x.reaction !== reaction), r];
        return structuredClone(state.reactions[messageId] ?? []);
      },
      unreact: async (orgId, messageId, reaction) => {
        log("chat.unreact", orgId, messageId, reaction);
        const me = state.me?.user.id ?? "";
        state.reactions[messageId] = (state.reactions[messageId] ?? [])
          .map((r) =>
            r.reaction === reaction ? { ...r, userIds: r.userIds.filter((u) => u !== me), count: r.count - 1 } : r,
          )
          .filter((r) => r.count > 0);
        return structuredClone(state.reactions[messageId] ?? []);
      },
      correct: async (orgId, messageId, body) => {
        log("chat.correct", orgId, messageId, body);
      },
      answerNow: async (orgId, messageId) => {
        log("chat.answerNow", orgId, messageId);
        if (state.answerNowError) throw state.answerNowError;
        return { runs: state.answerNowRuns ?? [] };
      },
      followUps: async (orgId, channelId) => {
        log("chat.followUps", orgId, channelId);
        return (state.followUps ?? []).filter((r) => r.channelId === channelId);
      },
      cancelFollowUp: async (orgId, messageId) => {
        log("chat.cancelFollowUp", orgId, messageId);
        if (state.followUpCancelError) throw state.followUpCancelError;
        state.followUps = state.followUps?.filter((r) => r.messageId !== messageId);
        const line = state.messages.find((m) => m.id === messageId);
        const notice = line?.meta?.notice as { refs?: Record<string, string> } | undefined;
        if (notice?.refs) notice.refs = { ...notice.refs, state: "canceled" };
      },
      answerGitHub: async (orgId, messageId) => {
        log("chat.answerGitHub", orgId, messageId);
        const line = state.messages.find((m) => m.id === messageId);
        const notice = line?.meta?.notice as { refs?: Record<string, string> } | undefined;
        if (notice?.refs) notice.refs = { ...notice.refs, answeredBy: "me" };
      },
      roster: async (_orgId, channelId) =>
        (state.channelMembers[channelId] ?? []).map((m) =>
          m.type === "agent"
            ? {
                type: "agent" as const,
                id: m.id,
                name: state.agents.find((a) => a.id === m.id)?.name ?? "",
                handle: state.agents.find((a) => a.id === m.id)?.handle ?? null,
                autoReply: state.autoReply[`${m.id}:${channelId}`] ?? true,
                joinedAt: NOW.toISOString(),
              }
            : {
                type: "person" as const,
                id: m.id,
                name: state.members.find((p) => p.userId === m.id)?.name ?? "",
                handle: null,
                autoReply: null,
                joinedAt: NOW.toISOString(),
              },
        ),
      removeMember: async (orgId, channelId, member) => {
        log("chat.removeMember", orgId, channelId, member);
        const id = "agentId" in member ? member.agentId : member.userId;
        state.channelMembers[channelId] = (state.channelMembers[channelId] ?? []).filter((m) => m.id !== id);
      },
      setAutoReply: async (orgId, channelId, agentId, autoReply) => {
        log("chat.setAutoReply", orgId, channelId, agentId, autoReply);
        state.autoReply[`${agentId}:${channelId}`] = autoReply;
      },
      permissions: async (orgId, channelId) => {
        log("chat.permissions", orgId, channelId);
        return structuredClone(state.channelPermissions[channelId] ?? []);
      },
      setPermission: async (orgId, channelId, override) => {
        log("chat.setPermission", orgId, channelId, override);
        const same = (o: ChannelOverride) =>
          o.target.type === override.target.type && o.target.id === override.target.id;
        const rest = (state.channelPermissions[channelId] ?? []).filter((o) => !same(o));
        const empty = override.allow.length === 0 && override.deny.length === 0;
        state.channelPermissions[channelId] = empty ? rest : [...rest, override];
        return empty ? null : override;
      },
      addMember: async (orgId, channelId, member) => {
        log("chat.addMember", orgId, channelId, member);
        const list = state.channelMembers[channelId] ?? [];
        state.channelMembers[channelId] = list;
        list.push("agentId" in member ? { type: "agent", id: member.agentId } : { type: "person", id: member.userId });
      },
      // Copies, as over HTTP: each read is new objects, never the ones an earlier read returned.
      messages: async (_orgId, channelId, options = {}) => {
        const inChannel = state.messages.filter((m) => m.channelId === channelId);
        if (options.threadId) {
          const root = inChannel.find((m) => m.id === options.threadId);
          return structuredClone([
            ...(root ? [root] : []),
            ...inChannel.filter((m) => m.threadId === options.threadId),
          ]);
        }
        // Like the server: the latest `limit` before `before`, oldest first.
        const top = inChannel.filter((m) => m.threadId === null && (!options.before || m.createdAt < options.before));
        return structuredClone(options.limit ? top.slice(-options.limit) : top);
      },
      post: async (orgId, channelId, input) => {
        log("chat.post", orgId, channelId, input);
        if (state.holdPosts) await state.holdPosts;
        if (state.failPosts === true) throw new ApiError(503, "unavailable", "Try again");
        if (state.failPosts) throw state.failPosts;
        // Like the server: a resend (the same person's `clientId`) gets the message already written.
        const resent = input.clientId
          ? state.messages.find((m) => m.clientId === input.clientId && m.author.id === (state.me?.user.id ?? null))
          : undefined;
        if (resent) return resent;
        // Like the server: the quoted message must be in this channel and, from a thread, in that thread; the meta is
        // built here.
        const meta: Record<string, unknown> = {};
        if (input.replyTo) {
          const quoted = state.messages.find((m) => m.id === input.replyTo);
          const elsewhere = input.threadId && quoted?.id !== input.threadId && quoted?.threadId !== input.threadId;
          if (!quoted || quoted.channelId !== channelId || elsewhere) {
            throw new ApiError(400, "message.reply_not_found", "replyTo must be a message of this conversation");
          }
          const who =
            quoted.author.type === "agent"
              ? state.agents.find((a) => a.id === quoted.author.id)?.name
              : state.members.find((m) => m.userId === quoted.author.id)?.name;
          meta.replyTo = {
            messageId: quoted.id,
            threadId: quoted.threadId,
            author: quoted.author,
            authorName: who ?? "",
            excerpt: quoted.body.replace(/\s+/g, " ").trim().slice(0, 200),
          };
        }
        if (input.attachments?.length) meta.artifacts = input.attachments.map((a) => ({ id: a, version: 1 }));
        // Like the server (ADR 0091): a GIF looked up again (its size and title are the provider's), a sticker as sent.
        const media = input.media;
        if (media?.kind === "gif") {
          const gif = (state.gifResults ?? FAKE_GIFS).find((g) => g.id === media.id);
          if (!gif) throw new ApiError(422, "message.media_not_found", "That GIF isn't available");
          meta.media = { kind: "gif", provider: "giphy", ...gif };
        } else if (media?.kind === "sticker") meta.media = { ...media };
        const message: Message = {
          id: input.clientId ? `srv-${input.clientId}` : id("msg"),
          channelId,
          threadId: input.threadId ?? null,
          author: { type: "person", id: state.me?.user.id ?? null },
          body: input.body,
          mentionedAgentIds: [],
          agentRunId: null,
          clientId: input.clientId ?? null,
          ...(Object.keys(meta).length > 0 ? { meta } : {}),
          createdAt: new Date().toISOString(),
        };
        message.mentionedAgentIds = state.agents
          .filter((a) => input.body.toLowerCase().includes(`@${a.handle}`))
          .filter((a) => (state.channelMembers[channelId] ?? []).some((m) => m.type === "agent" && m.id === a.id))
          .map((a) => a.id);
        state.messages.push(message);
        // Like the server: a reply from the thread panel marks when "Responder" opened the thread.
        if (input.openThread && input.threadId) await state.openThread?.(orgId, input.threadId, message.createdAt);
        return message;
      },
    },
    // GIF search (ADR 0091): titles that hold the words, a page at a time; `gifs.off` like the server's.
    gifs: {
      search: async (orgId, query) => {
        log("gifs.search", orgId, query);
        if (state.gifsError) throw state.gifsError;
        const media = mediaSettings(state);
        if (!media.gifsAvailable || !media.gifs) throw new ApiError(404, "gifs.off", "GIFs are off");
        const words = query.q?.trim().toLowerCase();
        const all = state.gifResults ?? FAKE_GIFS;
        const found = words ? all.filter((g) => g.title.toLowerCase().includes(words)) : all;
        const offset = query.offset ?? 0;
        const limit = query.limit ?? 24;
        return {
          gifs: structuredClone(found.slice(offset, offset + limit)),
          next: offset + limit < found.length ? offset + limit : null,
        };
      },
    },
    approvals: {
      list: async (_orgId, filter = {}) => {
        log("approvals.list", filter);
        const all = structuredClone(state.approvals).filter(
          (a) =>
            (!filter.agentId || a.agentId === filter.agentId) &&
            (!filter.messageId || a.messageId === filter.messageId) &&
            (!filter.status || (filter.status === "pending") === (a.status === "pending")),
        );
        if (filter.messageId || state.approvalsWindow === undefined) return all;
        return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, state.approvalsWindow);
      },
      get: async (_orgId, id) => {
        const a = state.approvals.find((x) => x.id === id);
        if (!a) throw new ApiError(404, "not_found", "Approval not found");
        return structuredClone(a);
      },
      approve: async (orgId, approvalId, reason, always, via) => {
        if (via) log("via", via);
        if (!always) return decide(orgId, approvalId, "approved", reason);
        const a = state.approvals.find((x) => x.id === approvalId);
        const kind = a?.approveAlways;
        if (!a || !kind)
          throw new ApiError(409, "approval.always_unavailable", "This request can't be approved for good");
        const decided = await decide(orgId, approvalId, "approved", reason, true);
        const mine = state.approvalRules?.[a.agentId] ?? [];
        state.approvalRules = { ...state.approvalRules, [a.agentId]: mine };
        for (const action of kind.actions.length > 0 ? kind.actions : [""]) {
          mine.push({
            id: id("rule"),
            connectionId: "conn-composio",
            server: "Composio",
            tool: kind.tool,
            toolLabel: kind.tool,
            action,
            createdByUserId: state.me?.user.id ?? null,
            createdAt: new Date().toISOString(),
          });
        }
        return decided;
      },
      refuse: async (orgId, id, reason, via) => {
        if (via) log("via", via);
        return decide(orgId, id, "refused", reason);
      },
      cancel: async (orgId, approvalId) => {
        log("approvals.cancel", orgId, approvalId);
        const a = state.approvals.find((x) => x.id === approvalId);
        if (!a?.runAt) throw new ApiError(409, "approval.not_ahead", "Only an action approved ahead can be canceled");
        if (a.executedAt || (a.status !== "pending" && a.status !== "approved")) {
          throw new ApiError(409, "approval.not_cancelable", "This action already ran or ended");
        }
        Object.assign(a, {
          status: "canceled",
          decidedAt: new Date().toISOString(),
          canDecide: false,
          canCancel: false,
        });
        return { ...a };
      },
      decideMany: async (orgId, input) => {
        log("approvals.decideMany", orgId, input.ids, input.decision, ...(input.only ? [input.only] : []));
        if (input.via) log("via", input.via);
        const out: Approval[] = [];
        const skipped: string[] = [];
        for (const approvalId of input.ids) {
          const a = state.approvals.find((x) => x.id === approvalId);
          if (a?.status !== "pending" || !a.canDecide || (input.only === "routine" && !a.routine))
            skipped.push(approvalId);
          else {
            Object.assign(a, {
              status: input.decision === "approve" ? "approved" : "refused",
              decidedByUserId: state.me?.user.id ?? null,
              decidedAt: new Date().toISOString(),
              reason: input.reason ?? null,
              canDecide: false,
            });
            out.push({ ...a });
          }
        }
        return { approvals: out, skipped };
      },
      rules: async (orgId, agentId) => {
        log("approvals.rules", orgId, agentId);
        return structuredClone(state.approvalRules?.[agentId] ?? []);
      },
      removeRule: async (orgId, agentId, ruleId) => {
        log("approvals.removeRule", orgId, agentId, ruleId);
        const list = state.approvalRules?.[agentId] ?? [];
        if (!list.some((r) => r.id === ruleId)) throw new ApiError(404, "not_found", "Rule not found");
        if (state.approvalRules) state.approvalRules[agentId] = list.filter((r) => r.id !== ruleId);
      },
      covers: async (orgId) => {
        log("approvals.covers", orgId);
        return structuredClone(state.approvalCovers ?? { cover: null, covering: [] });
      },
      setCover: async (orgId, input) => {
        log("approvals.setCover", orgId, input);
        const covers = state.approvalCovers ?? { cover: null, covering: [] };
        state.approvalCovers = { ...covers, cover: { ...input, active: input.mode === "always" } };
        return structuredClone(state.approvalCovers);
      },
      endCover: async (orgId, userId) => {
        log("approvals.endCover", orgId, userId);
        const covers = state.approvalCovers ?? { cover: null, covering: [] };
        state.approvalCovers = {
          cover: userId === state.me?.user.id ? null : covers.cover,
          covering: covers.covering.filter((c) => c.userId !== userId),
        };
      },
      rightHand: async (orgId) => {
        log("approvals.rightHand", orgId);
        return structuredClone(state.rightHandApprovals ?? rightHandOff(state));
      },
      setRightHand: async (orgId, input) => {
        log("approvals.setRightHand", orgId, input);
        const before = state.rightHandApprovals ?? rightHandOff(state);
        state.rightHandApprovals = { ...before, ...input, ...(input.enabled ? { pausedAt: null } : {}) };
        return structuredClone(state.rightHandApprovals);
      },
      undoRightHand: async (orgId, decisionId) => {
        log("approvals.undoRightHand", orgId, decisionId);
      },
    },
    connectors: {
      catalog: async () => CATALOG,
      list: async () => structuredClone(state.connections),
      connectWithKey: async (orgId, input) => {
        log("connectors.connectWithKey", orgId, { ...input, apiKey: "[redacted]" });
        const conn: Connection = {
          id: id("conn"),
          connector: input.connector,
          label: CATALOG.connectors.find((d) => d.id === input.connector)?.label ?? input.connector,
          serverUrl: CATALOG.connectors.find((d) => d.id === input.connector)?.serverUrl ?? "https://example.test/mcp",
          authType: "api_key",
          accountLabel: null,
          tokenExpiresAt: null,
          createdAt: new Date().toISOString(),
          revokedAt: null,
        };
        state.connections.push(conn);
        return conn;
      },
      startOAuth: async (orgId, connector, input) => {
        log("connectors.startOAuth", orgId, connector, input);
        return `https://github.com/login/oauth/authorize?state=s&return=${encodeURIComponent(input.returnTo)}`;
      },
      completeOAuth: async (orgId, input) => {
        log("connectors.completeOAuth", orgId, input);
        throw new Error("the web app finishes OAuth in the callback");
      },
      composioUsage: async () => structuredClone(state.composioUsage ?? { calls: 0, limit: null, month: "2026-11" }),
      rename: async (orgId, connectionId, label) => {
        log("connectors.rename", orgId, connectionId, label);
        const conn = state.connections.find((c) => c.id === connectionId);
        if (!conn) throw new ApiError(404, "not_found", "Connection not found");
        conn.label = label;
        return structuredClone(conn);
      },
      disconnect: async (orgId, connectionId) => {
        log("connectors.disconnect", orgId, connectionId);
        state.connections = state.connections.filter((c) => c.id !== connectionId);
        for (const k of Object.keys(state.scopes))
          state.scopes[k] = (state.scopes[k] ?? []).filter((g) => g.connectionId !== connectionId);
      },
    },
    githubApp: {
      access: async () =>
        structuredClone(
          state.githubAccess ?? {
            orgs: [],
            manageUrl: "https://github.com/settings/connections/applications/client-id",
          },
        ),
      info: async () => {
        const { uninstallRefused: _, ...info } = state.githubApp ?? { installable: false, installations: [] };
        return structuredClone(info);
      },
      install: async (orgId, returnTo) => {
        log("githubApp.install", orgId, returnTo);
        return "https://github.com/apps/agentes-chat/installations/new?state=s";
      },
      complete: async (orgId, input) => {
        log("githubApp.complete", orgId, input);
        throw new Error("the web app finishes the install in the callback");
      },
      remove: async (orgId, installId) => {
        log("githubApp.remove", orgId, installId);
        if (state.githubApp)
          state.githubApp.installations = state.githubApp.installations.filter((i) => i.id !== installId);
        return { uninstalled: !state.githubApp?.uninstallRefused };
      },
      startManifest: async (returnTo) => {
        log("githubApp.startManifest", returnTo);
        return "https://chat.example.com/api/app/github-app/manifest/start?state=s";
      },
      removeSettings: async () => {
        log("githubApp.removeSettings");
        const setup = { source: null, slug: null, htmlUrl: null, state: "off" as const, canCreate: true };
        if (state.githubApp) state.githubApp = { ...state.githubApp, installable: false, setup };
        return setup;
      },
      repositories: async () =>
        structuredClone(state.githubRepos ?? { connected: false, accounts: [], truncated: false }),
    },
    search: {
      query: async (orgId, input) => {
        log("search.query", orgId, input);
        const q = input.q.toLowerCase();
        const f = input.filters;
        // The filters the fake reads (ADR 0123): `in:` and `from:`.
        const from = [...(f?.fromUsers ?? []), ...(f?.fromAgents ?? [])];
        const messages = state.messages
          .filter((m) => m.body.toLowerCase().includes(q))
          .filter((m) => !f?.in?.length || f.in.includes(m.channelId))
          .filter((m) => !from.length || from.includes(m.author.id ?? ""))
          .map((m) => {
            const name =
              m.author.type === "agent"
                ? (state.agents.find((a) => a.id === m.author.id)?.name ?? "")
                : (state.members.find((p) => p.userId === m.author.id)?.name ?? "");
            return {
              kind: "message" as const,
              sourceId: m.id,
              channelIds: [m.channelId],
              title: name,
              snippet: m.body,
              score: 1,
              createdAt: m.createdAt,
              messageId: m.id,
              threadId: m.threadId,
              threadTitle:
                m.threadId && m.threadId !== m.id
                  ? (state.messages.find((r) => r.id === m.threadId)?.body.split("\n")[0] ?? null)
                  : null,
              author: m.author.id ? { type: m.author.type, id: m.author.id, name } : null,
            };
          });
        const items = state.memories
          .filter((m) => m.text.toLowerCase().includes(q))
          .map((m) => ({
            kind: "context_item" as const,
            sourceId: m.id,
            channelIds: [ENG_ID],
            title: "Decisão",
            snippet: m.text,
            score: 0.5,
            createdAt: m.updatedAt,
          }));
        const actions = (state.teamActions ?? []).filter((h) => h.snippet.toLowerCase().includes(q));
        const all = f && Object.keys(f).some((k) => k !== "sort") ? messages : [...actions, ...messages, ...items];
        return all.filter((h) => !input.kinds || input.kinds.includes(h.kind));
      },
    },
    memory: {
      list: async (_orgId, agentId) => structuredClone(state.memories.filter((m) => m.agentId === agentId)),
      listAll: async () => structuredClone(state.memories),
      edit: async (orgId, id, text) => patchMemory(orgId, id, { text }),
      setPinned: async (orgId, id, pinned) => patchMemory(orgId, id, { pinned }),
      setArchived: async (orgId, id, archived) => patchMemory(orgId, id, { archived }),
      confirm: async (orgId, id) => patchMemory(orgId, id, { confirmed: true }),
      listTeam: async () => state.memories.filter((m) => !m.agentId && !m.archived),
      makeTeam: async (orgId, id) => {
        log("memory.team", orgId, id);
        const m = state.memories.find((x) => x.id === id);
        if (!m) throw new ApiError(404, "not_found", "Memory not found");
        m.agentId = "";
        return m;
      },
      revert: async (orgId, id) => {
        log("memory.revert", orgId, id);
      },
    },
    dms: {
      list: async () => state.dms.map(dmRow),
      open: async (orgId, target) => {
        log("dms.open", orgId, target);
        const existing = state.dms.find((d) =>
          "agentId" in target ? d.with.id === target.agentId : d.with.id === target.userId,
        );
        if (existing) return { channelId: existing.channelId, dm: dmRow(existing) };
        const channelId = id("dm");
        const agent = "agentId" in target ? state.agents.find((a) => a.id === target.agentId) : undefined;
        const person = "userId" in target ? state.members.find((m) => m.userId === target.userId) : undefined;
        state.channelMembers[channelId] = [
          { type: "person", id: state.me?.user.id ?? "" },
          agent ? { type: "agent", id: agent.id } : { type: "person", id: person?.userId ?? "" },
        ];
        state.dms.push({
          channelId,
          with: agent
            ? { type: "agent", id: agent.id, name: agent.name, handle: agent.handle }
            : { type: "person", id: person?.userId ?? "", name: person?.name ?? "", handle: null },
          openedAt: new Date().toISOString(),
        });
        return { channelId, dm: dmRow(state.dms.at(-1) as (typeof state.dms)[number]) };
      },
      markRead: async (orgId, channelId) => {
        log("dms.markRead", orgId, channelId);
        const dm = state.dms.find((d) => d.channelId === channelId);
        if (dm) dm.everRead = true;
      },
      reads: async () => [],
    },
    reads: {
      mute: async (orgId, channelId, muted) => {
        log("reads.mute", orgId, channelId, muted);
        const c = state.channels.find((x) => x.id === channelId);
        if (c) c.muted = muted;
      },
      markThreadRead: async (orgId, threadId) => log("reads.markThreadRead", orgId, threadId),
      unreadThreads: async () => state.unreadThreads ?? 0,
      unreadTasks: async () => structuredClone(state.unreadTasks ?? []),
    },
    questions: {
      // Same rules as the server: the choice must be one of the options; answering twice is 409.
      answer: async (orgId, questionId, input) => {
        log("questions.answer", orgId, questionId, input);
        await state.answerHold;
        const msg = state.messages.find((m) => (m.meta?.question as AgentQuestion | undefined)?.id === questionId);
        const q = msg?.meta?.question as AgentQuestion | undefined;
        if (!q) throw new ApiError(404, "not_found", "Question not found");
        if (q.status === "answered" || state.answeredElsewhere?.has(questionId)) {
          throw new ApiError(409, "conflict", "This question was already answered");
        }
        if (input.choice && q.choices && !q.choices.includes(input.choice)) {
          throw new ApiError(400, "invalid_choice", "Pick one of the options");
        }
        const answer =
          input.choice && input.text ? `${input.choice} (${input.text})` : (input.choice ?? input.text ?? null);
        Object.assign(q, { status: "answered", answer, answeredByUserId: state.me?.user.id ?? null });
        return structuredClone(q);
      },
      dismiss: async (orgId, questionId) => {
        log("questions.dismiss", orgId, questionId);
        const msg = state.messages.find((m) => (m.meta?.question as AgentQuestion | undefined)?.id === questionId);
        const q = msg?.meta?.question as AgentQuestion | undefined;
        if (!q) throw new ApiError(404, "not_found", "Question not found");
        if (q.status === "answered") throw new ApiError(409, "conflict", "This question was already answered");
        Object.assign(q, {
          status: "answered",
          answer: null,
          answeredByUserId: state.me?.user.id ?? null,
          dismissed: true,
        });
        return structuredClone(q);
      },
    },
    secrets: {
      // "Save to the Vault" on the card (ADR 0144): logged, so a test can check it came after the delivery.
      saveToVault: async (orgId, requestId, input) => {
        log("secrets.saveToVault", orgId, requestId, input);
        return {} as never;
      },
      get: async (_orgId, requestId) => {
        const msg = state.messages.find((m) => (m.meta?.secretRequest as SecretRequest | undefined)?.id === requestId);
        const r = msg?.meta?.secretRequest as SecretRequest | undefined;
        if (!r) throw new ApiError(404, "not_found", "Secret request not found");
        return structuredClone(r);
      },
      // Like the server: only the person asked answers, once; the fake keeps the box to check it was sealed.
      deliver: async (orgId, requestId, box) => {
        log("secrets.deliver", orgId, requestId, box);
        const msg = state.messages.find((m) => (m.meta?.secretRequest as SecretRequest | undefined)?.id === requestId);
        const r = msg?.meta?.secretRequest as SecretRequest | undefined;
        if (!r || r.requestedForUserId !== state.me?.user.id)
          throw new ApiError(404, "not_found", "Secret request not found");
        if (r.status !== "pending") throw new ApiError(409, "conflict", "This request was already answered or expired");
        Object.assign(r, { status: "delivered", publicKey: null, deliveredAt: new Date().toISOString() });
        return structuredClone(r);
      },
      decline: async (orgId, requestId) => {
        log("secrets.decline", orgId, requestId);
        const msg = state.messages.find((m) => (m.meta?.secretRequest as SecretRequest | undefined)?.id === requestId);
        const r = msg?.meta?.secretRequest as SecretRequest | undefined;
        if (!r) throw new ApiError(404, "not_found", "Secret request not found");
        if (r.status !== "pending") throw new ApiError(409, "conflict", "This request was already answered or expired");
        Object.assign(r, { status: "declined", publicKey: null });
        return structuredClone(r);
      },
      list: async (orgId, agentId) => {
        log("secrets.list", orgId, agentId);
        return structuredClone(state.agentSecrets?.[agentId] ?? []);
      },
      remove: async (orgId, agentId, name, machineId) => {
        log("secrets.remove", orgId, agentId, name, machineId);
        const list = state.agentSecrets?.[agentId];
        if (list) state.agentSecrets = { ...state.agentSecrets, [agentId]: list.filter((x) => x.name !== name) };
      },
    },
    proposals: {
      list: async (_orgId, filter) => {
        const ids = filter?.ids;
        return structuredClone(ids ? state.proposals.filter((p) => ids.includes(p.id)) : state.proposals);
      },
      accept: async (orgId, id, text) => {
        log("proposals.accept", orgId, id, text);
        const p = findProposal(id);
        if (p.stale) throw new ApiError(409, "conflict", "This proposal is stale");
        Object.assign(p, {
          status: "accepted",
          after: text ?? p.after,
          decidedBy: { userId: state.me?.user.id ?? "", name: state.me?.user.name ?? "" },
          decidedAt: new Date().toISOString(),
          canDecide: false,
        });
        return structuredClone(p);
      },
      ask: async (orgId, id) => {
        log("proposals.ask", orgId, id);
        const p = findProposal(id);
        Object.assign(p, { askedAt: new Date().toISOString() });
        return structuredClone(p);
      },
      refuse: async (orgId, id) => {
        log("proposals.refuse", orgId, id);
        const p = findProposal(id);
        Object.assign(p, {
          status: "refused",
          decidedBy: { userId: state.me?.user.id ?? "", name: state.me?.user.name ?? "" },
          decidedAt: new Date().toISOString(),
          canDecide: false,
        });
        return structuredClone(p);
      },
    },
    actions: {
      undo: async (orgId, actionId) => {
        log("actions.undo", orgId, actionId);
        const a = findAction(actionId);
        if (state.actionErrors?.[actionId]) throw state.actionErrors[actionId];
        if (a.undoneAt) throw new ApiError(409, "action.already_undone", "Already undone");
        Object.assign(a, {
          undoneAt: new Date().toISOString(),
          undoneByUserId: state.me?.user.id ?? null,
          undoableUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
        return structuredClone(a);
      },
      redo: async (orgId, actionId) => {
        log("actions.redo", orgId, actionId);
        const a = findAction(actionId);
        if (state.actionErrors?.[actionId]) throw state.actionErrors[actionId];
        if (!a.undoneAt) throw new ApiError(409, "action.not_undone", "Not undone");
        Object.assign(a, {
          undoneAt: null,
          undoneByUserId: null,
          redoneAt: new Date().toISOString(),
          undoableUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
        return structuredClone(a);
      },
      undoMessage: async (orgId, messageId) => {
        log("actions.undoMessage", orgId, messageId);
        const m = state.messages.find((x) => x.id === messageId);
        if (!m) throw new ApiError(404, "not_found", "Message not found");
        const failed: { id: string; code: string; message: string }[] = [];
        const now = Date.now();
        for (const a of [...(m.actions ?? [])].reverse()) {
          if (a.undoneAt || Date.parse(a.undoableUntil) <= now) continue;
          const error = state.actionErrors?.[a.id];
          if (error) {
            failed.push({ id: a.id, code: error.code, message: error.message });
            continue;
          }
          Object.assign(a, {
            undoneAt: new Date().toISOString(),
            undoneByUserId: state.me?.user.id ?? null,
            undoableUntil: new Date(now + 5 * 60_000).toISOString(),
          });
        }
        return { actions: structuredClone(m.actions ?? []), failed };
      },
    },
    repositories: {
      get: async (_orgId, agentId) => structuredClone(state.agentRepos?.[agentId] ?? []),
      set: async (orgId, agentId, repositories) => {
        log("repositories.set", orgId, agentId, repositories);
        state.agentRepos = { ...(state.agentRepos ?? {}), [agentId]: [...repositories] };
        return structuredClone(repositories);
      },
      merge: async (_orgId, agentId) => structuredClone(state.agentMergeRepos?.[agentId] ?? []),
      setMerge: async (orgId, agentId, repositories) => {
        log("repositories.setMerge", orgId, agentId, repositories);
        state.agentMergeRepos = { ...(state.agentMergeRepos ?? {}), [agentId]: [...repositories] };
        return structuredClone(repositories);
      },
    },
    scopes: {
      get: async (_orgId, agentId) => structuredClone(state.scopes[agentId] ?? []),
      set: async (orgId, agentId, grants) => {
        log("scopes.set", orgId, agentId, grants);
        state.scopes[agentId] = grants;
        return grants;
      },
    },
  };

  function patchMemory(
    orgId: string,
    id: string,
    patch: { text?: string; pinned?: boolean; archived?: boolean; confirmed?: boolean },
  ) {
    log("memory.patch", orgId, id, patch);
    const m = state.memories.find((x) => x.id === id);
    if (!m) throw new ApiError(404, "not_found", "Memory not found");
    if (patch.text !== undefined && patch.text !== m.text) {
      m.supersedes = m.text;
      m.text = patch.text;
      m.editedByUserId = state.me?.user.id ?? null;
      m.verified = true;
    }
    if (patch.pinned !== undefined) m.pinned = patch.pinned;
    if (patch.archived !== undefined) m.archived = patch.archived;
    if (patch.confirmed) {
      m.lowTrust = false;
      m.verified = true;
    }
    m.updatedAt = new Date().toISOString();
    return Promise.resolve(structuredClone(m));
  }

  function findAction(actionId: string) {
    for (const m of state.messages) {
      const a = m.actions?.find((x) => x.id === actionId);
      if (a) return a;
    }
    throw new ApiError(404, "action.not_found", "Action not found");
  }

  function findProposal(id: string) {
    const p = state.proposals.find((x) => x.id === id);
    if (!p) throw new ApiError(404, "not_found", "Proposal not found");
    return p;
  }

  /**
   * An agent's proposal of a new agent: its card message (`meta.actionCard`), changed in place like the server's,
   * for whoever is in its conversation.
   */
  function proposalCard(messageId: string) {
    const message = state.messages.find((m) => m.id === messageId);
    const card = message?.meta?.actionCard as AgentProposalCard | undefined;
    if (!message || card?.kind !== "agent_proposal") throw new ApiError(404, "not_found", "Proposal not found");
    const inDm = state.dms.some((d) => d.channelId === message.channelId);
    if (!inDm && !state.channels.find((c) => c.id === message.channelId)?.isMember) {
      throw new ApiError(403, "forbidden", "Join this channel first");
    }
    return { message, card };
  }

  function proposalView(messageId: string): AgentProposal {
    const { message, card } = proposalCard(messageId);
    const expired = card.state === "pending" && Date.parse(card.expiresAt) <= Date.now();
    // Who may create agents decides (ADR 0085).
    const mine = state.me ? withPermissions(state.me).organizations[0]?.permissions : undefined;
    const decides = mine?.includes("create_agents") === true;
    return {
      ...structuredClone(card),
      messageId,
      channelId: message.channelId,
      threadId: message.threadId,
      proposedByAgentId: message.author.id ?? "",
      expired,
      canDecide: card.state === "pending" && !expired && decides,
    };
  }

  function decide(orgId: string, approvalId: string, status: "approved" | "refused", reason?: string, always?: true) {
    log(
      `approvals.${status === "approved" ? "approve" : "refuse"}`,
      orgId,
      approvalId,
      reason,
      ...(always ? [always] : []),
    );
    const a = state.approvals.find((x) => x.id === approvalId);
    if (!a) throw new ApiError(404, "not_found", "Approval not found");
    if (a.status !== "pending") throw new ApiError(409, "conflict", "Already decided");
    Object.assign(a, {
      status,
      decidedByUserId: state.me?.user.id ?? null,
      decidedAt: new Date().toISOString(),
      reason: reason ?? null,
      canDecide: false,
    });
    return Promise.resolve({ ...a });
  }
}

function newInvitation(email: string, role: Role, roleIds: string[] = []): InvitationWithStatus {
  return {
    id: id("inv"),
    email,
    role,
    roleIds,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/** The connected-computers fake behind each `createFakeApi` client (tests pair machines with it). */
export const fakeMachinesOf = new WeakMap<ApiClient, FakeMachines>();
/** The devices fake behind each client (tests set the list and move a connect link on with it). */
export const fakeDevicesOf = new WeakMap<ApiClient, FakeDevices>();

/** The mailboxes fake behind each `createFakeApi` client (tests add mailboxes and failures with it). */
export const fakeMailOf = new WeakMap<ApiClient, FakeMail>();

/** The databases fake behind each `createFakeApi` client (tests add failures and tables with it). */
export const fakeDatabasesOf = new WeakMap<ApiClient, FakeDatabases>();

/** The agent browser fake behind each `createFakeApi` client (tests add settings and handoffs with it). */
export const fakeBrowserOf = new WeakMap<ApiClient, FakeBrowser>();

/** The AI apps fake behind each `createFakeApi` client (tests add consents and connect apps with it). */
export const fakeAppsOf = new WeakMap<ApiClient, FakeApps>();

/** The boards and widgets fake behind each `createFakeApi` client (tests add boards and finish widgets with it). */
export const fakeDashboardsOf = new WeakMap<ApiClient, FakeDashboards>();

/** Full client: fake HTTP + the real in-memory mocks (seeded like development). */
export function createFakeApi(state: FakeState = seedState(), options: { seed?: boolean } = {}): ApiClient {
  const http = createFakeHttpApi(state);
  const ctx: MockContext = {
    seed: options.seed ?? true,
    now: () => new Date(),
    lookup: {
      me: () => http.account.me(),
      agents: (orgId) => http.agents.list(orgId),
      channels: (orgId) => http.chat.channels(orgId),
      members: (orgId) => http.orgs.members(orgId),
      messages: async () => state.messages,
      dms: async () => state.dms,
    },
  };
  const threads = createFakeThreads(ctx, (method, ...args) => state.calls.push({ method, args }));
  state.openThread = threads.openByReply;
  const machines = createFakeMachines(ctx, (method, ...args) => state.calls.push({ method, args }));
  const devices = createFakeDevices(
    (method, ...args) => state.calls.push({ method, args }),
    ctx.now,
    () => machines.all(),
    (orgId, id) => machines.client.remove(orgId, id),
  );
  const agentIds = async (orgId: string) => (await http.agents.list(orgId)).map((a) => a.id);
  const customConnectors = createMockCustomConnectors(
    ctx,
    (method, ...args) => state.calls.push({ method, args }),
    async (orgId, serverId) => access.connected(serverId, await agentIds(orgId)),
  );
  const access = createFakeAccess(
    (orgId) => http.connectors.list(orgId),
    (method, ...args) => state.calls.push({ method, args }),
    (orgId) => customConnectors.list(orgId),
  );
  const mail = createFakeMail(
    (method, ...args) => state.calls.push({ method, args }),
    ctx.now,
    () => state.me?.user.id ?? null,
  );
  const databases = createFakeDatabases((method, ...args) => state.calls.push({ method, args }), ctx.now);
  const dashboards = createFakeDashboards(
    (method, ...args) => state.calls.push({ method, args }),
    ctx.now,
    () => state.me?.user.id ?? null,
    (agentId) => state.agents.find((a) => a.id === agentId)?.name ?? "",
  );
  const browser = createFakeBrowser((method, ...args) => state.calls.push({ method, args }), ctx.now);
  const apps = createFakeApps((method, ...args) => state.calls.push({ method, args }), ctx.now);
  const artifacts = createMockArtifacts(ctx, (method, ...args) => state.calls.push({ method, args }));
  state.drive = artifacts;
  const client: ApiClient = {
    ...http,
    apps: apps.client,
    sandbox: createFakeSandbox(ctx, (method, ...args) => state.calls.push({ method, args }), machines),
    machines: machines.client,
    devices: devices.client,
    notifications: createFakeNotifications(
      {
        get items() {
          state.notifications ??= [];
          return state.notifications;
        },
      },
      (method, ...args) => state.calls.push({ method, args }),
    ),
    wiki: createFakeWiki(ctx, (method, ...args) => state.calls.push({ method, args })),
    threads,
    missions: createFakeMissions(ctx, (method, ...args) => state.calls.push({ method, args })),
    skills: createFakeSkills(
      ctx,
      (method, ...args) => state.calls.push({ method, args }),
      () => {
        const github = state.connections.find((c) => c.connector === "github" && !c.revokedAt);
        return !github ? "none" : github.id === state.refusedGithub ? "refused" : "ok";
      },
    ),
    access,
    connectors: {
      ...http.connectors,
      // Any kind: a server's account or a catalog connection. Names are unique in the workspace.
      rename: async (orgId, connectionId, label) => {
        const name = label.trim();
        const all = [...(await http.connectors.list(orgId)), ...(await customConnectors.list(orgId))];
        if (all.some((c) => c.id !== connectionId && c.label.toLowerCase() === name.toLowerCase())) {
          state.calls.push({ method: "connectors.rename", args: [orgId, connectionId, name] });
          throw new ApiError(409, "connector.label_taken", "Another connector already has this name");
        }
        const server = customConnectors.rename(orgId, connectionId, name);
        if (!server) return http.connectors.rename(orgId, connectionId, name);
        state.calls.push({ method: "connectors.rename", args: [orgId, connectionId, name] });
        return {
          id: server.id,
          connector: `custom:${server.id}`,
          label: server.label,
          serverUrl: server.serverUrl,
          authType: server.authType,
          accountLabel: server.accountLabel ?? null,
          tokenExpiresAt: null,
          createdAt: server.createdAt,
          revokedAt: null,
        };
      },
      // A first connection of a connector is every agent's (a new key for it keeps their grants).
      connectWithKey: async (orgId, input) => {
        const first = !(await http.connectors.list(orgId)).some((c) => c.connector === input.connector);
        const connection = await http.connectors.connectWithKey(orgId, input);
        if (first) access.connected(connection.id, await agentIds(orgId));
        return connection;
      },
    },
    invites: {
      // The workspace's link every time, like the server: a new one only when none can be shown. With choices
      // (ADR 0184) a link of its own; at the defaults the workspace's, renewed to 30 days.
      createLink: async (orgId, choices) => {
        state.calls.push({ method: "invites.createLink", args: choices ? [orgId, choices] : [orgId] });
        if (state.createLinkError) throw state.createLinkError;
        state.inviteLinks ??= [];
        const plain =
          !choices ||
          (!choices.roleIds?.length &&
            !choices.channelIds?.length &&
            !choices.agentIds?.length &&
            (choices.maxUses ?? null) === null &&
            (choices.expiresIn ?? "30d") === "30d");
        if (!plain && choices) {
          const id = `link-${state.inviteLinks.length + 1}`;
          const ttl = {
            "30m": 30 * 60_000,
            "1h": 3_600_000,
            "1d": 86_400_000,
            "7d": 7 * 86_400_000,
            "30d": 30 * 86_400_000,
          };
          const never = choices.expiresIn === "never";
          const made = {
            id,
            url: `http://localhost:3000/invite/${id}`,
            expiresAt: never
              ? "9999-12-31T00:00:00.000Z"
              : new Date(Date.now() + ttl[(choices.expiresIn ?? "30d") as keyof typeof ttl]).toISOString(),
            ...(never ? { neverExpires: true as const } : {}),
            createdAt: new Date().toISOString(),
            createdBy: "Walter",
            createdByUserId: "u-walter",
            waiting: 0,
            plain: false,
            roleIds: choices.roleIds ?? [],
            channelIds: choices.channelIds ?? [],
            agentIds: choices.agentIds ?? [],
            maxUses: choices.maxUses ?? null,
            uses: 0,
          };
          state.inviteLinks.unshift(made);
          return { id, url: made.url, expiresAt: made.expiresAt, ...(never ? { neverExpires: true as const } : {}) };
        }
        let link = state.inviteLinks.find((l) => l.url !== null && l.plain !== false);
        if (link && choices) link.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
        if (!link) {
          const id = `link-${state.inviteLinks.length + 1}`;
          link = {
            id,
            url: `http://localhost:3000/invite/${id}`,
            expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: "Walter",
            waiting: 0,
          };
          state.inviteLinks.unshift(link);
        }
        return { id: link.id, url: link.url ?? "", expiresAt: link.expiresAt };
      },
      editLink: async (orgId, linkId, choices) => {
        state.calls.push({ method: "invites.editLink", args: [orgId, linkId, choices] });
        const link = state.inviteLinks?.find((l) => l.id === linkId);
        if (!link) throw new ApiError(404, "not_found", "Invitation link not found");
        Object.assign(link, choices, { plain: false });
        return { id: link.id, url: link.url ?? "", expiresAt: link.expiresAt, ...choices };
      },
      links: async (orgId) => {
        state.calls.push({ method: "invites.links", args: [orgId] });
        return structuredClone(state.inviteLinks ?? []);
      },
      turnOff: async (orgId, linkId) => {
        state.calls.push({ method: "invites.turnOff", args: [orgId, linkId] });
        state.inviteLinks = (state.inviteLinks ?? []).filter((l) => l.id !== linkId);
      },
      renewLink: async (orgId, linkId) => {
        state.calls.push({ method: "invites.renewLink", args: [orgId, linkId] });
        const link = state.inviteLinks?.find((l) => l.id === linkId);
        const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
        if (link) link.expiresAt = expiresAt;
        return { expiresAt };
      },
      sendCode: async (token, input, humanCheck) => {
        state.calls.push({
          method: "invites.sendCode",
          args: humanCheck === undefined ? [token, input] : [token, input, humanCheck],
        });
        if (state.sendCodeError) throw state.sendCodeError;
        return { email: (input.email ?? state.me?.user.email ?? "").toLowerCase(), resendIn: 60 };
      },
      checkCode: async (token, input) => {
        state.calls.push({ method: "invites.checkCode", args: [token, input] });
        if (input.code !== (state.joinCode ?? "123456"))
          throw new ApiError(400, "join.code_wrong", "That code isn't right.");
        return { verified: true };
      },
      ask: async (token, input) => {
        state.calls.push({ method: "invites.ask", args: [token, input] });
        if (state.askError) throw state.askError;
        return {
          status: "pending",
          email: (input.email ?? state.me?.user.email ?? "").toLowerCase(),
          emailed: true,
          // With a password the server answers the page's key (ADR 0090).
          ...(input.password ? { key: "00000000-0000-4000-8000-000000000001.page-secret" } : {}),
        };
      },
      claim: async (token, key) => {
        state.calls.push({ method: "invites.claim", args: [token, key] });
        const claims = state.claims ?? [];
        return claims.length > 1 ? (claims.shift() ?? null) : (claims[0] ?? null);
      },
      requestNew: async (token) => {
        state.calls.push({ method: "invites.requestNew", args: [token] });
        if (state.requestNewError) throw state.requestNewError;
      },
    },
    joinRequests: {
      list: async (orgId) => {
        state.calls.push({ method: "joinRequests.list", args: [orgId] });
        return structuredClone(state.joinRequests ?? []);
      },
      approve: async (orgId, requestId, roleIds) => {
        state.calls.push({ method: "joinRequests.approve", args: [orgId, requestId, roleIds] });
        if (state.answerError) throw state.answerError;
        const request = state.joinRequests?.find((r) => r.id === requestId);
        state.joinRequests = state.joinRequests?.filter((r) => r.id !== requestId);
        if (request?.confirmed && !state.approval)
          state.members.push({
            userId: `u-${requestId}`,
            name: request.name,
            email: request.email,
            image: null,
            role: "member",
            roleIds: roleIds ?? [],
            joinedAt: new Date().toISOString(),
            handle: requestId,
            timezone: "America/Sao_Paulo",
          });
        return (
          state.approval ??
          (request?.confirmed
            ? { outcome: "joined" }
            : { outcome: "invited", url: `http://localhost:3000/invite/tok-${requestId}`, emailed: true })
        );
      },
      deny: async (orgId, requestId, reason) => {
        state.calls.push({ method: "joinRequests.deny", args: [orgId, requestId, reason] });
        if (state.answerError) throw state.answerError;
        state.joinRequests = state.joinRequests?.filter((r) => r.id !== requestId);
      },
      suggest: async (orgId, input) => {
        state.calls.push({ method: "joinRequests.suggest", args: [orgId, input] });
        if (state.suggestError) throw state.suggestError;
        const id = `sug-${(state.suggestions?.length ?? 0) + 1}`;
        state.suggestions = [
          { id, email: input.email.toLowerCase(), note: input.note ?? null, createdAt: new Date().toISOString() },
          ...(state.suggestions ?? []),
        ];
        return { id };
      },
      mine: async (orgId) => {
        state.calls.push({ method: "joinRequests.mine", args: [orgId] });
        return structuredClone(state.suggestions ?? []);
      },
      cancel: async (orgId, requestId) => {
        state.calls.push({ method: "joinRequests.cancel", args: [orgId, requestId] });
        state.suggestions = state.suggestions?.filter((s) => s.id !== requestId);
      },
    },
    storage: createMockStorage(
      () => state.storagePlatform,
      () => state.storageUsage,
    ),
    artifacts,
    ...createMockPlanning(ctx, (method, ...args) => state.calls.push({ method, args })),
    customConnectors,
    mail: mail.client,
    databases: databases.client,
    dashboards: dashboards.client,
    browser: browser.client,
    desktop: browser.desktop,
    // "Trabalhando agora" and the task manager only for a test that gives the task manager (`state.taskManager`).
    ...(state.taskManager
      ? {
          working: {
            list: async () => [],
            taskManager: async (orgId: string, since?: string) => {
              state.calls.push({ method: "working.taskManager", args: [orgId, since] });
              return structuredClone(state.taskManager as TaskManagerView);
            },
            taskSteps: async (orgId: string, runId: string) => {
              state.calls.push({ method: "working.taskSteps", args: [orgId, runId] });
              const createdAt = state.taskManager?.tasks.find((x) => x.runId === runId)?.createdAt ?? NOW.toISOString();
              return structuredClone(state.taskSteps?.[runId] ?? { run: { createdAt, finishedAt: null }, steps: [] });
            },
            continueTasks: async (orgId: string, runIds: string[]) => {
              state.calls.push({ method: "working.continueTasks", args: [orgId, runIds] });
              for (const task of state.taskManager?.tasks ?? [])
                if (runIds.includes(task.runId)) Object.assign(task, { status: "running", held: null, wait: null });
              return { continued: runIds.length };
            },
          },
        }
      : {}),
  };
  // As the server's: the usage views list every account on a computer, so what `setAiAccounts` set is there too, each
  // the viewer's own with its address, after the computer's own sign-in.
  const seededPlans = client.orgs.planUsage;
  client.orgs.planUsage = async (...args) => {
    const usage = await seededPlans(...args);
    const { accounts } = await client.machines.aiAccounts(...args);
    return {
      ...usage,
      accounts: [
        ...usage.accounts,
        ...accounts.map((a) => ({
          key: `${a.machineId}:${a.kind}:${a.id}`,
          machineId: a.machineId,
          machineName: a.computer,
          kind: a.kind,
          accountId: a.id,
          label: a.label,
          plan: a.plan,
          provider: a.provider,
          ownerName: a.ownerName,
          mine: a.mine,
          email: a.email,
          signedOut: a.status === "signed_out",
          ...(a.serves ? { serves: a.serves } : {}),
          usage: a.usage && { ...a.usage, windows: a.usage.windows.map((w) => ({ ...w, agents: [] })) },
          agents: a.usedBy.map((name) => ({
            agentId: state.agents.find((x) => x.name === name)?.id ?? name,
            name,
            tokens: 0,
            now: true,
          })),
          monthTokens: 0,
        })),
      ],
    };
  };
  fakeMachinesOf.set(client, machines);
  fakeDevicesOf.set(client, devices);
  fakeMailOf.set(client, mail);
  fakeDatabasesOf.set(client, databases);
  fakeDashboardsOf.set(client, dashboards);
  fakeBrowserOf.set(client, browser);
  fakeAppsOf.set(client, apps);
  return client;
}

/** The brain view the fake starts every agent with (tests may replace `api.agents.brain`). */
export function fakeAgentBrain(agentId: string, patch: Partial<AgentBrain> = {}): AgentBrain {
  const brain: AgentBrain = {
    agentId,
    brain: "model",
    model: null,
    effectiveModel: null,
    fallback: true,
    extraUsage: true,
    computer: { machineId: "machine_1", name: "MacBook", online: true },
    options: [
      { kind: "model", available: true, models: [], defaultModel: null },
      {
        kind: "claude_code",
        available: true,
        models: [
          { value: "opus", label: "Opus", modelId: "claude-opus-5-5" },
          { value: "sonnet", label: "Sonnet", modelId: "claude-sonnet-5-5", recommended: true },
          { value: "haiku", label: "Haiku", modelId: "claude-haiku-5-5" },
        ],
        defaultModel: "sonnet",
      },
      {
        kind: "codex",
        available: true,
        models: [
          { value: "gpt-6-sol", label: "GPT-6 Sol", modelId: "gpt-6-sol", recommended: true },
          { value: "gpt-6-luna", label: "GPT-6 Luna", modelId: "gpt-6-luna" },
        ],
        defaultModel: "gpt-6-sol",
      },
    ],
    machines: [],
    canEdit: true,
    account: null,
    effort: null,
    speed: "standard",
    accounts: [],
    canManageAccounts: true,
    accountsSupported: true,
    onlyOwner: false,
    canUsePlans: true,
    ownSignIn: true,
    ownUsage: {},
    ...patch,
  };
  // The computers the person may give the agent: the MacBook, with what it offers.
  if (patch.machines) return brain;
  const computer = brain.computer ?? { machineId: "machine_1", name: "MacBook", online: true };
  return { ...brain, machines: [{ ...computer, options: brain.options }] };
}

/** The right hand's approvals as a member who never turned them on reads them. */
export function rightHandOff(state: FakeState): RightHandApprovals {
  const lodi = state.agents.find((a) => a.builtin === "right_hand");
  return {
    enabled: false,
    newAgents: true,
    agentChanges: true,
    budgetCapNanoUsd: 20_000_000_000,
    guidance: "",
    pausedAt: null,
    rightHand: lodi ? { id: lodi.id, name: lodi.name } : null,
    mayDecide: { newAgents: true, agentChanges: true },
    caps: { decisionsPerDay: 10, newAgentsPerDay: 2, monthNanoUsd: 50_000_000_000 },
    used: { decisionsToday: 0, newAgentsToday: 0, monthNanoUsd: 0 },
  };
}
