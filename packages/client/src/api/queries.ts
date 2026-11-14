import {
  type InfiniteData,
  mutationOptions,
  type QueryClient,
  queryOptions,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moveInGroups } from "../lib/agent-groups";
import { artifactRefs } from "../lib/artifacts";
import { newerBlockState, stateChanges, stateForPage } from "../lib/blocks";
import type { ChatPrefs } from "../lib/chat-look";
import type { ChoiceAnswer } from "../lib/choices";
import { newerSetup } from "../lib/computer";
import { CONSULT_CONVERSATION_POLL_MS, CONSULT_GROUP_POLL_MS, exchangeIds } from "../lib/consult-group";
import { forPeople } from "../lib/consultations";
import {
  PHONE_LOOK_MS,
  WIFI_IPHONES_POLL_MS,
  WIFI_PAIR_POLL_MS,
  wifiPairLive,
  XCODE_FIX_POLL_MS,
  xcodeFixLive,
} from "../lib/devices";
import { answerWithin, noAnswer, sendFailureOf, sendWaits } from "../lib/errors";
import { ISSUES_VIEW_DEFAULT, type IssuesViewChange, withIssuesView } from "../lib/issues-view";
import { CLI_INSTALL_POLL_MS, LoginReadError, loginReadPasses } from "../lib/machines";
import { GIF_PAGE, isMediaAfterReply, messageMediaOf, postedMedia } from "../lib/media";
import {
  allItems,
  matchesFilter,
  type NotificationPages,
  type ReplyTarget,
  removeFromPages,
  upsertInPages,
  withServerCounts,
} from "../lib/notifications";
import { workspaceUsesApi } from "../lib/plan-usage";
import { learnPlanModels } from "../lib/plans";
import { setMyReaction } from "../lib/reactions";
import { recentConversations } from "../lib/recent";
import { replyOf } from "../lib/reply";
import { firstVisitOf, teamAnswered } from "../lib/right-hand";
import { type LodiPrefs, type LodiPrefsPatch, legacyPatch } from "../lib/right-hand-prefs";
import { usagePauseRefetchMs } from "../lib/routine-view";
import { withRead } from "../lib/seen";
import {
  knownToolOrder,
  sidebarDefaults,
  sidebarItemOrder,
  sidebarSections,
  withSidebarPlace,
} from "../lib/sidebar-items";
import { repinAgent, SIDEBAR_VIEW_DEFAULT, unpinAgents } from "../lib/sidebar-view";
import { playSound } from "../lib/sounds";
import type { TeamWeekAct } from "../lib/team-week";
import { threadStartOf } from "../lib/threads";
import { upsertMessage, withLocalCopies } from "../lib/timeline";
import { voiceOf } from "../lib/voice";
import type { AudienceChoice } from "../lib/who-sees";
import type { WikiAccess } from "../lib/wiki";
import type { RealtimeConnection } from "../realtime/connection";
import { readUnknownMembers, setOrgDeletion } from "../realtime/machines";
import type { ApiClient } from "./client";
import { type AgentReactionEffect, useAgentReaction, useApi, useCardVia } from "./context";
import { ApiError, type UploadOptions } from "./http";
import { keys } from "./keys";
import { keepSending, outbox } from "./outbox";
import type {
  AdminAsk,
  Agent,
  AgentAction,
  AgentAudience,
  AgentComputer,
  AgentDatabase,
  AgentDatabaseInput,
  AgentGroup,
  AgentGroupPatch,
  AgentInput,
  AgentLineChange,
  AgentMailbox,
  AgentMailboxInput,
  AgentProposalDecision,
  AgentSetup,
  AgentStyle,
  AiStatus,
  ApiRule,
  AppConsentDecision,
  AppNotification,
  Approval,
  ApprovalCoverInput,
  ArtifactContent,
  ArtifactDetail,
  ArtifactFilters,
  AuditPage,
  AuditQuery,
  AuditRow,
  BlockState,
  BrainScope,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarProposal,
  CardDelegate,
  Channel,
  ChannelEvent,
  ChannelInput,
  ChannelOverride,
  ComputerSetup,
  DatabaseActionName,
  DatabaseConnectionInput,
  DeletionProofInput,
  DirectMessage,
  DmRead,
  DmTarget,
  EndpointModel,
  ForeignMailbox,
  GifCategory,
  GifKey,
  InstallableCli,
  InviteBatch,
  InviteLinkChoices,
  Issue,
  IssueActivity,
  IssueActivityEvent,
  IssueColumn,
  IssueInput,
  IssuePatch,
  IssueProjectRef,
  IssueStatus,
  IssuesView,
  JevKey,
  Machine,
  MachineAccessReduce,
  MachineTool,
  MailAccountUpdate,
  MailImapInput,
  Me,
  Message,
  MoveAgentsInput,
  NoticeCategory,
  NoticePrefs,
  NotificationCount,
  NotificationEvent,
  NotificationFilter,
  OrgRoles,
  PendingReturn,
  Person,
  PersonalTokenInput,
  PersonLimits,
  Proposal,
  ReactionCount,
  ReminderInput,
  RightHandApprovals,
  RightHandApprovalsInput,
  Role,
  RoleInput,
  Routine,
  RoutineHook,
  RoutineInput,
  RoutinePatch,
  RowHolders,
  S3Input,
  SandboxSettingsInput,
  SearchFilterInput,
  SearchKind,
  SeriesScope,
  SetupStep,
  SidebarItem,
  SidebarItems,
  SidebarPlace,
  SidebarSection,
  SidebarView,
  SkillInput,
  SkillPatch,
  SkillSettings,
  SpeechKey,
  SpeechKeyInput,
  StartChoice,
  StatusInput,
  StorageMigration,
  TaskManagerView,
  TeamProposalCard,
  ThreadAction,
  ThreadCreateInput,
  ThreadFilters,
  ThreadInfo,
  ThreadPage,
  ThreadPatch,
  ToolDecision,
  UnreadEvent,
  WebhookProvider,
  WebhookSetup,
  WifiPairing,
  WikiBulkFailed,
  WikiBulkTarget,
  WikiPage,
  WikiPageInput,
  WikiUpdateInput,
  WorkspaceActionCard,
  WorkspaceActionCardView,
  WorkView,
} from "./types";
import { WORKSPACE_ACTION_IDS } from "./types";

/**
 * React Query hooks over the `ApiClient`. Reads are cached per organization;
 * writes invalidate what they change. Mutation errors become toasts in
 * `createQueryClient` (src/app/query-client.ts).
 */

// ── Shared query options (also used by route guards) ─────────────────────────

/**
 * The lists of who and where. Back to a tab, what went stale is read at once: the socket may have stayed up while
 * events never reached it (a sleeping tab), so no reconnect would catch it up.
 */
const BACK_TO_TAB = { refetchOnWindowFocus: true } as const;

export const meQuery = (api: ApiClient) =>
  // Kept for good: the device snapshot (`snapshot.ts`) is dropped when `me` leaves the cache.
  queryOptions({
    queryKey: keys.me,
    queryFn: () => api.account.me(),
    staleTime: 30_000,
    gcTime: Number.POSITIVE_INFINITY,
  });
export const authConfigQuery = (api: ApiClient) =>
  queryOptions({ queryKey: keys.authConfig, queryFn: () => api.account.authConfig(), staleTime: 60_000 });
export const instanceQuery = (api: ApiClient) =>
  queryOptions({ queryKey: keys.instance, queryFn: () => api.system.instance(), staleTime: 60_000 });
export const channelsQuery = (api: ApiClient, orgId: string) =>
  queryOptions({
    queryKey: keys.channels(orgId),
    queryFn: () => api.chat.channels(orgId),
    staleTime: 30_000,
    ...BACK_TO_TAB,
  });
/**
 * An invitation's preview (its page, and the sign-in that leads to it). One that got no answer is asked twice more:
 * the server may be restarting, and it's no expired link.
 */
export const invitationQuery = (api: ApiClient, token: string) =>
  queryOptions({
    queryKey: keys.invitation(token),
    queryFn: () => api.orgs.previewInvitation(token),
    retry: (count, error) => count < 2 && noAnswer(error),
  });
/** An email invitation that no longer opens: accepted or expired (ADR 0090). */
export const invitationStateQuery = (api: ApiClient, token: string) =>
  queryOptions({
    queryKey: keys.invitationState(token),
    queryFn: () => api.orgs.invitationState(token),
    retry: false,
  });

// ── Account ─────────────────────────────────────────────────────────────────

export const useMe = () => useQuery(meQuery(useApi()));
export const useAuthConfig = () => useQuery(authConfigQuery(useApi()));
export const useHealth = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.health, queryFn: () => api.system.health(), staleTime: 5 * 60_000 });
};

/** The usage report's switch: `null` for everyone but the installation's owner. */
export const useServerTelemetry = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.telemetry, queryFn: () => api.system.telemetry() });
};

export function useSetServerTelemetry() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.system.setTelemetry(enabled),
    onSuccess: (telemetry) => qc.setQueryData(keys.telemetry, telemetry),
  });
}

/** The installation's Jev key: `null` for everyone but its owner on a self-hosted server. */
export const useJevKey = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.jev, queryFn: () => api.system.jev() });
};

function useJevChange<T>(change: (api: ApiClient, input: T) => Promise<JevKey>, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => change(api, input),
    onSuccess: (jev) => {
      qc.setQueryData(keys.jev, jev);
      // The key is the server's: who picks the agents may change in every workspace.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[3] === "ai-status" });
    },
    // A refused key is said under its field.
    ...(silent ? { meta: { silent: true } } : {}),
  });
}
export const useSaveJevKey = () => useJevChange((api, apiKey: string) => api.system.saveJev(apiKey), true);
export const useCheckJevKey = () => useJevChange<void>((api) => api.system.checkJev());
export const useRemoveJevKey = () => useJevChange<void>((api) => api.system.removeJev());

/** The installation's GIPHY key (ADR 0091): `null` for everyone but its owner on a self-hosted server. */
export const useGifKey = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.gifKey, queryFn: () => api.system.gifKey() });
};

function useGifKeyChange<T>(change: (api: ApiClient, input: T) => Promise<GifKey>, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => change(api, input),
    onSuccess: (gifKey) => {
      qc.setQueryData(keys.gifKey, gifKey);
      // The key is the server's: every workspace's GIFs come and go with it (`gifsAvailable`, the picker's tab).
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "org" && (q.queryKey[2] === "settings" || q.queryKey[2] === "gifs"),
      });
    },
    // A refused key is said under its field.
    ...(silent ? { meta: { silent: true } } : {}),
  });
}
export const useSaveGifKey = () => useGifKeyChange((api, apiKey: string) => api.system.saveGifKey(apiKey), true);
export const useRemoveGifKey = () => useGifKeyChange<void>((api) => api.system.removeGifKey());

/** The installation's speech engine (ADR 0100): `null` for everyone but its owner on a self-hosted server. */
export const useSpeechKey = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.speechKey, queryFn: () => api.system.speechKey() });
};

function useSpeechKeyChange<T>(change: (api: ApiClient, input: T) => Promise<SpeechKey>, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => change(api, input),
    onSuccess: (speechKey) => {
      qc.setQueryData(keys.speechKey, speechKey);
      // The engine is the server's: every workspace's microphone comes and goes with it (`voiceAvailable`).
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "org" && q.queryKey[2] === "settings" });
    },
    // A refused key is said under its field.
    ...(silent ? { meta: { silent: true } } : {}),
  });
}
export const useSaveSpeechKey = () =>
  useSpeechKeyChange((api, input: SpeechKeyInput) => api.system.saveSpeechKey(input), true);
export const useRemoveSpeechKey = () => useSpeechKeyChange<void>((api) => api.system.removeSpeechKey());

/**
 * The server's Web Push key (ADR 0071): `null` when this server has Web Push off. Asked only where this
 * browser could take pushes (`enabled`); the key changes only when the server's does.
 */
export const useWebPushKey = (enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.webPushKey, queryFn: () => api.push.webKey(), enabled, staleTime: 60 * 60_000 });
};

export function useCreateOrganization() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; context?: string }) => api.orgs.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/** How often `useClosingMe` asks `GET /me` again: no event says that a deletion was undone. */
export const CLOSING_POLL_MS = 30_000;

/**
 * `GET /me` while a workspace's line on top, or an account's screen, says it is being deleted: every 30 s and whenever
 * the app comes back to the front, so a restore shows at once and a deletion done drops it from the list.
 */
export const useClosingMe = () =>
  useQuery({ ...meQuery(useApi()), refetchInterval: CLOSING_POLL_MS, refetchOnWindowFocus: "always" });

/** Brings my account back; `GET /me` then opens its workspaces again. */
export function useRestoreAccount() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.account.restore(),
    onSuccess: () => qc.refetchQueries({ queryKey: keys.me }),
  });
}

/** What deleting my account would do (`GET /account/deletion`): asked anew each time. */
export const useAccountDeletionPlan = (enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.accountDeletion,
    queryFn: () => api.account.deletionPlan(),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
};

/**
 * Deletes the workspace (owners), with the proof that it's them (the emailed code, or the password). Its line on top
 * shows here at once, and through `org.deleting` everywhere else. The dialog says its refusals.
 */
export function useDeleteWorkspace(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proof: DeletionProofInput) => api.orgs.deleteWorkspace(orgId, proof),
    meta: { silent: true },
    onSuccess: ({ dueAt }) => {
      const me = qc.getQueryData<Me | null>(keys.me);
      setOrgDeletion(qc, orgId, {
        dueAt,
        requestedAt: new Date().toISOString(),
        requestedBy: me ? { id: me.user.id, name: me.user.name } : null,
      });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Restores a workspace being deleted (owners): it opens again for everyone. */
export function useRestoreWorkspace(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.orgs.restore(orgId),
    onSuccess: () => {
      setOrgDeletion(qc, orgId, null);
      // An unfinished one resumes its onboarding: `GET /me` says so again.
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useUpdateOrganization(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; context?: string }) => api.orgs.update(orgId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.org(orgId) });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

// ── Organization ────────────────────────────────────────────────────────────

export const useOrganization = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: [...keys.org(orgId), "detail"], queryFn: () => api.orgs.get(orgId) });
};

export const useMembers = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: () => api.orgs.members(orgId),
    staleTime: 30_000,
    ...BACK_TO_TAB,
  });
};

export function useChangeRole(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const via = useCardVia();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api.orgs.changeRole(orgId, userId, role, via),
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/** Roles changed: the roles, the people (their roles) and `me` (what you may do now) are read again. */
export const refreshRoles = (qc: QueryClient, orgId: string) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.roles(orgId) }),
    qc.invalidateQueries({ queryKey: keys.people(orgId) }),
    qc.invalidateQueries({ queryKey: keys.members(orgId) }),
    qc.invalidateQueries({ queryKey: keys.me }),
  ]);

/** The workspace's roles, top first, and the permission areas (ADR 0085). */
export const useRoles = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.roles(orgId), queryFn: () => api.roles.list(orgId), staleTime: 30_000 });
};

/** `silent`: the caller shows a failure itself (in its dialog). */
export function useCreateRole(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: (input: RoleInput) => api.roles.create(orgId, input),
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/**
 * Changes a role at once on screen (the toggles save by themselves), then reads the truth back. `silent`: the caller
 * shows a failure itself.
 */
export function useUpdateRole(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: ({ roleId, patch }: { roleId: string; patch: Partial<RoleInput> }) =>
      api.roles.update(orgId, roleId, patch),
    onMutate: async ({ roleId, patch }) => {
      await qc.cancelQueries({ queryKey: keys.roles(orgId) });
      const before = qc.getQueryData<OrgRoles>(keys.roles(orgId));
      if (before)
        qc.setQueryData<OrgRoles>(keys.roles(orgId), {
          ...before,
          roles: before.roles.map((r) => (r.id === roleId ? { ...r, ...patch } : r)),
        });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.roles(orgId), ctx.before);
    },
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/** `silent`: the caller shows a failure itself (in its dialog). */
export function useDeleteRole(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: (roleId: string) => api.roles.remove(orgId, roleId),
    onSettled: () => refreshRoles(qc, orgId),
  });
}

export function useReorderRoles(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.roles.reorder(orgId, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.roles(orgId) });
      const before = qc.getQueryData<OrgRoles>(keys.roles(orgId));
      if (before) {
        const at = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData<OrgRoles>(keys.roles(orgId), {
          ...before,
          roles: [...before.roles]
            .map((r) => (at.has(r.id) ? { ...r, position: at.get(r.id) ?? r.position } : r))
            .sort(
              (a, b) => (a.kind === "everyone" ? 1 : 0) - (b.kind === "everyone" ? 1 : 0) || a.position - b.position,
            ),
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.roles(orgId), ctx.before);
    },
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/**
 * "Quem pode…": who holds one row, `everyone` and the roles in one call (`PUT …/permissions/{row}`); the roles it
 * answers with replace the cached ones. `silent`: the caller shows a failure itself.
 */
export function useSetRowHolders(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: ({ row, holders }: { row: string; holders: RowHolders }) => api.roles.setRow(orgId, row, holders),
    onSuccess: (roles) => qc.setQueryData(keys.roles(orgId), roles),
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/**
 * Sets a person's roles (exactly these). `mailLossSeen`: the mailboxes they were told agents lose
 * (`api.roles.mailLoss`); one given since refuses it with `agent.mail_loss_changed`, to ask again.
 */
export function useSetMemberRoles(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const via = useCardVia();
  return useMutation({
    mutationFn: ({ userId, roleIds, mailLossSeen }: { userId: string; roleIds: string[]; mailLossSeen?: string[] }) =>
      api.roles.setFor(orgId, userId, roleIds, via, mailLossSeen),
    onMutate: async ({ userId, roleIds }) => {
      await qc.cancelQueries({ queryKey: keys.people(orgId) });
      const before = qc.getQueryData<Person[]>(keys.people(orgId));
      if (before)
        qc.setQueryData<Person[]>(
          keys.people(orgId),
          before.map((p) => (p.userId === userId ? { ...p, roleIds } : p)),
        );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.people(orgId), ctx.before);
    },
    onSettled: () => refreshRoles(qc, orgId),
  });
}

/** What removing this person (or leaving) does, while the confirmation is open. */
export const useRemovalPreview = (orgId: string, userId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: ["org", orgId, "removal", userId],
    queryFn: () => api.orgs.removal(orgId, userId ?? ""),
    enabled: userId !== null,
    staleTime: 0,
  });
};

/** Removes a member, or leaves: the row goes at once; their agents' new owner and the counts follow. */
export function useRemoveMember(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const via = useCardVia();
  return useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember(orgId, userId, via),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: keys.people(orgId) });
      const before = qc.getQueryData<Person[]>(keys.people(orgId));
      if (before)
        qc.setQueryData<Person[]>(
          keys.people(orgId),
          before.filter((p) => p.userId !== userId),
        );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.people(orgId), ctx.before);
    },
    onSettled: () => {
      for (const key of [keys.people(orgId), keys.members(orgId), keys.overview(orgId), keys.agents(orgId), keys.me])
        void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useInvitations = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.invitations(orgId), queryFn: () => api.orgs.invitations(orgId), enabled });
};

export function useInvite(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role?: Role; roleIds?: string[] }) => api.orgs.invite(orgId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

export function useRevokeInvitation(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.orgs.revokeInvitation(orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

// ── Agents ──────────────────────────────────────────────────────────────────

export const useAgents = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agents(orgId),
    queryFn: () => api.agents.list(orgId),
    staleTime: 30_000,
    enabled,
    ...BACK_TO_TAB,
  });
};

/** Agents no longer in the team: the directories name their old messages with these (fresh with `useAgents`). */
export const useFormerAgents = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.formerAgents(orgId), queryFn: () => api.agents.former(orgId), staleTime: 30_000 });
};

/** Restaurar on an archived agent (Equipe, the phone's Agentes): back in the team and its lists. */
export function useUnarchiveAgent(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.agents.unarchive(orgId, agentId),
    onSuccess: () => {
      for (const key of [keys.agents(orgId), keys.team(orgId)]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** The team screen: refetched every 30 s and on focus, so new consultations show up. */
export const useTeam = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.team(orgId),
    queryFn: () => api.agents.team(orgId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
};

export const useModels = () => {
  const api = useApi();
  const models = useQuery({ queryKey: keys.models, queryFn: () => api.agents.models(), staleTime: 10 * 60_000 });
  if (models.data?.planModels) learnPlanModels(models.data.planModels);
  return models;
};

/** A catalog model's name ("Claude Haiku 5.5") once the list is in: its id for one the list doesn't have, null before. */
export function useModelLabel() {
  const models = useModels();
  return (id: string) => (models.data ? (models.data.models.find((m) => m.id === id)?.label ?? id) : null);
}

export const useCredentials = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.credentials(orgId), queryFn: () => api.agents.credentials(orgId), enabled });
};

/** `data` is null when the person can't see usage (members). */
export const useUsage = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.usage(orgId), queryFn: () => api.agents.usage(orgId), staleTime: 30_000 });
};

export function useCreateAgent(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AgentInput) => api.agents.create(orgId, input),
    onSuccess: (_agent, input) => {
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      // The workspace's "N people · N agents" counts it at once (it kept "0 agents" until the next visit).
      void qc.invalidateQueries({ queryKey: keys.overview(orgId) });
      // Made from a card: the card says so (its conversation gets the change live too).
      if (input.proposal) void qc.invalidateQueries({ queryKey: keys.agentProposal(orgId, input.proposal) });
    },
  });
}

/** An agent's proposal of a new agent (ADR 0081), by its card's message; `null` id: none. */
export function useAgentProposal(orgId: string, messageId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentProposal(orgId, messageId ?? ""),
    queryFn: () => api.agents.proposal(orgId, messageId ?? ""),
    enabled: Boolean(messageId),
  });
}

/** The right hand's card of a workspace change, whole (its event or a click): in the conversation and its own query. */
export function cacheActionCard(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  where: { channelId: string; messageId: string },
  card: WorkspaceActionCard,
) {
  cacheMessageMeta(qc, orgId, where.channelId, where.messageId, () => ({ actionCard: card }));
  qc.setQueryData<WorkspaceActionCardView>(keys.actionCard(orgId, where.messageId), (old) =>
    old ? { ...old, card } : old,
  );
}

/** The card where it was sent (the inbox of whoever may): read on its own, since its conversation isn't theirs. */
export function useActionCard(orgId: string, messageId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.actionCard(orgId, messageId ?? ""),
    queryFn: () => part(api, "actionCards").get(orgId, messageId ?? ""),
    enabled: Boolean(messageId),
  });
}

/**
 * Aplicar, Descartar or Pedir a quem pode on the right hand's card of a workspace change: the card comes back as it is
 * now, and what the change touches (roles, people, channels) is read again.
 */
export function useDecideActionCard(
  orgId: string,
  /** `action`: the card's catalog action. Sent back as `knows` when this build words it, so the server can refuse to
   * apply a change this build would show without saying what it is. */
  where: { channelId: string; messageId: string; action?: string },
) {
  const api = useApi();
  const qc = useQueryClient();
  const knows = (WORKSPACE_ACTION_IDS as readonly string[]).includes(where.action ?? "") ? where.action : undefined;
  return useMutation({
    mutationFn: (decision: "apply" | "dismiss" | "ask") =>
      part(api, "actionCards").decide(orgId, where.messageId, decision, knows),
    onSuccess: ({ card }) => {
      cacheActionCard(qc, orgId, where, card);
      for (const key of [
        keys.roles(orgId),
        keys.members(orgId),
        keys.channels(orgId),
        keys.invitations(orgId),
        keys.credentials(orgId),
      ])
        void qc.invalidateQueries({ queryKey: key });
    },
    // A refusal may have rewritten the card (what it names moved): read it again before anyone taps a second time.
    // Who reads it from their inbox is not in its conversation, so no event brings them the new card.
    onError: () => void qc.invalidateQueries({ queryKey: keys.actionCard(orgId, where.messageId) }),
  });
}

/**
 * "Criar" on an agent's proposal: the agent as proposed, in one click. The card shows it at once, with what it got;
 * the agents, channels and routines lists take it in.
 */
export function useCreateProposedAgent(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, test }: { messageId: string; test?: boolean }) =>
      api.agents.createProposed(orgId, messageId, test ? { test } : undefined),
    onSuccess: ({ proposal }) => {
      cacheAgentProposal(qc, orgId, proposal, proposal);
      for (const key of [keys.agents(orgId), keys.channels(orgId), keys.routines(orgId)])
        void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** The right hand's team card as it is now (its mutations and `team.proposal.updated`), in every list of its channel. */
export function cacheTeamCard(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  where: { channelId: string; messageId: string },
  card: TeamProposalCard,
) {
  cacheMessageMeta(qc, orgId, where.channelId, where.messageId, () => ({ actionCard: card }));
}

/** "Criar o time", "Descartar", "Desfazer" and "Ajustar" on the team card: the card comes back as it is now. */
export function useTeamCard(orgId: string, where: { channelId: string; messageId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const settle = ({ card }: { card: TeamProposalCard }) => {
    cacheTeamCard(qc, orgId, where, card);
    for (const key of [keys.agents(orgId), keys.channels(orgId), keys.routines(orgId)])
      void qc.invalidateQueries({ queryKey: key });
  };
  const { messageId } = where;
  return {
    create: useMutation({ mutationFn: () => api.agents.createTeam(orgId, messageId), onSuccess: settle }),
    deny: useMutation({ mutationFn: () => api.agents.denyTeam(orgId, messageId), onSuccess: settle }),
    undo: useMutation({ mutationFn: () => api.agents.undoTeam(orgId, messageId), onSuccess: settle }),
    adjust: useMutation({
      mutationFn: ({
        handle,
        patch,
      }: {
        handle: string;
        patch: Parameters<ApiClient["agents"]["adjustTeamAgent"]>[3];
      }) => api.agents.adjustTeamAgent(orgId, messageId, handle, patch),
      onSuccess: settle,
    }),
  };
}

/** "Ver modelos de time": the six templates in this language. */
export function useTeamTemplates(orgId: string, locale: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: keys.teamTemplates(orgId, locale),
    queryFn: () => api.agents.teamTemplates(orgId, locale),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * "Usar este modelo": its card and the right hand's first question land in the person's DM with it. Made, it stays
 * pending until the team is in the agents' list, its routines and channels read before it: a screen that shows the
 * team (the onboarding's last step, the sidebar) finds them there, and nothing on it changes while it arrives.
 */
export function useApplyTeamTemplate(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, locale }: { templateId: string; locale?: string }) =>
      api.agents.applyTeamTemplate(orgId, templateId, locale),
    onSuccess: async ({ channelId, state }) => {
      void qc.invalidateQueries({ queryKey: keys.messages(orgId, channelId) });
      if (state === "created")
        await Promise.all([
          qc.prefetchQuery({ ...routinesQuery(api, orgId), staleTime: 0 }),
          qc.prefetchQuery({ ...channelsQuery(api, orgId), staleTime: 0 }),
        ]);
      await qc.invalidateQueries({ queryKey: keys.agents(orgId) });
    },
  });
}

/** The routine a proposal came with, once its agent is where it reports (the card's "Criar a rotina"). */
export function useCreateProposedRoutine(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.agents.proposalRoutine(orgId, messageId),
    onSuccess: (proposal) => {
      cacheAgentProposal(qc, orgId, proposal, proposal);
      void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
    },
  });
}

/** "Pedir a um admin" on an agent's proposal the viewer can't create (ADR 0137): the card says it was sent. */
export function useAskAgentProposal(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.agents.askProposal(orgId, messageId),
    onSuccess: (proposal) => cacheAgentProposal(qc, orgId, proposal, proposal),
  });
}

/** "Recusar" on an agent's proposal: the card shows it at once. */
export function useDenyAgentProposal(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.agents.denyProposal(orgId, messageId),
    onSuccess: (proposal) => cacheAgentProposal(qc, orgId, proposal, proposal),
  });
}

function agentChanged(qc: QueryClient, orgId: string, agentId: string) {
  void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
  void qc.invalidateQueries({ queryKey: keys.agentDetail(orgId, agentId) });
  void qc.invalidateQueries({ queryKey: keys.overview(orgId) });
  void qc.invalidateQueries({ queryKey: keys.usageReport(orgId) });
}

export function useUpdateAgent(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AgentInput>) => api.agents.update(orgId, agentId, input),
    onSuccess: () => agentChanged(qc, orgId, agentId),
  });
}

/** Confirms a step of a new agent's setup checklist (ADR 0155 §2); the agent lists show it at once. */
export function useConfirmSetup(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (step: SetupStep) => api.agents.confirmSetup(orgId, agentId, step),
    onSuccess: (saved) => {
      qc.setQueryData<Agent[]>(keys.agents(orgId), (list) =>
        list?.map((a) => (a.id === agentId ? { ...a, setup: saved.setup } : a)),
      );
      agentChanged(qc, orgId, agentId);
    },
  });
}

/**
 * Lets more people talk to the agent. `ask` gets the mailboxes saving `audience` would take from it (only a mailbox's
 * owner gives an agent access to it), maybe none, and nothing is saved without its yes: it asks when they are some or
 * the agent is on someone else's plan (`widenQuestion`). The save sends what was agreed: a mailbox given meanwhile
 * makes the server refuse it, and `ask` gets the new list.
 */
export function useWidenAudience(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async ({
      audience,
      ask,
    }: {
      audience: AgentAudience;
      ask: (m: ForeignMailbox[]) => Promise<boolean>;
    }) => {
      for (let tries = 1; ; tries++) {
        const mailboxes = await api.agents.mailLoss(orgId, agentId, audience).catch((e: unknown) => {
          // An older server without the check: nothing to ask, as before it.
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        });
        if (!(await ask(mailboxes ?? []))) return null;
        const mailLossSeen = mailboxes?.map((m) => m.accountId);
        try {
          return await api.agents.update(orgId, agentId, { audience, ...(mailLossSeen ? { mailLossSeen } : {}) });
        } catch (e) {
          if (!(e instanceof ApiError && e.code === "agent.mail_loss_changed") || tries >= 3) throw e;
        }
      }
    },
    onSuccess: (saved) => {
      if (saved) agentChanged(qc, orgId, agentId);
    },
  });
  const widen = (
    audience: AgentAudience,
    ask: (mailboxes: ForeignMailbox[]) => Promise<boolean>,
    onSaved?: () => void,
  ) => save.mutate({ audience, ask }, { onSuccess: (saved) => saved && onSaved?.() });
  /** The same save, awaited: the agent saved, or null when `ask` said no. */
  const saveAsync = (audience: AgentAudience, ask: (mailboxes: ForeignMailbox[]) => Promise<boolean>) =>
    save.mutateAsync({ audience, ask });
  return { widen, saveAsync, busy: save.isPending, done: save.isSuccess && save.data !== null };
}

/** `silent`: the caller shows a failure itself (a refused key, in its dialog with the way to fix it). */
export function useAddCredential(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: (input: Parameters<ApiClient["agents"]["addCredential"]>[1]) => api.agents.addCredential(orgId, input),
    onSuccess: () => {
      // An OpenRouter key brings its models into the pickers.
      void qc.invalidateQueries({ queryKey: keys.models });
      return qc.invalidateQueries({ queryKey: keys.credentials(orgId) });
    },
  });
}

/** What an endpoint lists before it is saved (ADR 0146). */
export function useEndpointModels(orgId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (input: Parameters<ApiClient["agents"]["endpointModels"]>[1]) =>
      api.agents.endpointModels(orgId, input),
  });
}

/** Changes an endpoint's models and prices; its models in the pickers follow. */
export function useSetEndpointModels(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { credentialId: string; models: EndpointModel[] }) =>
      api.agents.setEndpointModels(orgId, input.credentialId, input.models),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.models });
      return qc.invalidateQueries({ queryKey: keys.credentials(orgId) });
    },
  });
}

/** The team map's drag (ADR 0148): the right hand posts a settings card in my DM with it; nothing changes yet. */
export function useProposeChannelMove(orgId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (input: { agentId: string; fromChannelId: string | null; toChannelId: string; reason: string }) =>
      api.agents.proposeChannelMove(orgId, input),
  });
}

/**
 * Responde a (ADR 0148 addendum): sets who agents report to at once; the team and the agents read again. Resolves with
 * what they were (for Desfazer, the same mutation with it).
 */
export function useSetAgentLines(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: AgentLineChange[]) => api.agents.setLines(orgId, changes),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.team(orgId) });
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      void qc.invalidateQueries({ queryKey: ["org", orgId, "agent"] });
    },
  });
}

// ── Agent groups (ADR 0083) ─────────────────────────────────────────────────

export const useAgentGroups = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.agentGroups(orgId), queryFn: () => api.agentGroups.list(orgId), staleTime: 30_000 });
};

export type AgentGroupAction =
  | { type: "create"; name: string; agentIds?: string[]; color?: string; icon?: string }
  | ({ type: "update"; groupId: string } & AgentGroupPatch)
  | { type: "remove"; groupId: string }
  | {
      type: "move";
      agentId: string;
      groupId: string | null;
      index?: number;
      /** Desfazer of a move that took the agent's pin off: pinned again at this place. */
      pinAt?: number;
    };

/**
 * Every change answers with all the groups. A move shows at once, and goes back if the server refuses it. Agents I put
 * in a group leave my pins (`unpinAgents`), so they land where I put them; `pinnedAt` in a move's result says where one
 * was.
 */
export function useAgentGroupAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.agentGroups(orgId);
  const setView = useSetSidebarView(orgId);
  const pinnedAt = (agentId: string) =>
    qc.getQueryData<SidebarView>(keys.sidebarView(orgId))?.pins?.agents.indexOf(agentId) ?? -1;
  const unpin = (ids: readonly string[]) => {
    if (ids.some((id) => pinnedAt(id) >= 0)) setView((now) => unpinAgents(now, ids) ?? now);
  };
  return useMutation({
    mutationFn: (action: AgentGroupAction): Promise<AgentGroup[]> => {
      switch (action.type) {
        case "create":
          return api.agentGroups.create(orgId, {
            name: action.name,
            agentIds: action.agentIds,
            color: action.color,
            icon: action.icon,
          });
        case "update": {
          const { type: _, groupId, ...patch } = action;
          return api.agentGroups.update(orgId, groupId, patch);
        }
        case "remove":
          return api.agentGroups.remove(orgId, action.groupId);
        case "move":
          return api.agentGroups.move(orgId, action.agentId, { groupId: action.groupId, index: action.index });
      }
    },
    onMutate: async (action) => {
      if (action.type !== "move") return undefined;
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<AgentGroup[]>(key);
      if (before) qc.setQueryData(key, moveInGroups(before, action.agentId, action.groupId, action.index));
      const { agentId, pinAt } = action;
      const at = action.groupId ? pinnedAt(agentId) : -1;
      if (pinAt !== undefined) setView((now) => repinAgent(now, agentId, pinAt));
      else if (at >= 0) unpin([agentId]);
      return { before, pinnedAt: at };
    },
    onError: (_error, action, context) => {
      if (context?.before) qc.setQueryData(key, context.before);
      if (action.type === "move" && context && context.pinnedAt >= 0)
        setView((now) => repinAgent(now, action.agentId, context.pinnedAt));
    },
    onSuccess: (groups, action) => {
      qc.setQueryData(key, groups);
      if (action.type === "create") unpin(action.agentIds ?? []);
    },
  });
}

// ── Chat ────────────────────────────────────────────────────────────────────

export const useChannels = (orgId: string) => useQuery(channelsQuery(useApi(), orgId));

/** The sidebar's channel categories, in order (ADR 0080). */
export const channelCategoriesQuery = (api: ApiClient, orgId: string) =>
  queryOptions({
    queryKey: keys.channelCategories(orgId),
    queryFn: () => api.chat.categories(orgId),
    staleTime: 30_000,
  });
export const useChannelCategories = (orgId: string) => useQuery(channelCategoriesQuery(useApi(), orgId));

/** After any layout change: the channels (their category and order) and the categories refetch. */
function refreshLayout(qc: QueryClient, orgId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
    qc.invalidateQueries({ queryKey: keys.channelCategories(orgId) }),
  ]);
}

/** Admins: a new category at the end, optionally taking channels along. */
export function useCreateChannelCategory(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; channelIds?: string[] }) => api.chat.createCategory(orgId, input),
    onSuccess: () => refreshLayout(qc, orgId),
  });
}

export function useRenameChannelCategory(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: string; name: string }) =>
      api.chat.renameCategory(orgId, input.categoryId, input.name),
    onSuccess: () => refreshLayout(qc, orgId),
  });
}

export function useDeleteChannelCategory(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => api.chat.deleteCategory(orgId, categoryId),
    onSuccess: () => refreshLayout(qc, orgId),
  });
}

export function usePlaceChannelCategory(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: string; beforeCategoryId: string | null }) =>
      api.chat.placeCategory(orgId, input.categoryId, input.beforeCategoryId),
    onSuccess: () => refreshLayout(qc, orgId),
  });
}

/**
 * Puts a channel in a category (null: none), before another channel or at its end. The list moves at once
 * (the channel takes its new category) and refetches for the exact order.
 */
export function usePlaceChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; categoryId: string | null; beforeChannelId?: string | null }) =>
      api.chat.place(orgId, input.channelId, { categoryId: input.categoryId, beforeChannelId: input.beforeChannelId }),
    onMutate: (input) => {
      qc.setQueryData<Channel[]>(keys.channels(orgId), (list) =>
        list?.map((c) => (c.id === input.channelId ? { ...c, categoryId: input.categoryId } : c)),
      );
    },
    onSettled: () => refreshLayout(qc, orgId),
  });
}

export const channelMembersQuery = (api: ApiClient, orgId: string, channelId: string) =>
  queryOptions({
    queryKey: keys.channelMembers(orgId, channelId),
    queryFn: async ({ client }) => {
      const members = await api.chat.members(orgId, channelId);
      readUnknownMembers(client, orgId, members);
      return members;
    },
    staleTime: 30_000,
    ...BACK_TO_TAB,
  });

export const useChannelMembers = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ ...channelMembersQuery(api, orgId, channelId), enabled });
};

/** Messages per page: the latest page, then older pages on scroll-up. */
export const MESSAGES_PAGE = 100;
/** A thread's root and replies, in one read. */
export const THREAD_PAGE = 200;

/**
 * The latest page of a conversation. Cached per channel and fresh for 30 s
 * (real-time events keep it current, and what they missed before the
 * channel's subscription was confirmed is added then), so switching back is
 * instant; then it revalidates in the background. Kept 30 min after leaving
 * it, so going back later still shows it at once. A read (a reconnect's
 * included) keeps my messages still sending or waiting for the connection.
 */
export const messagesQuery = (api: ApiClient, orgId: string, channelId: string) =>
  queryOptions({
    queryKey: keys.messages(orgId, channelId),
    queryFn: async ({ client, queryKey }) => {
      const start = client.getQueryData<Message[]>(queryKey);
      return withLocalCopies(
        await api.chat.messages(orgId, channelId, { limit: MESSAGES_PAGE }),
        client.getQueryData<Message[]>(queryKey),
        outbox.has,
        start,
      );
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });

export const useMessages = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ ...messagesQuery(api, orgId, channelId), enabled });
};

/** Sidebar hover/focus: load a conversation before the click. */
export function usePrefetchMessages(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useCallback(
    (channelId: string) => {
      void qc.prefetchQuery(messagesQuery(api, orgId, channelId));
    },
    [api, qc, orgId],
  );
}

/** Conversations loaded when the workspace opens (no hover on a phone, nor before the first click). */
export const RECENT_PREFETCH = 5;

/**
 * Once the lists arrive, loads the unread and most recent conversations while
 * the app is idle, once per organization: opening them is then instant.
 */
export function usePrefetchRecent(orgId: string, count = RECENT_PREFETCH) {
  const api = useApi();
  const qc = useQueryClient();
  const channels = useChannels(orgId);
  const dms = useDms(orgId);
  const ready = Boolean(channels.data && dms.data);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the lists are in; later updates don't run it again
  useEffect(() => {
    if (!ready) return;
    const ids = recentConversations(channels.data ?? [], dms.data ?? [], count);
    const run = () => {
      for (const id of ids) void qc.prefetchQuery(messagesQuery(api, orgId, id));
    };
    const idle = globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(run, { timeout: 2_000 });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  }, [ready, orgId, count, api, qc]);
}

/** A `#channel` link's card, when it opens (or when the link names a channel the list doesn't have). */
export const useChannelCard = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.channelCard(orgId, channelId),
    queryFn: () => api.chat.card(orgId, channelId),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
};

/**
 * The server's "not for you" (403) or "no such thing" (404) as an answer, `null`, instead of an error. A query that
 * fails keeps no data, so every refetch (a row coming back on screen, the app coming forward, an invalidation
 * while an agent writes) puts it back in `pending`: a pill fed by it would switch between its loading mark and its
 * words each time, and the message around it would change height.
 */
const orNothing = <T>(ask: Promise<T>): Promise<T | null> =>
  ask.catch((e: unknown) => {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  });

/** A pasted message link's pill: where the message is and who wrote it (`null`: one I can't see). */
export const useMessageCard = (orgId: string, messageId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.messageCard(orgId, messageId),
    queryFn: () => orNothing(api.chat.messageCard(orgId, messageId)),
    staleTime: 60_000,
    retry: false,
  });
};

/** What an internal id in a text names (`IdRef`), for its pill; `null` (404) leaves the text as written. */
export const useIdRef = (orgId: string, id: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.idRef(orgId, id),
    queryFn: () => orNothing(api.chat.idRef(orgId, id)),
    staleTime: 5 * 60_000,
    retry: false,
  });
};

export function useJoinChannel(orgId: string, channelId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.chat.join(orgId, channelId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
      void qc.invalidateQueries({ queryKey: ["org", orgId, "channel", channelId] });
    },
  });
}

export function useAddChannelMember(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, member }: { channelId: string; member: { userId: string } | { agentId: string } }) =>
      api.chat.addMember(orgId, channelId, member),
    onSuccess: (_v, { channelId }) => qc.invalidateQueries({ queryKey: keys.channelMembers(orgId, channelId) }),
  });
}

/**
 * Puts a message in the right cache: the channel list, or its thread. Replaces the optimistic copy (same
 * `clientId`), which always waits in the channel list (a thread may not be loaded yet): a reply's copy is removed
 * from there too, or it would stay "sending…" next to the real one.
 */
export function cacheMessage(qc: ReturnType<typeof useQueryClient>, orgId: string, message: Message) {
  const channelKey = keys.messages(orgId, message.channelId);
  const key = message.threadId ? keys.thread(orgId, message.channelId, message.threadId) : channelKey;
  const withoutLocal = (list: Message[] | undefined) =>
    message.clientId ? list?.filter((m) => !(m.local && m.clientId === message.clientId)) : list;
  if (message.threadId && message.clientId) qc.setQueryData<Message[]>(channelKey, withoutLocal);
  // A thread no one read yet stays unread: a list started by one reply would pass for the whole thread, and open
  // without the replies before it. A read on its way may have missed this one, which it keeps (`withLocalCopies`).
  const query = qc.getQueryCache().find({ queryKey: key, exact: true });
  if (message.threadId && query?.state.data === undefined && query?.state.fetchStatus !== "fetching") {
    // Open on a read that failed: this one mustn't be lost with the rest of the thread.
    void qc.refetchQueries({ queryKey: key, exact: true, type: "active" });
    return;
  }
  // While that read is on its way, the root stands in as `useThreadMessages` shows it.
  const root = message.threadId ? cachedTopLevel(qc, orgId, message.threadId, message.channelId) : undefined;
  qc.setQueryData<Message[]>(key, (list) => upsertMessage(withoutLocal(list) ?? (root && [root]), message));
}

/**
 * The thread whose count a `message.created` moves. One too big for its event still says it; an agent's sticker or
 * GIF after its reply (ADR 0091) moves none.
 */
export function repliedThread(event: Extract<ChannelEvent, { type: "message.created" }>) {
  const threadId = event.message ? event.message.threadId : event.threadId;
  return threadId && !isMediaAfterReply(event.message?.meta) ? threadId : null;
}

/** A reply landed: the lists behind the thread lines, and that thread's header (count, last reply, who is in it). */
export function refreshRepliedThread(qc: ReturnType<typeof useQueryClient>, orgId: string, threadId: string) {
  void qc.invalidateQueries({
    queryKey: keys.threads(orgId),
    predicate: (q) => q.queryKey[3] !== "one" || q.queryKey[4] === threadId,
  });
  // A task's conversation: its count and last line on the task's dialog.
  if (qc.getQueryData<ThreadInfo>(keys.threadInfo(orgId, threadId))?.channelKind === "task")
    void qc.invalidateQueries({ queryKey: keys.issues(orgId) });
}

/**
 * A new top-level message may get agent replies in its thread: its thread's list starts now, with the message as
 * its root (what the server lists first), so a thread opened on it before any reply still shows it.
 */
export function startThreadCache(qc: ReturnType<typeof useQueryClient>, orgId: string, message: Message) {
  if (message.threadId) return;
  qc.setQueryData<Message[]>(keys.thread(orgId, message.channelId, message.id), (list) => list ?? [message]);
}

/**
 * A message straight into a DM (Início's "Peça a um agente", ADR 0108, and the profile card's box): the DM (made if
 * new), the message sent there and kept in its cache, so the conversation opens with it (and the agent at work).
 */
export function useSendDm(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, ...target }: DmTarget & { body: string }) => {
      const { channelId } = await api.dms.open(orgId, target);
      return api.chat.post(orgId, channelId, { body, clientId: newClientId() });
    },
    onSuccess: (message) => {
      cacheMessage(qc, orgId, message);
      void qc.invalidateQueries({ queryKey: keys.dms(orgId) });
    },
  });
}

const isMessageList = (key: readonly unknown[]) => key[4] === "messages" || key[4] === "thread";

/**
 * Reads a channel's open lists again once its events reach us (`subscribed`: what happened there before was
 * never sent to us) and adds what they lack, taking nothing away: a message heard live while this read was on
 * its way stays. A read already on its way lands first, so it can't put an older list back over what this one
 * adds. Returns what it read.
 */
export async function catchUpChannel(
  api: ApiClient,
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
): Promise<Message[]> {
  const prefix = ["org", orgId, "channel", channelId];
  await qc.refetchQueries({ queryKey: prefix, fetchStatus: "fetching" }, { cancelRefetch: false });
  const reads = qc
    .getQueryCache()
    .findAll({ queryKey: prefix, type: "active" })
    .flatMap(({ queryKey: [, , , , list, rootId] }) =>
      list === "messages"
        ? [api.chat.messages(orgId, channelId, { limit: MESSAGES_PAGE })]
        : list === "thread" && typeof rootId === "string"
          ? [api.chat.messages(orgId, channelId, { threadId: rootId, limit: THREAD_PAGE })]
          : [],
    );
  const settled = await Promise.allSettled(reads);
  // A read that failed (a deploy, a dropped connection) would leave its list without what it came for until a
  // reload: the lists read again through the query client, which tries again.
  if (settled.some((r) => r.status === "rejected"))
    void qc.invalidateQueries({ queryKey: prefix, predicate: (q) => isMessageList(q.queryKey) });
  const read = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const known = new Set(
    qc
      .getQueriesData<Message[]>({ queryKey: prefix, predicate: (q) => isMessageList(q.queryKey) })
      .flatMap(([, data]) => (Array.isArray(data) ? data.map((m) => m.id) : [])),
  );
  const added = read.filter((m) => !known.has(m.id));
  for (const m of added) cacheMessage(qc, orgId, m);
  // Only what it added: this runs on every channel opened, and a reconnect reads the thread lists on its own.
  for (const threadId of new Set(added.flatMap((m) => m.threadId ?? []))) refreshRepliedThread(qc, orgId, threadId);
  return read;
}

/** The screens open on each conversation (a thread beside its channel is a second one), per query client. */
const openScreens = new WeakMap<QueryClient, Map<string, number>>();

/**
 * A screen opened that applies a conversation's live events to its caches; call what this returns when it closes.
 * Once its last one closes, nothing keeps those caches current: they are marked stale, not read, so the next showing
 * reads them whatever their `staleTime`, within which it would show the conversation (and its thread lines) as it
 * was when it closed.
 */
export function openConversation(qc: QueryClient, orgId: string, channelId: string): () => void {
  const counts = openScreens.get(qc) ?? new Map<string, number>();
  openScreens.set(qc, counts);
  const key = `${orgId}:${channelId}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const left = (counts.get(key) ?? 1) - 1;
    if (left > 0) return void counts.set(key, left);
    counts.delete(key);
    const conversation = ["org", orgId, "channel", channelId];
    // A read still on its way would be joined by the next showing, which would take an answer older than itself.
    void qc.cancelQueries({ queryKey: conversation, predicate: (q) => q.getObserversCount() === 0 });
    void qc.invalidateQueries({ queryKey: conversation, refetchType: "none" });
    void qc.invalidateQueries({ queryKey: keys.threads(orgId), refetchType: "none" });
  };
}

/** A read's receipts on the copies of its messages the channel's lists hold (nothing else of them changes). */
export function cacheReceipts(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
  read: Message[],
) {
  const receipts = new Map(read.flatMap((m) => (m.receipts ? [[m.id, m.receipts] as const] : [])));
  qc.setQueriesData<Message[]>(
    { queryKey: ["org", orgId, "channel", channelId], predicate: (q) => isMessageList(q.queryKey) },
    (list) =>
      list?.some((m) => receipts.has(m.id) && m.receipts !== receipts.get(m.id))
        ? list.map((m) => {
            const r = receipts.get(m.id);
            return r && m.receipts !== r ? { ...m, receipts: r } : m;
          })
        : list,
  );
}

/**
 * A card's meta changed (`patch` gives the keys that change, from the meta it has): that message in every loaded
 * list of its channel.
 */
export function cacheMessageMeta(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
  messageId: string,
  patch: (meta: Record<string, unknown>) => Record<string, unknown>,
) {
  qc.setQueriesData({ queryKey: ["org", orgId, "channel", channelId] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    const list = data as Message[];
    if (!list.some((m) => m && m.id === messageId)) return data;
    return list.map((m) => (m.id === messageId ? { ...m, meta: { ...(m.meta ?? {}), ...patch(m.meta ?? {}) } } : m));
  });
}

/**
 * An agent's proposal of a new agent was decided (ADR 0081): the decision on its card in the chat, which already
 * holds the draft, and its own query again.
 */
export function cacheAgentProposal(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  where: { channelId: string; messageId: string },
  { state, agentId, decidedByUserId, decidedAt, applied, routineId, askedAt }: AgentProposalDecision,
) {
  cacheMessageMeta(qc, orgId, where.channelId, where.messageId, (meta) => ({
    actionCard: {
      ...(meta.actionCard as Record<string, unknown> | undefined),
      state,
      agentId,
      decidedByUserId,
      decidedAt,
      ...(applied ? { applied } : {}),
      ...(routineId ? { routineId } : {}),
      ...(askedAt ? { askedAt } : {}),
    },
  }));
  void qc.invalidateQueries({ queryKey: keys.agentProposal(orgId, where.messageId) });
}

/** A new message's `clientId`: sent again with the same one (its answer was lost), it's written only once. */
export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * What `chat.post` gets for a message of mine: the quoted message, the files by id and a GIF or a sticker by what
 * names it (ADR 0091), from which the server builds the real meta (it checks them).
 */
function postBody({ body, clientId, threadId, meta, steer }: PostInput) {
  const replyTo = replyOf(meta)?.messageId;
  const attachments = artifactRefs(meta).map((r) => r.id);
  const media = messageMediaOf(meta);
  return {
    body,
    clientId,
    ...(threadId ? { threadId } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(threadId && meta?.[OPEN_THREAD] === true ? { openThread: true } : {}),
    ...(steer ? { steer } : {}),
    ...(media ? { media: postedMedia(media) } : {}),
  };
}

/** The server's copy of a message I sent, in place of its local one. */
function cacheSent(qc: QueryClient, orgId: string, message: Message, { clientId, threadId, meta }: PostInput) {
  // Written in the thread panel: it stays out of the channel while the thread list catches up
  // (the realtime event may come later, or not at all).
  const opened = Boolean(threadId) && meta?.[OPEN_THREAD] === true;
  const echoed = {
    ...message,
    clientId: message.clientId ?? clientId,
    ...(opened ? { meta: { ...message.meta, [OPEN_THREAD]: true } } : {}),
  };
  cacheMessage(qc, orgId, echoed);
  if (opened) {
    void qc.invalidateQueries({ queryKey: keys.threads(orgId), predicate: (q) => q.queryKey[3] !== "one" });
  }
  return echoed;
}

/**
 * Sends a message optimistically: it appears at once (`local: "pending"`),
 * is replaced by the server's copy (matched by `clientId`, from the response
 * or the WebSocket, whichever comes first), or turns `failed` with a retry.
 * One with no answer from the server waits in the `outbox` instead.
 */
export function usePostMessage(orgId: string, channelId: string, options: PostMessageOptions) {
  return useMutation(postMessageMutation(useApi(), useQueryClient(), orgId, channelId, options));
}

export interface PostMessageOptions {
  me: { id: string };
  /** Agents the text mentions (client-side guess, for the instant "pensando…" row). */
  mentioned?: (body: string) => string[];
  onSent?: (message: Message, local: Message) => void;
  onOptimistic?: (local: Message) => void;
  /**
   * The server refused it, or no answer came (the message turns "failed" either way: with a retry, or waiting in
   * the `outbox` when `waits`). `clientId` is the failed message's (its optimistic copy's).
   */
  onFailed?: (error: unknown, failed: { clientId: string; waits: boolean }) => void;
}

/** `usePostMessage`'s mutation, for a `MutationObserver` outside React (tests). */
export function postMessageMutation(
  api: ApiClient,
  qc: QueryClient,
  orgId: string,
  channelId: string,
  options: PostMessageOptions,
) {
  const key = keys.messages(orgId, channelId);
  return mutationOptions({
    meta: { silent: true },
    // Always tried: paused while the browser says offline, it would stay "enviando…" (and out of the outbox) until an
    // `online` event a sleep or a webview may never fire. Offline it fails at once and waits in the outbox instead.
    networkMode: "always",
    // A POST a dead connection holds would keep it "enviando…" for good: past `SEND_ANSWER_MS` it waits in the outbox
    // and goes again with the same `clientId` (written once), unless its copy comes over the socket first.
    mutationFn: (input: PostInput) => answerWithin(api.chat.post(orgId, channelId, postBody(input)), SEND_ANSWER_MS),
    onMutate: ({ body, clientId, threadId, meta }) => {
      const local: Message = {
        id: `local-${clientId}`,
        channelId,
        threadId: threadId ?? null,
        author: { type: "person", id: options.me.id },
        body,
        mentionedAgentIds: options.mentioned?.(body) ?? [],
        agentRunId: null,
        meta: meta ?? {},
        clientId,
        local: "pending",
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Message[]>(key, (list) =>
        upsertMessage(
          list?.filter((m) => m.id !== local.id),
          local,
        ),
      );
      options.onOptimistic?.(local);
      playSound("send");
      return { local };
    },
    onSuccess: (message, input, ctx) => {
      outbox.remove(input.clientId);
      const echoed = cacheSent(qc, orgId, message, input);
      if (ctx?.local) options.onSent?.(echoed, ctx.local);
    },
    onError: (error, { clientId }, ctx) => {
      // No answer from the server (no internet, or it is restarting): it waits, and goes out again from whatever
      // screen is open once the connection is back (`useSendWaiting`).
      const waits = sendWaits(error);
      if (waits && ctx?.local) outbox.add(orgId, ctx.local);
      options.onFailed?.(error, { clientId, waits });
      qc.setQueryData<Message[]>(key, (list) =>
        list?.map((m) =>
          m.local && m.clientId === clientId
            ? { ...m, local: "failed" as const, sendFailure: waits ? undefined : sendFailureOf(error) }
            : m,
        ),
      );
    },
  });
}

/** How long a send waits for the server's answer before it counts as unanswered (`answerWithin`). */
export const SEND_ANSWER_MS = 20_000;

/** Local copies of recordings on their way, to play before the server has them: `clientId` → object URL. */
const voiceLocal = new Map<string, string>();
export const voiceLocalUrl = (clientId: string | null | undefined) => (clientId ? voiceLocal.get(clientId) : undefined);

/** Client-only key on a recording's optimistic meta: it waits for a connection. */
export const VOICE_WAITING = "voiceWaiting";

const VOICE_RETRY_MS = [3_000, 10_000, 30_000];

/** Until the connection seems back, or a little while. */
function voiceRetryWait(attempt: number) {
  const ms = VOICE_RETRY_MS[Math.min(attempt, VOICE_RETRY_MS.length - 1)] ?? 30_000;
  return new Promise<void>((done) => {
    const finish = () => {
      clearTimeout(timer);
      globalThis.removeEventListener?.("online", finish);
      done();
    };
    const timer = setTimeout(finish, ms);
    globalThis.addEventListener?.("online", finish);
  });
}

/** A recording that won't become a message: its bubble goes, and its local copy with it. */
export function dropLocalVoice(qc: QueryClient, orgId: string, channelId: string, clientId: string) {
  const url = voiceLocal.get(clientId);
  if (url) URL.revokeObjectURL(url);
  voiceLocal.delete(clientId);
  const without = (list: Message[] | undefined) => list?.filter((m) => !(m.local && m.clientId === clientId));
  qc.setQueryData<Message[]>(keys.messages(orgId, channelId), without);
}

/**
 * Sends a recording (ADR 0100): its bubble appears at once and stays until the server's message replaces it (same
 * `clientId`). Without a connection the recording waits in memory and goes when it comes back, with the same
 * `clientId`, so a send whose answer was lost is stored once. `onRefused`: the server said no, and the bubble went.
 */
export function useSendVoice(
  orgId: string,
  channelId: string,
  options: { me: { id: string }; onRefused?: (error: unknown) => void },
) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.messages(orgId, channelId);
  const latest = useRef(options);
  latest.current = options;
  return useCallback(
    async (input: {
      blob: Blob;
      durationMs: number;
      peaks: number[];
      threadId: string | null;
      replyTo: string | null;
      language: string | null;
      meta?: Record<string, unknown>;
    }) => {
      const { blob, durationMs, peaks, threadId, replyTo, language, meta } = input;
      const clientId = newClientId();
      voiceLocal.set(clientId, URL.createObjectURL(blob));
      const local: Message = {
        id: `local-${clientId}`,
        channelId,
        threadId,
        author: { type: "person", id: latest.current.me.id },
        body: "",
        mentionedAgentIds: [],
        agentRunId: null,
        meta: { ...meta, voice: { clipId: "", durationMs, peaks } },
        clientId,
        local: "pending",
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Message[]>(key, (list) => upsertMessage(list, local));
      playSound("send");
      const waiting = (on: boolean) =>
        qc.setQueryData<Message[]>(key, (list) =>
          list?.map((m) =>
            m.local && m.clientId === clientId ? { ...m, meta: { ...m.meta, [VOICE_WAITING]: on } } : m,
          ),
        );
      for (let attempt = 0; ; attempt++) {
        try {
          await api.voice.send(orgId, channelId, { blob, durationMs, peaks, clientId, threadId, replyTo, language });
          waiting(false);
          return;
        } catch (error) {
          if (!sendWaits(error)) {
            dropLocalVoice(qc, orgId, channelId, clientId);
            latest.current.onRefused?.(error);
            return;
          }
          waiting(true);
          await voiceRetryWait(attempt);
        }
      }
    },
    [api, qc, key, orgId, channelId],
  );
}

/**
 * Client-only key on a reply's optimistic meta: written in the thread panel ("Responder"), so the
 * server marks the thread `openedByReplyAt` (a retry sends it again).
 */
export const OPEN_THREAD = "openThread";

/**
 * A message to post. `meta` is the optimistic copy's (`replyTo`, `artifacts`, `media`): only the quoted
 * message id, the file ids and what names a GIF or a sticker go to the server, which writes the real meta.
 */
interface PostInput {
  body: string;
  clientId: string;
  threadId?: string | null;
  meta?: Record<string, unknown>;
  /** "Parar e mandar": an agent working here stops its current step and reads it now. */
  steer?: "now";
}

/** How a message goes out while an agent works: joins its task (default) or stops it to read now. */
export interface SendOptions {
  steer?: "now";
}

/**
 * `send(body)` for a new message; `retry(local)` for one that failed (same quote and files).
 * `send(body, threadId, { steer: "now" })` ("Parar e mandar"): `steer` may come in the third
 * argument (it never reaches the optimistic copy's meta) or in `options`. A retry joins the task.
 */
export function sendHelpers(mutation: ReturnType<typeof usePostMessage>) {
  return {
    send: (body: string, threadId?: string | null, meta?: Record<string, unknown>, options: SendOptions = {}) => {
      const given: Record<string, unknown> = meta ?? {};
      const { steer: inMeta, ...rest } = given;
      const steer = options.steer ?? (inMeta === "now" ? "now" : undefined);
      mutation.mutate({
        body,
        clientId: newClientId(),
        threadId,
        meta: meta ? rest : undefined,
        ...(steer ? { steer } : {}),
      });
    },
    retry: (local: Message) =>
      mutation.mutate({
        body: local.body,
        clientId: local.clientId ?? newClientId(),
        threadId: local.threadId,
        meta: local.meta,
      }),
  };
}

const flushing = new Map<string, Promise<boolean>>();

/**
 * Sends my messages that wait in the organization (`outbox`), whatever screen is open: in the order they were
 * written, and one run at a time, so none goes out twice at once. The server's copy takes the waiting one's place.
 * While the server still doesn't answer, the rest keeps waiting. One it refuses leaves the outbox and turns
 * "Não enviada" (`onRefused`). True while something still waits.
 */
export function flushOutbox(
  api: ApiClient,
  qc: QueryClient,
  orgId: string,
  onRefused?: (error: unknown) => void,
): Promise<boolean> {
  const running = flushing.get(orgId);
  if (running) return running;
  const run = (async () => {
    const me = qc.getQueryData<Me | null>(keys.me)?.user.id;
    for (const local of outbox.of(orgId)) {
      if (!me) return true;
      const clientId = local.clientId ?? "";
      // Someone else's, from before a sign-in on this device: never sent as me.
      if (local.author.id !== me) {
        outbox.remove(clientId);
        continue;
      }
      const input: PostInput = { body: local.body, clientId, threadId: local.threadId, meta: local.meta };
      try {
        const message = await answerWithin(api.chat.post(orgId, local.channelId, postBody(input)), SEND_ANSWER_MS);
        outbox.remove(clientId);
        // A conversation the cache let go meanwhile reads it from the server when it opens.
        if (qc.getQueryData(keys.messages(orgId, local.channelId))) cacheSent(qc, orgId, message, input);
      } catch (error) {
        if (sendWaits(error)) return true;
        outbox.remove(clientId);
        qc.setQueryData<Message[]>(keys.messages(orgId, local.channelId), (list) =>
          list?.map((m) => (m.local && m.clientId === clientId ? { ...m, sendFailure: sendFailureOf(error) } : m)),
        );
        onRefused?.(error);
      }
    }
    return false;
  })().finally(() => flushing.delete(orgId));
  flushing.set(orgId, run);
  return run;
}

/**
 * What I sent while the connection was down goes out when it's back, whatever screen is open (`flushOutbox`), and
 * again every `OUTBOX_RETRY_MS` while the socket stays open and it still waits. `onRefused`: the server refused one.
 */
export function useSendWaiting(
  orgId: string,
  connection: RealtimeConnection | null,
  onRefused: (error: unknown) => void,
) {
  const api = useApi();
  const qc = useQueryClient();
  const refused = useRef(onRefused);
  refused.current = onRefused;
  useEffect(() => {
    if (!connection) return;
    return keepSending(connection, () => flushOutbox(api, qc, orgId, (error) => refused.current(error)));
  }, [api, qc, orgId, connection]);
}

// ── Approvals ───────────────────────────────────────────────────────────────

/** Every approval you can see (pending and decided); `canDecide` says if you may act. */
export const useApprovals = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.approvals(orgId), queryFn: () => api.approvals.list(orgId), staleTime: 15_000 });
};

/** One approval (inline card when it isn't in the list yet). */
export const useApproval = (orgId: string, approvalId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.approval(orgId, approvalId),
    queryFn: () => api.approvals.get(orgId, approvalId),
    enabled,
  });
};

/**
 * The requests on one approval card, by its message: for a card older than the org's list reaches. Under the
 * list's key, so whatever refreshes the list refreshes it.
 */
export const useCardApprovals = (orgId: string, messageId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.approvals(orgId), "card", messageId],
    queryFn: () => api.approvals.list(orgId, { messageId }),
    enabled,
  });
};

/** Puts a fresh approval in the caches (decision responses, WebSocket events). */
export function cacheApproval(qc: ReturnType<typeof useQueryClient>, orgId: string, approval: Approval) {
  qc.setQueryData<Approval[]>(keys.approvals(orgId), (list) => {
    if (!list) return list;
    const previous = list.find((a) => a.id === approval.id);
    const merged = keepOwnRights(previous, approval);
    return previous ? list.map((a) => (a.id === approval.id ? merged : a)) : [merged, ...list];
  });
  qc.setQueryData<Approval>(keys.approval(orgId, approval.id), (prev) => keepOwnRights(prev, approval));
  // One prepared ahead is also on its routine's page (approved, ran, withdrawn).
  if (approval.routineId) void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
}

/**
 * Channel events don't know who is asking: our own `canDecide` stays until it's decided, and our own `canCancel`
 * while an action approved ahead may still run.
 */
function keepOwnRights(previous: Approval | undefined, approval: Approval): Approval {
  if (!previous) return approval;
  if (approval.status === "pending") return { ...approval, canDecide: previous.canDecide };
  if (approval.status === "approved" && approval.runAt && !approval.executedAt) {
    return { ...approval, canCancel: approval.canCancel || previous.canCancel };
  }
  return approval;
}

const decidingKey = (orgId: string) => ["approval-decision", orgId];

/** Whether any of these requests is being decided: each of a card's buttons runs its own mutation. */
export function useApprovalsDeciding(orgId: string, ids: readonly string[]) {
  const deciding = useIsMutating({
    mutationKey: decidingKey(orgId),
    predicate: (mutation) => {
      const input = mutation.state.variables as { id?: string; ids?: string[] } | undefined;
      return (input?.ids ?? [input?.id]).some((id) => id !== undefined && ids.includes(id));
    },
  });
  return deciding > 0;
}

/** `always` ("Aprovar sempre"): approves this one and the agent's next calls of its kind. */
export function useDecideApproval(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const via = useCardVia();
  return useMutation({
    mutationKey: decidingKey(orgId),
    mutationFn: ({
      id,
      decision,
      reason,
      always,
    }: {
      id: string;
      decision: "approve" | "refuse";
      reason?: string;
      always?: boolean;
    }) =>
      decision === "approve"
        ? api.approvals.approve(orgId, id, reason, always, via)
        : api.approvals.refuse(orgId, id, reason, via),
    onSuccess: (approval, { decision, always }) => {
      playSound(decision === "approve" ? "approved" : "error");
      cacheApproval(qc, orgId, approval);
      void qc.invalidateQueries({ queryKey: keys.approvals(orgId) });
      // Its run moves on: the chips of the threads it held say so (a hand-off's run posts nothing where they are).
      void qc.invalidateQueries({ queryKey: keys.threads(orgId) });
      if (always) void qc.invalidateQueries({ queryKey: keys.approvalRules(orgId, approval.agentId) });
      if (always && approval.approveAlways?.routineId) void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
    },
  });
}

/** Withdraws an action approved ahead before its time (its routine's page, its card). */
export function useCancelApproval(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approvals.cancel(orgId, id),
    onSuccess: (approval) => {
      cacheApproval(qc, orgId, approval);
      void qc.invalidateQueries({ queryKey: keys.approvals(orgId) });
    },
  });
}

/**
 * A card's "Aprovar tudo" / "Agora não para todos": exactly the ids it listed at the click. `only: "routine"` leaves
 * to the server which of them one tap may decide: the others come back in `skipped`, still pending.
 */
export function useDecideApprovals(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const via = useCardVia();
  return useMutation({
    mutationKey: decidingKey(orgId),
    mutationFn: (input: { ids: string[]; decision: "approve" | "refuse"; reason?: string; only?: "routine" }) =>
      api.approvals.decideMany(orgId, via ? { ...input, via } : input),
    onSuccess: (result, { decision }) => {
      playSound(decision === "approve" ? "approved" : "error");
      for (const approval of result.approvals) cacheApproval(qc, orgId, approval);
      void qc.invalidateQueries({ queryKey: keys.approvals(orgId) });
      void qc.invalidateQueries({ queryKey: keys.threads(orgId) });
    },
  });
}

/** What the agent runs without asking ("Aprovar sempre"), on its page. */
export const useApprovalRules = (orgId: string, agentId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.approvalRules(orgId, agentId),
    queryFn: () => api.approvals.rules(orgId, agentId),
    staleTime: 30_000,
  });
};

export function useRemoveApprovalRule(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => api.approvals.removeRule(orgId, agentId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.approvalRules(orgId, agentId) }),
  });
}

/** "Quem aprova por mim" (ADR 0139): who covers me, and whom I cover. */
export const useApprovalCovers = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.approvalCovers(orgId), queryFn: () => api.approvals.covers(orgId) });
};

/** Chooses who covers me (`input`), or with null ends it. */
export function useSetApprovalCover(orgId: string, meId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApprovalCoverInput | null) => {
      if (input) return api.approvals.setCover(orgId, input);
      await api.approvals.endCover(orgId, meId);
      return null;
    },
    onSuccess: (covers) =>
      covers
        ? qc.setQueryData(keys.approvalCovers(orgId), covers)
        : qc.invalidateQueries({ queryKey: keys.approvalCovers(orgId) }),
  });
}

/** "Não quero cobrir": I stop covering `userId`. */
export function useDeclineApprovalCover(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.approvals.endCover(orgId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.approvalCovers(orgId) }),
  });
}

/** "O Gerente aprova por você" (ADR 0139 §2). */
export const useRightHandApprovals = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.rightHandApprovals(orgId), queryFn: () => api.approvals.rightHand(orgId) });
};

/** Saves a change at once, shown before the answer (a switch, a box, the budget, the guidance). */
export function useSetRightHandApprovals(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.rightHandApprovals(orgId);
  return useMutation({
    mutationFn: (input: RightHandApprovalsInput) => api.approvals.setRightHand(orgId, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<RightHandApprovals>(key);
      if (before) qc.setQueryData<RightHandApprovals>(key, { ...before, ...input });
      return { before };
    },
    onError: (_e, _input, ctx) => ctx?.before && qc.setQueryData(key, ctx.before),
    onSuccess: (next) => qc.setQueryData(key, next),
  });
}

/** Desfazer on a card the right hand approved: the card says "Desfeito por …" when its event arrives. */
export function useUndoRightHand(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decisionId: string) => api.approvals.undoRightHand(orgId, decisionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      void qc.invalidateQueries({ queryKey: keys.rightHandApprovals(orgId) });
    },
  });
}

/** `card.delegate`: what the right hand did with a card, on the message in the cache. */
export function cacheCardDelegate(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  where: { channelId: string; messageId: string },
  delegate: CardDelegate | null,
) {
  cacheMessageMeta(qc, orgId, where.channelId, where.messageId, (meta) => ({
    actionCard: { ...(meta.actionCard as Record<string, unknown> | undefined), delegate },
  }));
}

// ── Connectors and agent scopes ─────────────────────────────────────────────

export const useCatalog = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.catalog, queryFn: () => api.connectors.catalog(), staleTime: 10 * 60_000 });
};

export const useConnections = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.connections(orgId),
    queryFn: () => api.connectors.list(orgId),
    staleTime: 30_000,
    enabled,
  });
};

export function useConnectWithKey(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { connector: string; apiKey: string; label?: string }) =>
      api.connectors.connectWithKey(orgId, input),
    // A new connection is every agent's: their access trees change too, and so do the repositories GitHub reaches.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.connections(orgId) }),
        qc.invalidateQueries({ queryKey: keys.access(orgId) }),
        qc.invalidateQueries({ queryKey: keys.githubRepos(orgId) }),
      ]),
  });
}

export function useStartOAuth(orgId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: ({ connector, returnTo }: { connector: string; returnTo: string }) =>
      api.connectors.startOAuth(orgId, connector, { returnTo }),
  });
}

/**
 * Renames a connection (any kind). Its lists and every agent's access tree show the name. A 409 (`connector.label_taken`)
 * is the form's to say, not a toast.
 */
export function useRenameConnection(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => api.connectors.rename(orgId, id, label),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.connections(orgId) }),
        qc.invalidateQueries({ queryKey: keys.customServers(orgId) }),
        qc.invalidateQueries({ queryKey: keys.access(orgId) }),
      ]),
    meta: { silent: true },
  });
}

/** Where the phone app's OAuth lands: the callback hands `state` and `code` back to the app. */
export const APP_OAUTH_RETURN = "app:connectors";

/** The phone app (see `APP_OAUTH_RETURN`) or the desktop app's window finishes an authorization it started. */
export function useCompleteOAuth(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { state: string; code: string }) => api.connectors.completeOAuth(orgId, input),
    // Its callers say why it failed in words of their own (oauthReturnText on the web), once.
    meta: { silent: true },
    // It may finish a catalog connection or a server connected by address (their own list), every agent's.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.connections(orgId) }),
        qc.invalidateQueries({ queryKey: keys.customServers(orgId) }),
        qc.invalidateQueries({ queryKey: keys.access(orgId) }),
        qc.invalidateQueries({ queryKey: keys.githubRepos(orgId) }),
      ]),
  });
}

export const useGitHubApp = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.githubApp(orgId),
    queryFn: () => api.githubApp.info(orgId),
    enabled,
    staleTime: 30_000,
  });
};

export function useInstallGitHubApp(orgId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (returnTo: string) => api.githubApp.install(orgId, returnTo) });
}

/**
 * What changes with the organization's installations: the app's list, its GitHub connection (the app alone is one),
 * the repositories it reaches, and every agent's grants (a first installation gives them, the last one takes them).
 */
const githubAppChanged = (qc: QueryClient, orgId: string) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.githubApp(orgId) }),
    qc.invalidateQueries({ queryKey: keys.connections(orgId) }),
    qc.invalidateQueries({ queryKey: keys.githubRepos(orgId) }),
    qc.invalidateQueries({ queryKey: keys.access(orgId) }),
  ]);

/** The phone finishes an install it opened in the browser (`APP_OAUTH_RETURN`). */
export function useCompleteGitHubApp(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { state: string; code: string; installationId: number }) =>
      api.githubApp.complete(orgId, input),
    // Its callers say why it failed in words of their own (oauthReturnText), once.
    meta: { silent: true },
    onSuccess: () => githubAppChanged(qc, orgId),
  });
}

/** The server's owner starts making this server's GitHub App: the page to open, which sends the manifest to GitHub. */
export function useStartGitHubAppManifest() {
  const api = useApi();
  return useMutation({ mutationFn: (returnTo: string) => api.githubApp.startManifest(returnTo) });
}

/** The server's owner removes the app made from Settings: every workspace's view of it changes. */
export function useRemoveGitHubAppSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.githubApp.removeSettings(),
    onSuccess: () =>
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "org" && q.queryKey[2] === "github-app" }),
  });
}

/** The repositories the organization's GitHub reaches (the picker of an agent's repositories). */
export const useGitHubRepos = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.githubRepos(orgId),
    queryFn: () => api.githubApp.repositories(orgId),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
};

/** The organizations GitHub lets us reach. Read again on every return to the tab: they're granted on GitHub's own page. */
export const useGithubAccess = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.githubAccess(orgId),
    queryFn: () => api.githubApp.access(orgId),
    enabled,
    refetchOnWindowFocus: "always",
    retry: false,
  });
};

/** The GitHub repositories an agent may use, in order (empty = every repository). */
export const useAgentRepos = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentRepos(orgId, agentId),
    queryFn: () => api.repositories.get(orgId, agentId),
    enabled,
    retry: false,
  });
};

/** Where the agent merges with no approval card ("Pode fazer merge sem perguntar"). */
export const useAgentMergeRepos = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentMergeRepos(orgId, agentId),
    queryFn: () => api.repositories.merge(orgId, agentId),
    enabled,
    retry: false,
  });
};

export function useSetAgentMergeRepos(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repositories: string[]) => api.repositories.setMerge(orgId, agentId, repositories),
    onSuccess: (repositories) => qc.setQueryData(keys.agentMergeRepos(orgId, agentId), repositories),
  });
}

export function useRemoveGitHubApp(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.githubApp.remove(orgId, id),
    onSuccess: () => githubAppChanged(qc, orgId),
  });
}

export function useDisconnect(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => api.connectors.disconnect(orgId, connectionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.connections(orgId) });
      void qc.invalidateQueries({ queryKey: keys.githubRepos(orgId) });
      // GitHub through the app alone goes with its installations.
      void qc.invalidateQueries({ queryKey: keys.githubApp(orgId) });
      // Agents lose the scopes of that connection.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "org" && q.queryKey[4] === "scopes" });
    },
  });
}

export const useAgentScopes = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.scopes(orgId, agentId), queryFn: () => api.scopes.get(orgId, agentId), enabled });
};

// ── Mailboxes (ADR 0038) ────────────────────────────────────────────────────

/** Which ways in this server offers (Gmail/Outlook, IMAP) and the IMAP presets. */
export const useMailProviders = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.mailProviders(orgId),
    queryFn: () => api.mail.providers(orgId),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
};

/** The organization's mailboxes (no passwords), with the agents that use each. */
export const useMailAccounts = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.mailAccounts(orgId),
    queryFn: () => api.mail.accounts(orgId),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
};

/** A mailbox's folders (the rules' and routines' folder pickers). */
export const useMailFolders = (orgId: string, accountId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.mailFolders(orgId, accountId ?? ""),
    queryFn: () => api.mail.folders(orgId, accountId ?? ""),
    enabled: Boolean(accountId),
    staleTime: 5 * 60_000,
    retry: false,
  });
};

/** Addresses a mailbox has sent from: what the addresses screen offers. */
export const useMailSuggestedAddresses = (orgId: string, accountId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.mailSuggested(orgId, accountId ?? ""),
    queryFn: () => api.mail.suggestedAddresses(orgId, accountId ?? ""),
    enabled: Boolean(accountId),
    staleTime: 5 * 60_000,
    retry: false,
  });
};

/** An agent's access and rules per mailbox. */
export const useAgentMail = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentMail(orgId, agentId),
    queryFn: () => api.mail.agent(orgId, agentId),
    enabled,
    retry: false,
  });
};

/** Connect, rename or reconnect, and disconnect a mailbox; each refreshes every mailbox read. */
export function useMailAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.mail(orgId) });
  return {
    connectImap: useMutation({
      mutationFn: (input: MailImapInput) => api.mail.connectImap(orgId, input),
      onSuccess: done,
      // The form says why (wrong password, server not found…).
      meta: { silent: true },
    }),
    connectComposio: useMutation({
      mutationFn: (input: { provider: "gmail" | "outlook"; label?: string; accountId?: string; desktop?: boolean }) =>
        api.mail.connectComposio(orgId, input),
    }),
    update: useMutation({
      mutationFn: ({ accountId, ...input }: MailAccountUpdate & { accountId: string }) =>
        api.mail.update(orgId, accountId, input),
      onSuccess: done,
      meta: { silent: true },
    }),
    disconnect: useMutation({
      mutationFn: (accountId: string) => api.mail.disconnect(orgId, accountId),
      onSuccess: () => {
        void done();
        // Routines watching it and agents' rules change with it.
        void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
      },
    }),
  };
}

/** Saves an agent's level and rules for one mailbox. */
export function useSetAgentMail(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, accountId, input }: { agentId: string; accountId: string; input: AgentMailboxInput }) =>
      api.mail.setAgent(orgId, agentId, accountId, input),
    // The rules panel shows the error next to the rules.
    meta: { silent: true },
    onSuccess: (saved, { agentId }) => {
      qc.setQueryData<AgentMailbox[]>(keys.agentMail(orgId, agentId), (list) =>
        list ? list.map((m) => (m.accountId === saved.accountId ? saved : m)) : list,
      );
      void qc.invalidateQueries({ queryKey: keys.mailAccounts(orgId) });
      void qc.invalidateQueries({ queryKey: keys.scopes(orgId, agentId) });
    },
  });
}

// ── Management (phase 4) ────────────────────────────────────────────────────

export const useOverview = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.overview(orgId), queryFn: () => api.orgs.overview(orgId), staleTime: 30_000 });
};

/**
 * Whether the workspace bills per use (`workspaceUsesApi`): only then a screen shows a budget, the API per agent or
 * what the API cost. False while loading, so a workspace on plans alone never shows a budget that then leaves.
 */
export function useWorkspaceUsesApi(orgId: string) {
  const overview = useOverview(orgId).data;
  const agents = useAgents(orgId).data ?? [];
  const ai = useAiStatus(orgId).data;
  return workspaceUsesApi(agents, ai, overview?.budgetUsedPercent ?? 0);
}

export const useSettings = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.settings(orgId), queryFn: () => api.orgs.settings(orgId) });
};

export function useUpdateSettings(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<ApiClient["orgs"]["updateSettings"]>[1]) => api.orgs.updateSettings(orgId, input),
    onSuccess: (settings) => {
      qc.setQueryData(keys.settings(orgId), settings);
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: keys.overview(orgId) });
      // The default agent budget moves every percentage that follows it.
      void qc.invalidateQueries({ queryKey: keys.usageReport(orgId) });
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      // A new GIF rating (or GIFs back on) changes what every search finds (ADR 0091).
      void qc.invalidateQueries({ queryKey: keys.gifs(orgId) });
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "org" && q.queryKey[1] === orgId && q.queryKey[4] === "detail",
      });
    },
  });
}

export const usePeople = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.people(orgId), queryFn: () => api.orgs.people(orgId), staleTime: 30_000 });
};

/**
 * Your availability and line (ADR 0084), shown at once in the people (yours is the only row that changes);
 * the server's answer replaces it, and everyone else's list follows on `member.status`.
 */
export function useSetMyStatus(orgId: string, userId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StatusInput) => api.orgs.setStatus(orgId, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.people(orgId) });
      const before = qc.getQueryData<Person[]>(keys.people(orgId));
      qc.setQueryData<Person[]>(keys.people(orgId), (people) =>
        people?.map((p) => (p.userId === userId ? withStatus(p, input) : p)),
      );
      return { before };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.people(orgId), ctx.before);
    },
    onSuccess: (me) => {
      qc.setQueryData<Person[]>(keys.people(orgId), (people) => people?.map((p) => (p.userId === me.userId ? me : p)));
    },
  });
}

/** What opens when the app starts here (ADR 0108): in `me` at once, back as it was if the server refuses. */
export function useSetStart(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const put = (start: StartChoice) =>
    qc.setQueryData<Me | null>(keys.me, (me) =>
      me ? { ...me, organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, start } : o)) } : me,
    );
  return useMutation({
    mutationFn: (input: StartChoice) => api.orgs.setStart(orgId, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.me });
      const before = qc.getQueryData<Me | null>(keys.me);
      put(input);
      return { before };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.before !== undefined) qc.setQueryData(keys.me, ctx.before);
    },
    onSuccess: put,
  });
}

/** Shows or hides what agents did under each reply, for me in this workspace: the switch moves at once. */
export function useSetShowActivity(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const put = (showActivity: boolean) =>
    qc.setQueryData<Me | null>(keys.me, (me) =>
      me ? { ...me, organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, showActivity } : o)) } : me,
    );
  return useMutation({
    mutationFn: (show: boolean) => api.orgs.setShowActivity(orgId, show),
    onMutate: async (show) => {
      await qc.cancelQueries({ queryKey: keys.me });
      const before = qc.getQueryData<Me | null>(keys.me);
      put(show);
      return { before };
    },
    onError: (_e, _show, ctx) => {
      if (ctx?.before !== undefined) qc.setQueryData(keys.me, ctx.before);
    },
    onSuccess: put,
  });
}

/** How agents talk to me in this workspace (ADR 0147): the choice shows at once. */
export function useSetAgentStyle(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const put = (agentStyle: AgentStyle) =>
    qc.setQueryData<Me | null>(keys.me, (me) =>
      me ? { ...me, organizations: me.organizations.map((o) => (o.id === orgId ? { ...o, agentStyle } : o)) } : me,
    );
  return useMutation({
    mutationFn: (style: AgentStyle) => api.orgs.setAgentStyle(orgId, style),
    onMutate: async (style) => {
      await qc.cancelQueries({ queryKey: keys.me });
      const before = qc.getQueryData<Me | null>(keys.me);
      put(style);
      return { before };
    },
    onError: (_e, _style, ctx) => {
      if (ctx?.before !== undefined) qc.setQueryData(keys.me, ctx.before);
    },
    onSuccess: put,
  });
}

/** How conversations look to me in this workspace, on every device: the choice shows at once. */
export function useSetChatPrefs(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const put = (patch: ChatPrefs) =>
    qc.setQueryData<Me | null>(keys.me, (me) =>
      me
        ? {
            ...me,
            organizations: me.organizations.map((o) =>
              o.id === orgId ? { ...o, chatPrefs: { ...o.chatPrefs, ...patch } } : o,
            ),
          }
        : me,
    );
  return useMutation({
    mutationFn: (patch: ChatPrefs) => api.orgs.setChatPrefs(orgId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.me });
      const before = qc.getQueryData<Me | null>(keys.me);
      put(patch);
      return { before };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.before !== undefined) qc.setQueryData(keys.me, ctx.before);
    },
    onSuccess: put,
  });
}

/** Your own row with a status change applied, as the server will answer it. */
function withStatus(p: Person, input: StatusInput): Person {
  const presence = input.availability === undefined ? p.presence : AVAILABILITY_PRESENCE[input.availability];
  const status =
    input.status === undefined
      ? p.status
      : input.status?.text.trim()
        ? { text: input.status.text.trim(), emoji: input.status.emoji ?? null, until: input.status.until ?? null }
        : null;
  const availability = input.availability ?? p.availability;
  return {
    ...p,
    presence,
    online: presence !== "offline" && presence !== "hidden",
    status,
    ...(availability ? { availability } : {}),
  };
}

/** How you appear for what you picked (to yourself: hidden stays hidden). */
const AVAILABILITY_PRESENCE = { auto: "online", away: "away", busy: "busy", out: "out", hidden: "hidden" } as const;

/**
 * What an agent picks up when its plan or budget is back (ADR 0118). `agent.status` events refetch it (a row joined,
 * started or ended); while anything waits it also refetches every 30 s, so "Respondendo agora" moves down the line.
 */
export const useUsageQueue = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.usageQueue(orgId, agentId),
    queryFn: () => api.agents.usageQueue(orgId, agentId),
    enabled: enabled && orgId.length > 0 && agentId.length > 0,
    retry: false,
    refetchInterval: (q) => ((q.state.data?.rows.length ?? 0) + (q.state.data?.hidden ?? 0) > 0 ? 30_000 : false),
    meta: { quiet: true },
  });
};

/** "Don't run any" on an agent's usage queue: the queue and the statuses follow. */
export function useCancelUsageQueue(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.agents.cancelUsageQueue(orgId, agentId),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.agentStatus(orgId) }),
  });
}

/**
 * Each agent's presence and line (ADR 0084). Refetched on `agent.status`, and every 30 s: presence also follows
 * time (busy after 2 minutes on one run, away after 30 idle) and runs elsewhere in the workspace.
 */
export const useAgentStatuses = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentStatus(orgId),
    queryFn: () => api.agents.statuses(orgId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: enabled && orgId.length > 0,
  });
};

/**
 * Whether the team answered the person once (`teamAnswered`), from the agents' statuses the sidebar keeps fresh: no
 * poll of its own.
 */
export const useTeamAnswered = (orgId: string, team: readonly Pick<Agent, "id">[]) => {
  const api = useApi();
  const statuses = useQuery({
    queryKey: keys.agentStatus(orgId),
    queryFn: () => api.agents.statuses(orgId),
    staleTime: 15_000,
    enabled: orgId.length > 0,
  }).data;
  return teamAnswered(team, statuses);
};

export const useAllInvitations = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.allInvitations(orgId), queryFn: () => api.orgs.allInvitations(orgId), enabled });
};

export function useInviteMany(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteBatch) => api.orgs.inviteMany(orgId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

/** What a pending invitation gives (ADR 0090, 0184): its cargos, channels and agents. The same link, nothing is sent. */
export function useUpdateInvitation(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...change }: { id: string; roleIds?: string[]; channelIds?: string[]; agentIds?: string[] }) =>
      api.orgs.updateInvitation(orgId, id, change),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

/** 30 more days for the same link (ADR 0090). */
export function useRenewInviteLink(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.invites.renewLink(orgId, linkId),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(orgId) }),
  });
}

/** A member's suggestions that still wait (ADR 0090). */
export const useMySuggestions = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.mySuggestions(orgId), queryFn: () => api.joinRequests.mine(orgId), enabled });
};

/**
 * A member suggests someone to the people who may invite (ADR 0090). Its refusals are about the person suggested
 * (`join.member`: they're in already), so the screen says them in its own words, never the generic toast's.
 */
export function useSuggestPerson(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; note?: string }) => api.joinRequests.suggest(orgId, input),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

export function useCancelSuggestion(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.joinRequests.cancel(orgId, id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

export function useResendInvitation(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.orgs.resendInvitation(orgId, invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

/** The workspace's invitation links (admins, ADR 0068). */
export const useInviteLinks = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.inviteLinks(orgId), queryFn: () => api.invites.links(orgId), enabled });
};

/** "Make a link": the active one, or a new one; with choices, a link of its own (ADR 0184). */
export function useMakeInviteLink(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (choices?: InviteLinkChoices) => api.invites.createLink(orgId, choices),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(orgId) }),
  });
}

/** "Editar link" (ADR 0184): what it gives, at the same address. */
export function useEditInviteLink(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...choices }: InviteLinkChoices & { id: string }) => api.invites.editLink(orgId, id, choices),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.inviteLinks(orgId) }),
  });
}

/** Turning a link off closes its requests too: the links, the requests and the pending list refresh. */
export function useTurnOffInviteLink(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.invites.turnOff(orgId, linkId),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

/**
 * Requests to join waiting for an answer (admins, ADR 0068). Refreshed on focus, after each answer and when a
 * `join_request` notice arrives (`applyNotificationEvent`).
 */
export const useJoinRequests = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.joinRequests(orgId),
    queryFn: () => api.joinRequests.list(orgId),
    enabled,
    refetchOnWindowFocus: true,
  });
};

/**
 * Whoever got in shows in the people and in the workspace's counts (the sidebar's "2 members"); an invitation, in
 * the pending list. Refetched after a refusal too.
 */
function refreshAnswered(qc: QC, orgId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
    qc.invalidateQueries({ queryKey: keys.people(orgId) }),
    qc.invalidateQueries({ queryKey: keys.members(orgId) }),
    qc.invalidateQueries({ queryKey: keys.overview(orgId) }),
  ]);
}

export function useApproveJoinRequest(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; roleIds?: string[]; channelIds?: string[]; agentIds?: string[] }) =>
      input.channelIds || input.agentIds
        ? api.joinRequests.approve(orgId, input.id, input.roleIds, {
            channelIds: input.channelIds,
            agentIds: input.agentIds,
          })
        : api.joinRequests.approve(orgId, input.id, input.roleIds),
    onSettled: () => refreshAnswered(qc, orgId),
  });
}

export function useDenyJoinRequest(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) => api.joinRequests.deny(orgId, input.id, input.reason),
    onSettled: () => refreshAnswered(qc, orgId),
  });
}

export const useUsageReport = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.usageReport(orgId), queryFn: () => api.orgs.usageReport(orgId), enabled });
};

/** The workspace's Composio calls this month (Uso, and Conectores past 80%). */
export const useComposioUsage = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.composioUsage(orgId),
    queryFn: () => api.connectors.composioUsage(orgId),
    enabled,
    staleTime: 60_000,
  });
};

/** Configurações › Auditoria: pages of 50, newest first (admins). */
export function useAudit(orgId: string, query: AuditQuery, enabled = true) {
  const api = useApi();
  return useInfiniteQuery({
    enabled,
    queryKey: keys.audit(orgId, query),
    queryFn: ({ pageParam }) => api.orgs.audit(orgId, { ...query, ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (page) => page.next ?? undefined,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

/**
 * One row of the audit log already on screen (the phone's detail screen, pushed over the list): read from the
 * pages loaded for any filter; null when none holds it.
 */
export function useAuditRow(orgId: string, id: string): AuditRow | null {
  const qc = useQueryClient();
  const pages = qc.getQueriesData<InfiniteData<AuditPage>>({ queryKey: ["org", orgId, "audit"] });
  for (const [, data] of pages) {
    const row = data?.pages.flatMap((p) => p.rows).find((r) => r.id === id);
    if (row) return row;
  }
  return null;
}

/** Configurações › Uso: every plan account by computer and the API per agent (ADR 0063). */
export const usePlanUsage = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.planUsage(orgId), queryFn: () => api.orgs.planUsage(orgId) });
};

/** Uso › Pessoas (ADR 0141): each person's use; "Agora" stays live while the page is open. */
export const usePeopleUsage = (orgId: string, period: { since?: string; until?: string } = {}, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.peopleUsage(orgId, period),
    queryFn: () => api.orgs.peopleUsage(orgId, period),
    enabled,
    // ponytail: "Agora" polls; the runs' realtime events could refresh it instead.
    refetchInterval: 15_000,
  });
};

/** A person's month (the drawer), or one's own ("Seu uso", in percentages). */
export const usePersonUsage = (orgId: string, userId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.personUsage(orgId, userId ?? ""),
    queryFn: () => api.orgs.personUsage(orgId, userId as string),
    enabled: !!userId,
  });
};

export const usePersonLimits = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.personLimits(orgId), queryFn: () => api.orgs.personLimits(orgId), enabled });
};

/** Saving limits, raising or refusing moves every meter of Uso › Pessoas. */
const usePeopleUsageMutation = <A extends unknown[], R>(orgId: string, run: (...args: A) => Promise<R>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => run(...args),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org", orgId, "people-usage"] }),
  });
};

export const useSetPersonLimits = (orgId: string) => {
  const api = useApi();
  return usePeopleUsageMutation(orgId, (limits: PersonLimits) => api.orgs.setPersonLimits(orgId, limits));
};

export const useRaisePersonLimit = (orgId: string) => {
  const api = useApi();
  return usePeopleUsageMutation(orgId, (userId: string, limitUsd: number) =>
    api.orgs.raisePersonLimit(orgId, userId, limitUsd),
  );
};

export const useRefuseMoreUsage = (orgId: string) => {
  const api = useApi();
  return usePeopleUsageMutation(orgId, (userId: string) => api.orgs.refuseMoreUsage(orgId, userId));
};

/** What Lodi does for me by itself: when its daily and weekly cards come, and its other switches (ADR 0137 §9). */
export const useTeamWeekPrefs = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.teamWeek(orgId), queryFn: () => api.orgs.teamWeek(orgId), enabled });
};

export const useSetTeamWeekPrefs = (orgId: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    // A server from before the two cards is saved in the words it knows: it would drop these and answer 200.
    mutationFn: (patch: LodiPrefsPatch) =>
      api.orgs.setTeamWeek(
        orgId,
        qc.getQueryData<LodiPrefs>(keys.teamWeek(orgId))?.legacy ? legacyPatch(patch) : patch,
      ),
    onSuccess: (prefs) => qc.setQueryData(keys.teamWeek(orgId), prefs),
  });
};

/** A row of my weekly card, or "Agora não": the card comes back changed through its message's event. */
export const useActOnTeamWeek = (orgId: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, act }: { messageId: string; act: TeamWeekAct }) =>
      api.orgs.actOnTeamWeek(orgId, messageId, act),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.routines(orgId) }),
  });
};

/** The agent's "Uso" tab: its month by account and day, and the account it thinks with now. */
export const useAgentPlanUsage = (orgId: string, agentId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentPlanUsage(orgId, agentId),
    queryFn: () => api.agents.planUsage(orgId, agentId),
  });
};

export const usePlatformKey = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.platformKey(orgId),
    queryFn: () => api.agents.platformKeyAvailable(orgId),
    staleTime: 10 * 60_000,
  });
};

/**
 * Whether each agent has an AI to think with (the no-AI banner, card and chip). `pollMs` where no socket is open
 * (the onboarding), a time or one picked from the last answer.
 */
export const useAiStatus = (
  orgId: string,
  enabled = true,
  pollMs: number | false | ((status: AiStatus | undefined) => number | false) = false,
) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.aiStatus(orgId),
    queryFn: () => api.agents.aiStatus(orgId),
    staleTime: 30_000,
    enabled: enabled && orgId.length > 0,
    refetchInterval: typeof pollMs === "function" ? (query) => pollMs(query.state.data) : pollMs,
  });
};

/**
 * The AI status as read after `waiting` turned true (it is read again then), undefined until it is: one kept from
 * before something started waiting for an AI may still call its agent ready, and a build asked on it is only refused.
 */
export function useAiStatusSince(orgId: string, waiting: boolean): AiStatus | undefined {
  const status = useAiStatus(orgId, waiting);
  const [since, setSince] = useState<number | null>(null);
  const { refetch } = status;
  useEffect(() => {
    if (!waiting) {
      setSince(null);
      return;
    }
    setSince(Date.now());
    void refetch({ cancelRefetch: false });
  }, [waiting, refetch]);
  return since !== null && status.dataUpdatedAt >= since ? status.data : undefined;
}

export function useRotateCredential(orgId: string, silent = false) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent },
    mutationFn: ({ id, apiKey }: { id: string; apiKey: string }) => api.agents.rotateCredential(orgId, id, { apiKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.credentials(orgId) }),
  });
}

export function useRemoveCredential(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, purge, release }: { id: string; purge?: boolean; release?: boolean }) =>
      api.agents.removeCredential(orgId, id, purge, release),
    // `aiStatus` lives under `credentials`; the agents that used it have no key of their own now.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      void qc.invalidateQueries({ queryKey: keys.agentPages(orgId) });
      return qc.invalidateQueries({ queryKey: keys.credentials(orgId) });
    },
  });
}

export const useAgentDetail = (orgId: string, agentId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentDetail(orgId, agentId),
    queryFn: () => api.agents.detail(orgId, agentId),
    staleTime: 15_000,
  });
};

/** An agent's runs this month (newest first). */
export const useRuns = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.runs(orgId, agentId),
    queryFn: () => api.agents.runs(orgId, { agentId, limit: 200 }),
    enabled,
  });
};

export const useRun = (orgId: string, runId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.run(orgId, runId ?? ""),
    queryFn: () => api.agents.run(orgId, runId ?? ""),
    enabled: runId !== null,
  });
};

/**
 * The questions agents asked other agents from a conversation (`GET …/consultations`), for the block inside the
 * reply that asked. The page reloads it on `agent.consulting`, `agent.consulted` and `agent.consultation`; while a
 * question is out it also reloads every `CONSULT_GROUP_POLL_MS`.
 */
export const useConsultations = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.consultations(orgId, channelId),
    queryFn: () => api.agents.consultations(orgId, channelId),
    enabled,
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === "open") ? CONSULT_GROUP_POLL_MS : false),
  });
};

/**
 * One of those questions opened beside the conversation (`GET …/consultations/{id}`). The agents' DM sends this
 * page no events: while the question is out it reloads every `CONSULT_CONVERSATION_POLL_MS`, and with the list
 * (its key sits under the list's) on every consult event.
 */
const consultationQuery = (
  api: ReturnType<typeof useApi>,
  orgId: string,
  channelId: string,
  consultationId: string | null,
) => ({
  queryKey: keys.consultation(orgId, channelId, consultationId ?? ""),
  // The relay line the server opens a mention to an agent outside the conversation with is the agent's, not people's.
  queryFn: async () => {
    const talk = await api.agents.consultation(orgId, channelId, consultationId ?? "");
    return talk && { ...talk, ...forPeople(talk) };
  },
  enabled: consultationId !== null,
  refetchInterval: (q: { state: { data?: { consultation: { status: string } } | null } }) =>
    q.state.data?.consultation.status === "open" ? CONSULT_CONVERSATION_POLL_MS : false,
});

export const useConsultationConversation = (orgId: string, channelId: string, consultationId: string | null) => {
  const api = useApi();
  return useQuery(consultationQuery(api, orgId, channelId, consultationId));
};

/** Stable, so `useQueries` keeps the same list while no conversation changed. */
const messagesOfTalks = (results: { data?: { messages: Message[] } | null }[]) =>
  results.flatMap((r) => r.data?.messages ?? []);

/**
 * What a pair row opens: the question's own conversation (`useConsultationConversation`) with the rest of its
 * exchange (`exchangeIds`: the other questions and hand-offs between the same two agents its row stands for), one
 * conversation, oldest first.
 */
export const useExchangeConversation = (orgId: string, channelId: string, consultationId: string | null) => {
  const api = useApi();
  const own = useConsultationConversation(orgId, channelId, consultationId);
  const list = useConsultations(orgId, channelId, consultationId !== null);
  const others = useMemo(
    () => (consultationId ? exchangeIds(list.data ?? [], consultationId).filter((id) => id !== consultationId) : []),
    [list.data, consultationId],
  );
  const rest = useQueries({
    queries: others.map((id) => consultationQuery(api, orgId, channelId, id)),
    combine: messagesOfTalks,
  });
  const data = useMemo(() => {
    if (!own.data || rest.length === 0) return own.data;
    const byId = new Map([...own.data.messages, ...rest].map((m) => [m.id, m]));
    return {
      ...own.data,
      messages: [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    };
  }, [own.data, rest]);
  return { ...own, data };
};

export const useRoster = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.roster(orgId, channelId),
    queryFn: async ({ client }) => {
      const roster = await api.chat.roster(orgId, channelId);
      readUnknownMembers(client, orgId, roster);
      return roster;
    },
    enabled,
    staleTime: 30_000,
    ...BACK_TO_TAB,
  });
};

/** A channel's exceptions (ADR 0134), for who manages it. */
export const useChannelPermissions = (orgId: string, channelId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.channelPermissions(orgId, channelId),
    queryFn: () => api.chat.permissions(orgId, channelId),
    enabled,
  });
};

/**
 * Sets one exception of a channel, at once on screen (the three-state control keeps its focus under the arrow keys),
 * one save at a time in order; then its list and everyone's channel list (`can`) refetch.
 */
export function useSetChannelPermission(orgId: string, channelId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.channelPermissions(orgId, channelId);
  return useMutation({
    scope: { id: `channel-permissions:${channelId}` },
    mutationFn: (override: ChannelOverride) => api.chat.setPermission(orgId, channelId, override),
    onMutate: async (override) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<ChannelOverride[]>(key);
      const rest = (before ?? []).filter(
        (o) => o.target.type !== override.target.type || o.target.id !== override.target.id,
      );
      const empty = override.allow.length === 0 && override.deny.length === 0;
      qc.setQueryData<ChannelOverride[]>(key, empty ? rest : [...rest, override]);
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
    },
  });
}

export function useUpdateChannel(orgId: string, channelId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChannelInput & { name?: string }) => api.chat.update(orgId, channelId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

/** Archives a channel (creator or admin): it leaves the list. */
export function useArchiveChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.chat.archive(orgId, channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

/** The archived channels the viewer may bring back (`enabled`: only where they're offered). */
export const useArchivedChannels = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.archivedChannels(orgId),
    queryFn: () => api.chat.archived(orgId),
    enabled,
    staleTime: 60_000,
  });
};

/** "Restaurar" an archived channel: back in everyone's list as it was. */
export function useUnarchiveChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.chat.unarchive(orgId, channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

/** "Sair do canal": it leaves my list, or stays in it to join again when it is public. */
export function useLeaveChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.chat.leave(orgId, channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

/** "Apagar canal" (owners and admins): `name` as the person typed it. */
export function useDeleteChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, name }: { channelId: string; name: string }) =>
      api.chat.deleteChannel(orgId, channelId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

// ── Direct messages ─────────────────────────────────────────────────────────

export const useDms = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.dms(orgId),
    queryFn: () => api.dms.list(orgId),
    staleTime: 30_000,
    ...BACK_TO_TAB,
  });
};

/** "Visto" in a DM between people: where the others stopped reading (live: `channel.read`). */
export function useDmReads(orgId: string, channelId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: keys.dmReads(orgId, channelId),
    queryFn: () => api.dms.reads(orgId, channelId),
    enabled,
    staleTime: 60_000,
  });
}

/** `channel.read`: someone in a DM read up to a moment ("Visto" moves). */
export function cacheDmRead(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  event: { channelId: string; userId: string; lastReadAt: string },
) {
  qc.setQueryData<DmRead[]>(keys.dmReads(orgId, event.channelId), (reads) =>
    withRead(reads, { userId: event.userId, lastReadAt: event.lastReadAt }),
  );
}

// ── Knowledge (phase 5) ─────────────────────────────────────────────────────

/** A search; with `filters` (ADR 0123) it runs with no words too, as long as one filter is set. */
export const useSearch = (orgId: string, q: string, kinds: SearchKind[], filters?: SearchFilterInput) => {
  const api = useApi();
  const text = q.trim();
  const filtered = Object.keys(filters ?? {}).some((k) => k !== "sort");
  return useQuery({
    queryKey: [...keys.search(orgId, text, kinds.join(",")), filters ?? null],
    queryFn: () => api.search.query(orgId, { q: text, kinds, limit: filters ? 100 : 50, filters }),
    enabled: text.length > 0 || filtered,
    placeholderData: (previous) => previous,
  });
};

/** Reactions on one message, loaded when its actions are shown or used. */
export const useReactions = (orgId: string, messageId: string, enabled: boolean) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.reactions(orgId, messageId),
    queryFn: () => api.chat.reactions(orgId, messageId),
    enabled,
    staleTime: 30_000,
  });
};

export function useToggleReaction(orgId: string, messageId: string) {
  const api = useApi();
  const onAgentReaction = useAgentReaction();
  const qc = useQueryClient();
  const meId = useMe().data?.user.id;
  const mutationKey = ["reaction", orgId, messageId];
  const queryKey = keys.reactions(orgId, messageId);
  return useMutation({
    mutationKey,
    mutationFn: ({ reaction, on }: { reaction: string; on: boolean }) =>
      on ? api.chat.react(orgId, messageId, reaction) : api.chat.unreact(orgId, messageId, reaction),
    // The pill shows at once; a refused reaction goes back to what was there.
    onMutate: ({ reaction, on }) => {
      if (!meId) return undefined;
      void qc.cancelQueries({ queryKey });
      const before = knownReactions(qc, orgId, messageId);
      applyReactions(qc, orgId, messageId, setMyReaction(before, reaction, meId, on), onAgentReaction);
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context) qc.setQueryData(queryKey, context.before);
    },
    // An earlier answer mustn't undo a later tap (👍 then 👎 is two calls): only the last one in flight is the truth.
    onSuccess: (reactions) => {
      if (qc.isMutating({ mutationKey }) <= 1) applyReactions(qc, orgId, messageId, reactions, onAgentReaction);
    },
  });
}

/** A message's reactions as this client knows them: the reactions cache, else the message in a cached list. */
function knownReactions(qc: ReturnType<typeof useQueryClient>, orgId: string, messageId: string) {
  const cached = qc.getQueryData<ReactionCount[]>(keys.reactions(orgId, messageId));
  if (cached) return cached;
  for (const [, data] of qc.getQueriesData({ queryKey: ["org", orgId, "channel"] })) {
    if (!Array.isArray(data)) continue;
    const m = (data as Message[]).find((x) => x && x.id === messageId);
    if (m) return m.reactions ?? [];
  }
  return [];
}

/**
 * New reactions for a message (the reactor's response or `message.reactions`,
 * whichever comes first): the pills, and when a person just gave 👍/👎 the
 * agent who wrote it makes a face for everyone watching (`onAgentReaction`, the
 * web's `playAgentReaction`: only agent messages' avatars carry the message id
 * as their reaction key).
 */
export function applyReactions(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  messageId: string,
  next: ReactionCount[],
  onAgentReaction?: AgentReactionEffect,
) {
  const before = knownReactions(qc, orgId, messageId);
  for (const [reaction, kind] of [
    ["+1", "up"],
    ["-1", "down"],
  ] as const) {
    const had = new Set(before.find((r) => r.reaction === reaction)?.userIds ?? []);
    if (onAgentReaction && next.find((r) => r.reaction === reaction)?.userIds.some((u) => !had.has(u)))
      onAgentReaction(messageId, kind);
  }
  qc.setQueryData(keys.reactions(orgId, messageId), next);
}

/**
 * `message.pinned` / `message.unpinned` (and "Fixar" / "Desafixar" optimistically): the message's pin mark in every
 * cached list of that channel (timeline and threads).
 */
export function cachePinned(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
  messageId: string,
  pinned: boolean,
) {
  qc.setQueriesData({ queryKey: ["org", orgId, "channel", channelId] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    const list = data as Message[];
    if (!list.some((m) => m && m.id === messageId)) return data;
    return list.map((m) => (m.id === messageId ? { ...m, pinned } : m));
  });
}

/**
 * `message.actions` (and undo/redo results): an agent message's receipts, in
 * every cached list of that channel (timeline and threads). Replaces the list.
 */
export function cacheMessageActions(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
  messageId: string,
  actions: AgentAction[],
) {
  qc.setQueriesData({ queryKey: ["org", orgId, "channel", channelId] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    const list = data as Message[];
    if (!list.some((m) => m && m.id === messageId)) return data;
    return list.map((m) => (m.id === messageId ? { ...m, actions } : m));
  });
}

/** A long work changed (`agent.work`, ADR 0121): its anchor's cached message carries the new view. */
export function cacheMessageWork(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  channelId: string,
  work: WorkView,
) {
  qc.setQueriesData({ queryKey: ["org", orgId, "channel", channelId] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    const list = data as Message[];
    if (!list.some((m) => m && m.id === work.anchorMessageId)) return data;
    return list.map((m) => (m.id === work.anchorMessageId ? { ...m, longWork: work } : m));
  });
}

/** One receipt changed: put it in its message's cached list (keeps the others). */
function cacheOneAction(qc: ReturnType<typeof useQueryClient>, orgId: string, channelId: string, action: AgentAction) {
  qc.setQueriesData({ queryKey: ["org", orgId, "channel", channelId] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    const list = data as Message[];
    if (!list.some((m) => m && m.id === action.messageId)) return data;
    return list.map((m) =>
      m.id === action.messageId
        ? { ...m, actions: (m.actions ?? []).map((a) => (a.id === action.id ? action : a)) }
        : m,
    );
  });
}

/**
 * Desfazer / Refazer / Desfazer tudo on an agent's receipts. The cached
 * message updates from the answer (the `message.actions` event follows for
 * everyone). Errors are `ApiError` with `code` (`action.changed_since`…):
 * silent for the global handler, the screen says them (`actionErrorKey`).
 */
export function useAgentActions(orgId: string, channelId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const one = (result: AgentAction) => cacheOneAction(qc, orgId, channelId, result);
  return {
    undo: useMutation({
      mutationFn: (actionId: string) => part(api, "actions").undo(orgId, actionId),
      onSuccess: one,
      meta: { silent: true },
    }),
    redo: useMutation({
      mutationFn: (actionId: string) => part(api, "actions").redo(orgId, actionId),
      onSuccess: one,
      meta: { silent: true },
    }),
    undoAll: useMutation({
      mutationFn: (messageId: string) => part(api, "actions").undoMessage(orgId, messageId),
      onSuccess: (result, messageId) => cacheMessageActions(qc, orgId, channelId, messageId, result.actions),
      meta: { silent: true },
    }),
  };
}

export function useCorrectMessage(orgId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) => api.chat.correct(orgId, messageId, body),
  });
}

// ── Invites, custom MCP ─────────────────────────────────────────────────────

export const useCustomServers = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.customServers(orgId), queryFn: () => api.customConnectors.list(orgId), enabled });
};

export function useCustomServerAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.customServers(orgId) });
  return {
    connect: useMutation({
      mutationFn: (input: {
        serverUrl: string;
        apiKey?: string;
        label?: string;
        returnTo: string;
        connectionId?: string;
      }) => api.customConnectors.connect(orgId, input),
      // A new server is every agent's: their access trees change too.
      onSuccess: () => Promise.all([done(), qc.invalidateQueries({ queryKey: keys.access(orgId) })]),
    }),
    refresh: useMutation({ mutationFn: (id: string) => api.customConnectors.refresh(orgId, id), onSuccess: done }),
    save: useMutation({
      mutationFn: ({
        id,
        ...input
      }: {
        id: string;
        label: string;
        tools: { name: string; access: ToolDecision; label: string }[];
      }) => api.customConnectors.saveTools(orgId, id, input),
      onSuccess: done,
    }),
    disconnect: useMutation({
      mutationFn: (id: string) => api.customConnectors.disconnect(orgId, id),
      onSuccess: done,
    }),
  };
}

// ── Memory and proposals (phase 5) ──────────────────────────────────────────

export const useMemory = (orgId: string, agentId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.memory(orgId, agentId), queryFn: () => api.memory.list(orgId, agentId) });
};

/** What all the agents know (the viewer's share of it), for the map of the workspace's memory. */
export const useOrgMemories = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.orgMemories(orgId), queryFn: () => api.memory.listAll(orgId) });
};

/** "O que sabe sobre você": the agent's memories that came from the viewer, each with the message. */
export const useMemoryAboutMe = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.memoryAboutMe(orgId, agentId),
    queryFn: () => api.memory.list(orgId, agentId, { about: "me" }),
    enabled,
  });
};

/** "O que fez por você": the agent's receipts, files and approvals that involve the viewer. */
export function useAgentForYou(orgId: string, agentId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentForYou(orgId, agentId),
    queryFn: () => part(api, "agentForYou").get(orgId, agentId),
    enabled: enabled && Boolean(api.agentForYou),
    staleTime: 15_000,
  });
}

export function useMemoryAction(orgId: string, agentId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "edit"; id: string; text: string }
        | { type: "pin"; id: string; pinned: boolean }
        | { type: "archive"; id: string; archived: boolean }
        | { type: "confirm"; id: string }
        | { type: "team"; id: string },
    ) => {
      if (action.type === "edit") return api.memory.edit(orgId, action.id, action.text);
      if (action.type === "pin") return api.memory.setPinned(orgId, action.id, action.pinned);
      if (action.type === "confirm") return api.memory.confirm(orgId, action.id);
      if (action.type === "team") return api.memory.makeTeam(orgId, action.id);
      return api.memory.setArchived(orgId, action.id, action.archived);
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.memory(orgId, agentId) }),
        qc.invalidateQueries({ queryKey: keys.orgMemories(orgId) }),
        qc.invalidateQueries({ queryKey: keys.teamMemories(orgId) }),
      ]),
  });
}

/** Memória do time (ADR 0167). */
export const useTeamMemories = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.teamMemories(orgId), queryFn: () => api.memory.listTeam(orgId) });
};

export const useProposals = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.proposals(orgId), queryFn: () => api.proposals.list(orgId) });
};

/**
 * A proposal card's rows, in the card's order, read by id: the list only holds the newest, and a card stays whole
 * however many came after it. (A server without `ids` sends the list: the card's rows are picked from it.)
 */
export function useCardProposals(orgId: string, ids: string[]) {
  const api = useApi();
  const query = useQuery({
    queryKey: keys.cardProposals(orgId, ids),
    queryFn: () => api.proposals.list(orgId, { ids }),
  });
  return (query.data ?? []).filter((p) => ids.includes(p.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

/**
 * What accepted proposals changed on their agents' pages, wherever they were accepted: the instructions and role
 * (profile card, hero, team), and the apps (the Access tab and the matrix).
 */
function refreshAccepted(qc: QueryClient, orgId: string, decided: Proposal[]) {
  const accepted = decided.filter((p) => p.status === "accepted" && p.target.type !== "org_context");
  if (accepted.length === 0) return;
  void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
  void qc.invalidateQueries({ queryKey: keys.team(orgId) });
  for (const p of accepted) {
    void qc.invalidateQueries({ queryKey: keys.agentDetail(orgId, p.agentId) });
    if (p.target.type === "agent_access") void qc.invalidateQueries({ queryKey: keys.scopes(orgId, p.agentId) });
  }
  if (accepted.some((p) => p.target.type === "agent_access"))
    void qc.invalidateQueries({ queryKey: keys.access(orgId) });
  // A settings card may seat an agent in a channel or take it out.
  if (accepted.some((p) => p.target.type === "agent_settings"))
    void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
}

/** The proposals and the sidebar's count of them: after a decision here, or a `proposal.*` event from elsewhere. */
export function refreshProposals(qc: QueryClient, orgId: string) {
  void qc.invalidateQueries({ queryKey: keys.overview(orgId) });
  return qc.invalidateQueries({ queryKey: keys.proposals(orgId) });
}

export function useDecideProposal(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "accept" | "refuse"; text?: string }) =>
      input.decision === "accept"
        ? api.proposals.accept(orgId, input.id, input.text)
        : api.proposals.refuse(orgId, input.id),
    // The page explains a stale proposal (409) itself.
    meta: { silent: true },
    onSuccess: (row) => refreshAccepted(qc, orgId, [row]),
    onSettled: () => refreshProposals(qc, orgId),
  });
}

/** "Pedir a um admin" on a settings row the viewer can't decide (ADR 0137): the card says whom it went to. */
export function useAskProposal(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.proposals.ask(orgId, id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.proposals(orgId) }),
  });
}

/**
 * A card's rows accepted or refused at once: one request per row, so each applies on its own and a stale one
 * never stops the rest, then one refresh. Resolves with the rows decided and the ones that failed and why.
 */
export function useDecideProposals(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; decision: "accept" | "refuse" }) => {
      const decided: Proposal[] = [];
      const failed: { id: string; error: unknown }[] = [];
      for (const id of input.ids) {
        try {
          decided.push(
            await (input.decision === "accept" ? api.proposals.accept(orgId, id) : api.proposals.refuse(orgId, id)),
          );
        } catch (error) {
          failed.push({ id, error });
        }
      }
      return { decided, failed };
    },
    meta: { silent: true },
    onSuccess: ({ decided }) => refreshAccepted(qc, orgId, decided),
    onSettled: () => refreshProposals(qc, orgId),
  });
}

/** People, files and today's uploads against the workspace's limits (ADR 0079): any member. */
export const useWorkspaceLimits = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.limits(orgId), queryFn: () => api.orgs.limits(orgId), enabled });
};

export const useStorage = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.storage(orgId), queryFn: () => api.storage.get(orgId), enabled });
};

export function useTestStorage(orgId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (input: S3Input) => api.storage.test(orgId, input) });
}

export function useSaveStorage(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: "agentes" } | { kind: "s3"; s3: S3Input }) => api.storage.save(orgId, input),
    onSuccess: (config) => {
      qc.setQueryData(keys.storage(orgId), config);
      qc.removeQueries({ queryKey: keys.storageMigration(orgId) });
      void qc.invalidateQueries({ queryKey: keys.limits(orgId) });
    },
  });
}

/** Copy status; polls while the copy runs. */
export const useStorageMigration = (orgId: string, enabled: boolean) => {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.storageMigration(orgId),
    queryFn: async () => {
      const was = qc.getQueryData<StorageMigration | null>(keys.storageMigration(orgId))?.status;
      const m = await api.storage.migration(orgId);
      // A copy that stops has moved files from one storage to the other: what each holds (`usage`, and what the
      // storage limit counts) is stale.
      if (was === "running" && m?.status !== "running") {
        void qc.invalidateQueries({ queryKey: keys.storage(orgId), exact: true });
        void qc.invalidateQueries({ queryKey: keys.limits(orgId) });
      }
      return m;
    },
    enabled,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1500 : false),
    refetchIntervalInBackground: true,
  });
};

export function useStartMigration(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.storage.migrate(orgId),
    onSuccess: (m) => qc.setQueryData(keys.storageMigration(orgId), m),
  });
}

/**
 * The Drive's files for `filters`, a page of 100 at a time (`fetchNextPage` while `hasNextPage`): `artifacts` is what
 * loaded so far, `counts` how many each kind has for these filters (kinds left out), from the first page.
 */
export function useArtifacts(orgId: string, filters: ArtifactFilters) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: keys.artifactList(orgId, filters),
    queryFn: ({ pageParam }) => api.artifacts.page(orgId, filters, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
  });
  const pages = query.data?.pages;
  // A file that moved to another page while the next one loaded comes once, where it came first.
  const artifacts = useMemo(
    () => [...new Map((pages ?? []).flatMap((p) => p.artifacts).map((a) => [a.id, a])).values()],
    [pages],
  );
  return { ...query, artifacts: query.data ? artifacts : undefined, counts: pages?.[0]?.counts ?? null };
}

/** One artifact at a version (latest when omitted). */
/** `GET …/artifacts-trash`: deleted files (30 days). */
export const useArtifactTrash = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.artifacts(orgId), "trash"] as const,
    queryFn: () => api.artifacts.trash(orgId),
  });
};

export const useArtifact = (orgId: string, id: string | null, version?: number) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.artifact(orgId, id ?? "", version),
    queryFn: () => api.artifacts.get(orgId, id ?? "", version),
    enabled: Boolean(id),
    // Old versions never change.
    staleTime: version ? Number.POSITIVE_INFINITY : 0,
  });
};

/** A vote: the answers come in over the socket (`poll.updated`). */
export const usePoll = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.poll(orgId, id ?? ""),
    queryFn: () => api.artifacts.poll(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

export const useVote = (orgId: string, id: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options: number[]) => api.artifacts.vote(orgId, id, options),
    onSuccess: (poll) => qc.setQueryData(keys.poll(orgId, id), poll),
  });
};

/** A choice card's answer (ADR 0124): it comes in over the socket too (`choices.updated`). */
export const useChoices = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.choices(orgId, id ?? ""),
    queryFn: () => api.artifacts.choices(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

export const useAnswerChoices = (orgId: string, id: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ picks, others }: ChoiceAnswer) =>
      api.artifacts.answerChoices(orgId, id, picks, newClientId(), others),
    onSuccess: (out) => qc.setQueryData(keys.choices(orgId, id), out.choices),
    // The card says it itself, and says nothing when someone answered first.
    meta: { silent: true },
  });
};

export const useKeepBlock = (orgId: string, id: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.artifacts.keep(orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.artifacts(orgId) }),
  });
};

export const useBlockReply = (orgId: string, id: string) => {
  const api = useApi();
  return useMutation({
    mutationFn: ({ text, clientId }: { text: string; clientId: string }) =>
      api.artifacts.reply(orgId, id, text, clientId),
  });
};

/** How long a block's changes gather before they go: a dragged slider sends a few values, not one per step. */
const BLOCK_SEND_MS = 250;

/**
 * A live block's state, one for everyone in the conversation (ADR 0113): what the person changes in the page goes
 * to the server, what others change arrives over the socket (`block.state`), and a random pick is the server's
 * (`draw`). `forPage` is what the running page should show, leaving out the values the person is still changing.
 */
export function useSharedBlock(orgId: string, id: string, version: number) {
  const api = useApi();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.blockState(orgId, id, version),
    queryFn: () => api.artifacts.blockState(orgId, id, version),
  });
  /** Changed in the page and not sent yet, and sent with no answer yet. */
  const queued = useRef<Record<string, unknown>>({});
  const sending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keep = useCallback(
    (next: BlockState) =>
      qc.setQueryData<BlockState>(keys.blockState(orgId, id, version), (old) => newerBlockState(old, next)),
    [qc, orgId, id, version],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const values = queued.current;
    if (Object.keys(values).length === 0) return;
    queued.current = {};
    Object.assign(sending.current, values);
    const done = () => {
      for (const key of Object.keys(values)) if (sending.current[key] === values[key]) delete sending.current[key];
    };
    api.artifacts.setBlockState(orgId, id, version, values).then(
      (next) => {
        done();
        keep(next);
      },
      () => {
        done();
        // Not kept: the page goes back to what everyone sees.
        void qc.invalidateQueries({ queryKey: keys.blockState(orgId, id, version) });
      },
    );
  }, [api, qc, keep, orgId, id, version]);

  useEffect(() => () => flush(), [flush]);

  /** What the page holds now; only what the person changed (`used`) is shared. */
  const fromPage = useCallback(
    (local: Record<string, unknown>, used: boolean) => {
      const shared = qc.getQueryData<BlockState>(keys.blockState(orgId, id, version));
      if (!used || !shared) return;
      const changes = stateChanges(local, { ...shared.state, ...sending.current, ...queued.current });
      if (!changes) return;
      Object.assign(queued.current, changes);
      timer.current ??= setTimeout(flush, BLOCK_SEND_MS);
    },
    [qc, flush, orgId, id, version],
  );

  const draw = useCallback(
    (name: string, options: string[]) =>
      api.artifacts.drawBlock(orgId, id, version, name, options).then(keep, () => {}),
    [api, keep, orgId, id, version],
  );

  const block = query.data;
  const changing = new Set([...Object.keys(queued.current), ...Object.keys(sending.current)]);
  return {
    block,
    /** The state came, or can't: a page waits for it, so it never starts from its own defaults over everyone's. */
    loaded: query.isSuccess || query.isError,
    forPage: block ? stateForPage(block, changing) : null,
    /** Values this person changed that the server hasn't taken yet. */
    changing,
    fromPage,
    draw,
  };
}

/**
 * A block drawn by the app itself (ADR 0113): everyone's state, with what this person just changed shown at once
 * while it goes to the server. `set` is a person's own act (a drag, a tap), so it is always shared.
 */
export function useBlockValues(orgId: string, id: string, version: number) {
  const shared = useSharedBlock(orgId, id, version);
  const [mine, setMine] = useState<Record<string, unknown>>({});
  const { fromPage, block, changing } = shared;
  const set = useCallback(
    (values: Record<string, unknown>) => {
      setMine((old) => ({ ...old, ...values }));
      fromPage(values, true);
    },
    [fromPage],
  );
  const base = block?.state;
  const state: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(mine)) if (changing.has(key)) state[key] = value;
  return {
    state,
    changes: block?.changes ?? {},
    rev: block?.rev ?? 0,
    loaded: shared.loaded,
    set,
    draw: shared.draw,
  };
}

export const useArtifactVersions = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.artifactVersions(orgId, id ?? ""),
    queryFn: () => api.artifacts.versions(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

export function useSaveArtifact(orgId: string, id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: ArtifactContent; note?: string | null; baseVersion: number }) =>
      api.artifacts.update(orgId, id, input),
    // The viewer explains a stale version (409) itself.
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.artifacts(orgId) }),
  });
}

/** "Compartilhar" (ADR 0157): who sees a file on top of its conversation. The dialog says a failure itself. */
export function useSetArtifactSharing(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; sharing: Parameters<typeof api.artifacts.setSharing>[2] }) =>
      api.artifacts.setSharing(orgId, input.id, input.sharing),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.artifacts(orgId) }),
  });
}

/** Uploads a file to the Drive, or a new version of `artifactId`. Errors are shown by the caller. */
export function useUploadFile(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      file: File;
      title?: string;
      channelId?: string | null;
      artifactId?: string;
      note?: string;
    }): Promise<ArtifactDetail> =>
      input.artifactId
        ? api.artifacts.uploadVersion(orgId, input.artifactId, input.file, { note: input.note })
        : api.artifacts.upload(orgId, input.file, { title: input.title, channelId: input.channelId }),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.artifacts(orgId) }),
  });
}

/** The bytes of a file version as an object URL (previews); never refetched (versions don't change). */
export const useArtifactBlob = (orgId: string, id: string, version: number, enabled: boolean) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.artifactBlob(orgId, id, version),
    queryFn: () => api.artifacts.fileBlob(orgId, id, version),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60_000,
    retry: false,
    meta: { quiet: true },
  });
};

// ── Issues ───────────────────────────────────────────────────────────────────

/** `project`: only a project's tasks (its id), or `none` for the ones with no project. The server filters. */
export const useIssues = (orgId: string, q = "", project = "") => {
  const api = useApi();
  return useQuery({
    queryKey: keys.issueList(orgId, q, project),
    queryFn: () => api.issues.list(orgId, { ...(q ? { q } : {}), ...(project ? { projectId: project } : {}) }),
    placeholderData: (prev) => prev,
    // While an agent works on an issue its steps change without an event: look again every 10 s.
    refetchInterval: (query) => (query.state.data?.some((i) => i.work && i.work.state !== "stalled") ? 10_000 : false),
  });
};

export const useIssue = (orgId: string, number: number, enabled = true) => {
  const api = useApi();
  return useQuery({
    enabled,
    queryKey: keys.issue(orgId, number),
    queryFn: () => api.issues.get(orgId, number),
    refetchInterval: (query) => (query.state.data?.work && query.state.data.work.state !== "stalled" ? 10_000 : false),
  });
};

/**
 * Where a task's conversation lives (ADR 0145): the one the task already carries, or, once `open`, the one the
 * server makes on first use. Null until then.
 */
export function useTaskConversation(orgId: string, issue: Pick<Issue, "id" | "conversation">, open: boolean) {
  const api = useApi();
  const made = useQuery({
    queryKey: [...keys.issueActivity(orgId, issue.id), "conversation"],
    queryFn: () => api.issues.conversation(orgId, issue.id),
    enabled: open && !issue.conversation,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return issue.conversation ?? made.data ?? null;
}

export const useIssueActivity = (orgId: string, id: string | undefined) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.issueActivity(orgId, id ?? ""),
    queryFn: () => api.issues.activity(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

/**
 * A live event while a task is open: a comment or an event on it (`issue.comment`) goes into its activity once, and
 * an event also refreshes the task itself (status, assignee, a linked PR). `false`: not about this task.
 */
export function applyIssueActivityEvent(
  qc: ReturnType<typeof useQueryClient>,
  orgId: string,
  issueId: string,
  event: { type: string },
): boolean {
  if (event.type !== "issue.comment" || !("issueId" in event) || !("activity" in event)) return false;
  const { issueId: id, activity } = event as IssueActivityEvent;
  if (id !== issueId) return false;
  qc.setQueryData<IssueActivity[]>(keys.issueActivity(orgId, issueId), (list) =>
    !list || list.some((a) => a.id === activity.id) ? list : [...list, activity],
  );
  if (activity.kind === "event") void qc.invalidateQueries({ queryKey: [...keys.issues(orgId), "one"] });
  return true;
}

/**
 * A task's activity live while it is open: comments and events come on the task's channel, or as org broadcasts
 * for a task with none. What was missed while the connection was down comes back on reconnect.
 */
export function useIssueLive(
  orgId: string,
  connection: RealtimeConnection | null,
  issue: { id: string; channelId: string | null } | undefined,
) {
  const qc = useQueryClient();
  const issueId = issue?.id;
  const channelId = issue?.channelId ?? null;
  useEffect(() => {
    if (!connection || !issueId) return;
    const take = (event: { type: string }) => {
      applyIssueEvent(qc, orgId, event);
      applyIssueActivityEvent(qc, orgId, issueId, event);
    };
    const offOrg = connection.onUserEvent(take);
    const offChannel = channelId ? connection.subscribe(channelId, take) : undefined;
    const offReconnect = connection.onReconnect(() => {
      void qc.invalidateQueries({ queryKey: keys.issueActivity(orgId, issueId) });
    });
    return () => {
      offOrg();
      offChannel?.();
      offReconnect();
    };
  }, [connection, orgId, qc, issueId, channelId]);
}

export function useIssueAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "create"; input: IssueInput }
        | { type: "update"; id: string; patch: IssuePatch }
        | { type: "delete"; id: string }
        | { type: "criterion"; id: string; criterionId: string; done: boolean }
        | { type: "comment"; id: string; text: string; attachmentIds?: string[] }
        | { type: "ask"; id: string; agentId: string }
        | { type: "audience"; id: string; audience: AudienceChoice },
    ): Promise<unknown> => {
      switch (action.type) {
        case "create":
          return api.issues.create(orgId, action.input);
        case "update":
          return api.issues.update(orgId, action.id, action.patch);
        case "delete":
          return api.issues.delete(orgId, action.id);
        case "criterion":
          return api.issues.setCriterion(orgId, action.id, action.criterionId, action.done);
        case "comment":
          return api.issues.comment(orgId, action.id, action.text, action.attachmentIds);
        case "ask":
          return api.issues.askAgent(orgId, action.id, action.agentId);
        case "audience":
          return api.issues.setAudience(orgId, action.id, action.audience);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.issues(orgId) });
      void qc.invalidateQueries({ queryKey: keys.calendar(orgId) });
    },
  });
}

/**
 * An agent picked for a task starts on it ("Pedir"). When it can't, the agent stays the task's, as the person picked
 * it, and the call rejects with why: the caller says it with the task's own words and offers to ask again, so it's
 * silent here (no second toast).
 */
export function useStartAgentOnTask(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ issueId, agentId }: { issueId: string; agentId: string }) => {
      try {
        return await api.issues.askAgent(orgId, issueId, agentId);
      } catch (error) {
        await api.issues.update(orgId, issueId, { assignee: { type: "agent", id: agentId } }).catch(() => {});
        throw error;
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.issues(orgId) });
      void qc.invalidateQueries({ queryKey: keys.calendar(orgId) });
    },
  });
}

/** The board's columns; they live under the issues key, so any issue change refreshes them too. */
export const useIssueColumns = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.issueColumns(orgId), queryFn: () => api.issues.columns(orgId) });
};

export function useIssueColumnAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "add"; name: string; stage: IssueStatus; afterId?: string | null }
        | { type: "update"; columnId: string; name?: string; index?: number }
        | { type: "delete"; columnId: string; moveTo: string },
    ): Promise<IssueColumn[]> => {
      switch (action.type) {
        case "add":
          return api.issues.addColumn(orgId, { name: action.name, stage: action.stage, afterId: action.afterId });
        case "update":
          return api.issues.updateColumn(orgId, action.columnId, { name: action.name, index: action.index });
        case "delete":
          return api.issues.deleteColumn(orgId, action.columnId, action.moveTo);
      }
    },
    onSuccess: (columns) => qc.setQueryData(keys.issueColumns(orgId), columns),
    // Deleting a column moves its tasks.
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.issues(orgId) }),
  });
}

/** The tasks' projects; they live under the issues key, so their counts follow every task change. */
export const useIssueProjects = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.issueProjects(orgId), queryFn: () => api.issues.projects(orgId) });
};

export function useIssueProjectAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "create"; name: string; color: string }
        | { type: "update"; projectId: string; name?: string; color?: string; archived?: boolean }
        | { type: "delete"; projectId: string },
    ): Promise<IssueProjectRef | undefined> => {
      switch (action.type) {
        case "create":
          return api.issues.createProject(orgId, { name: action.name, color: action.color });
        case "update": {
          const { type: _type, projectId, ...patch } = action;
          return api.issues.updateProject(orgId, projectId, patch);
        }
        case "delete":
          return api.issues.deleteProject(orgId, action.projectId).then(() => undefined);
      }
    },
    // The tasks carry their project's name and colour: they read again too.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.issues(orgId) }),
  });
}

// ── Routines ─────────────────────────────────────────────────────────────────

export const routinesQuery = (api: ApiClient, orgId: string) =>
  queryOptions({ queryKey: keys.routines(orgId), queryFn: () => api.routines.list(orgId) });

export const useRoutines = (orgId: string) => {
  const api = useApi();
  return useQuery({ ...routinesQuery(api, orgId), refetchInterval: (q) => usagePauseRefetchMs(q.state.data) });
};

export const useRoutineRuns = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.routineRuns(orgId, id ?? ""),
    queryFn: () => api.routines.runs(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

/** A webhook routine's address and latest calls (ADR 0106), for who manages it. */
export const useRoutineHook = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.routineHook(orgId, id ?? ""),
    queryFn: () => api.routines.hook(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

/**
 * A new address, a new signing secret (its `secret` shown once) or none, and Testar ("Ligar e testar" on a routine
 * turned off, since a test needs it on).
 */
export function useRoutineHookAction(orgId: string, id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      action: "address" | "secret" | "unsign" | "test" | "onAndTest",
    ): Promise<{ hook: RoutineHook; secret?: string; runId?: string | null }> => {
      if (action === "address") return { hook: await api.routines.newHookAddress(orgId, id) };
      if (action === "secret") return api.routines.newHookSecret(orgId, id);
      if (action === "unsign") return { hook: await api.routines.removeHookSecret(orgId, id) };
      if (action === "onAndTest") await api.routines.setActive(orgId, id, true);
      return api.routines.testHook(orgId, id);
    },
    onSuccess: ({ hook }) => qc.setQueryData(keys.routineHook(orgId, id), hook),
    // The list carries the address too, and a test starts a run (both under the routines' key).
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.routines(orgId) }),
  });
}

/**
 * Whether GitHub's or Sentry's webhook works here (`null`: not asked). `waiting`: asked again every few seconds, while
 * Testar waits for its first call.
 */
export const useWebhookSetup = (orgId: string, provider: WebhookProvider | null, waiting = false) => {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.webhookSetup(orgId, provider ?? ""),
    queryFn: async () => {
      const before = qc.getQueryData<WebhookSetup>(keys.webhookSetup(orgId, provider ?? ""));
      const setup = await api.routines.webhookSetup(orgId, provider ?? "github");
      // Its first good call moves the routines waiting on it out of "needs webhook" on the same screen.
      if (before && !before.receivedAt && setup.receivedAt) {
        void qc.invalidateQueries({ queryKey: keys.routines(orgId), exact: true });
      }
      return setup;
    },
    enabled: provider !== null,
    refetchInterval: waiting ? 3000 : false,
    // The person is likely on GitHub's or Sentry's tab saving the webhook while Testar waits.
    refetchIntervalInBackground: waiting,
  });
};

/** Makes the webhook, pastes the service's secret or adds it to a GitHub repository; the routines' states follow. */
export function useWebhookSetupAction(orgId: string, provider: WebhookProvider) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action: { type: "ensure" } | { type: "secret"; secret: string } | { type: "repo"; repo: string },
    ): Promise<WebhookSetup> =>
      action.type === "ensure"
        ? api.routines.ensureWebhook(orgId, provider)
        : action.type === "secret"
          ? api.routines.setWebhookSecret(orgId, provider, action.secret)
          : api.routines.addWebhookToRepo(orgId, action.repo),
    onSuccess: (setup) => {
      qc.setQueryData(keys.webhookSetup(orgId, provider), setup);
      if (setup.receivedAt) void qc.invalidateQueries({ queryKey: keys.routines(orgId), exact: true });
    },
  });
}

export const useScheduleParse = (orgId: string, phrase: string, enabled: boolean, timezone?: string) => {
  const api = useApi();
  return useQuery({
    queryKey: ["org", orgId, "routines", "parse", phrase, timezone ?? ""] as const,
    queryFn: () => api.routines.parseSchedule(orgId, phrase, timezone),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: Number.POSITIVE_INFINITY,
  });
};

/** `POST …/routines/parse-rule`: a phrase → rule (fills the picker). */
export const useRuleParse = (orgId: string, phrase: string, enabled: boolean, timezone?: string) => {
  const api = useApi();
  return useQuery({
    queryKey: ["org", orgId, "routines", "parse-rule", phrase, timezone ?? ""] as const,
    queryFn: () => api.routines.parseRule(orgId, phrase, timezone),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
};

/** `POST …/routines/describe-rule`: the picker's sentence and next runs. */
export const useRuleDescribe = (orgId: string, rule: ApiRule | null) => {
  const api = useApi();
  const key = rule ? JSON.stringify(rule) : "";
  return useQuery({
    queryKey: ["org", orgId, "routines", "describe-rule", key] as const,
    queryFn: () => api.routines.describeRule(orgId, rule as ApiRule),
    enabled: Boolean(rule),
    placeholderData: (prev) => prev,
    staleTime: Number.POSITIVE_INFINITY,
  });
};

export function useRoutineAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        | { type: "create"; input: RoutineInput }
        | { type: "active"; id: string; active: boolean }
        | { type: "run"; id: string }
        | { type: "stop"; id: string }
        /** Continuar agora on a run paused near its plan's or budget's limit. */
        | { type: "continueUsage"; id: string }
        | { type: "update"; id: string; patch: RoutinePatch }
        | { type: "delete"; id: string }
        | { type: "duplicate"; id: string; name?: string }
        /** "Assumir rotina": I become its creator, and it runs again. */
        | { type: "takeOver"; id: string }
        /** "Adicionar agente ao canal": the agent joins the channel it delivers to, and it runs again. */
        | { type: "addAgent"; id: string; agentId: string; channelId: string },
    ): Promise<unknown> => {
      if (action.type === "create") return api.routines.create(orgId, action.input);
      if (action.type === "update") return api.routines.update(orgId, action.id, action.patch);
      if (action.type === "delete") return api.routines.remove(orgId, action.id);
      if (action.type === "duplicate") return api.routines.duplicate(orgId, action.id, action.name);
      if (action.type === "active") return api.routines.setActive(orgId, action.id, action.active);
      if (action.type === "stop") return api.routines.stop(orgId, action.id);
      if (action.type === "continueUsage") return api.routines.continueUsage(orgId, action.id);
      if (action.type === "takeOver") {
        await api.routines.takeOver(orgId, action.id);
        return api.routines.setActive(orgId, action.id, true);
      }
      if (action.type === "addAgent") {
        await api.chat.addMember(orgId, action.channelId, { agentId: action.agentId });
        return api.routines.setActive(orgId, action.id, true);
      }
      return api.routines.runNow(orgId, action.id);
    },
    // A routine just made or changed is in the list at once, before it comes back: its page reads it from there.
    onSuccess: (saved, action) => {
      if (action.type !== "create" && action.type !== "update" && action.type !== "duplicate") return;
      const routine = saved as Routine;
      qc.setQueryData<Routine[]>(keys.routines(orgId), (list) =>
        list?.some((r) => r.id === routine.id)
          ? list.map((r) => (r.id === routine.id ? routine : r))
          : list && [...list, routine],
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
      void qc.invalidateQueries({ queryKey: keys.calendar(orgId) });
    },
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export const useCalendar = (orgId: string, from: string, to: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.calendarRange(orgId, from),
    queryFn: () => api.calendar.range(orgId, from, to),
    placeholderData: (prev) => prev,
  });
};

export function useCalendarAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      action:
        | { type: "create"; input: CalendarEventInput }
        | { type: "confirm" | "dismiss"; id: string }
        | {
            type: "update";
            id: string;
            patch: CalendarEventPatch;
            series?: { scope: SeriesScope; occurrenceStart: string };
          }
        | { type: "remove"; id: string; series?: { scope: SeriesScope; occurrenceStart: string } }
        | { type: "respond"; id: string; status: "accepted" | "declined" },
    ): Promise<unknown> => {
      if (action.type === "create") return api.calendar.create(orgId, action.input);
      if (action.type === "respond") return api.calendar.respond(orgId, action.id, action.status);
      if (action.type === "update") return api.calendar.update(orgId, action.id, action.patch, action.series);
      if (action.type === "remove") return api.calendar.remove(orgId, action.id, action.series);
      if (action.type === "confirm") return api.calendar.confirmProposal(orgId, action.id);
      return api.calendar.dismissProposal(orgId, action.id);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.calendar(orgId) }),
  });
}

/**
 * An event proposal's card in its conversation: Confirmar creates the event, Dispensar drops it, and the card says so
 * at once (others see it through `calendar.proposal.updated`).
 */
export function useCalendarProposal(orgId: string, where: { channelId: string; messageId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposal, decision }: { proposal: CalendarProposal; decision: "confirm" | "dismiss" }) => {
      if (decision === "confirm") await api.calendar.confirmProposal(orgId, proposal.id);
      else await api.calendar.dismissProposal(orgId, proposal.id);
      return { ...proposal, status: decision === "confirm" ? ("confirmed" as const) : ("dismissed" as const) };
    },
    onSuccess: (proposal) => {
      cacheMessageMeta(qc, orgId, where.channelId, where.messageId, () => ({ calendarProposal: proposal }));
      void qc.invalidateQueries({ queryKey: keys.calendar(orgId) });
    },
  });
}

/**
 * A report about the app an agent offered under its reply (`meta.feedbackOffer`): Send queues it in my name, Not now
 * puts it away, and the row says so at once (my other devices see it through `feedback_offer.updated`).
 */
export function useFeedbackOffer(
  orgId: string,
  where: { channelId: string; threadId?: string | null; messageId: string },
) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision: "send" | "dismiss") => api.system.decideFeedbackOffer(orgId, where.messageId, decision),
    onSuccess: (offer) => {
      cacheMessageMeta(qc, orgId, where.channelId, where.messageId, () => ({ feedbackOffer: offer }));
      if (where.threadId) void qc.invalidateQueries({ queryKey: keys.thread(orgId, where.channelId, where.threadId) });
    },
  });
}

// ── Agent access (tool tree) ─────────────────────────────────────────────────

/** The agent's tool tree. `retry: false`: a 404 means the backend doesn't have it yet. */
export const useAgentAccess = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentAccess(orgId, agentId),
    queryFn: () => api.access.get(orgId, agentId),
    enabled,
    retry: false,
  });
};

// ── Skills ───────────────────────────────────────────────────────────────────

/** The org library. `retry: false`: a 404 means the server doesn't have skills. */
export const useSkills = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.skills(orgId), queryFn: () => api.skills.list(orgId), enabled, retry: false });
};

/** "Agentes melhoram as skills sozinhos" for the workspace; on when the server doesn't say (older servers). */
export const useSkillSettings = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.skillSettings(orgId),
    queryFn: () => api.skills.settings?.(orgId) ?? Promise.resolve({ agentsImprove: true }),
    enabled,
    retry: false,
  });
};

export const useSkill = (orgId: string, id: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.skill(orgId, id ?? ""),
    queryFn: () => api.skills.get(orgId, id ?? ""),
    enabled: Boolean(id),
  });
};

export const useAgentSkills = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentSkills(orgId, agentId),
    queryFn: () => api.skills.forAgent(orgId, agentId),
    enabled,
    retry: false,
  });
};

/** Skills the agent made from its own how-tos ("Aprendizados"); empty on a server without them. */
export const useLearnedSkills = (orgId: string, agentId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.learnedSkills(orgId, agentId),
    queryFn: () => api.skills.learned?.(orgId, agentId) ?? Promise.resolve([]),
    retry: false,
  });
};

/** Which agents use each skill (the API lists skills per agent): skillId → agents. */
export function useSkillUsage(orgId: string, enabled: boolean) {
  const api = useApi();
  const agents = useAgents(orgId);
  const list = enabled ? (agents.data ?? []) : [];
  const per = useQueries({
    queries: list.map((a) => ({
      queryKey: keys.agentSkills(orgId, a.id),
      queryFn: () => api.skills.forAgent(orgId, a.id),
      retry: false,
    })),
  });
  const usage = new Map<string, { id: string; name: string }[]>();
  per.forEach((q, i) => {
    const agent = list[i];
    if (!agent) return;
    for (const s of q.data ?? []) {
      if (!s.enabled) continue;
      usage.set(s.id, [...(usage.get(s.id) ?? []), { id: agent.id, name: agent.name }]);
    }
  });
  return usage;
}

/** `silent`: the screen says every refusal itself (Instalar skill), so the app's own error toast stays out. */
export function useSkillAction(orgId: string, { silent = false } = {}) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    ...(silent ? { meta: { silent: true } } : {}),
    mutationFn: (
      action:
        | {
            type: "import";
            input: { url: string; list?: boolean; forAgentId?: string } | { zipBase64: string };
            upload?: UploadOptions;
          }
        | { type: "importPicked"; url: string; paths: string[]; forAgentId?: string }
        | { type: "create"; input: SkillInput }
        | { type: "update"; id: string; patch: SkillPatch }
        | { type: "reimport"; id: string }
        | { type: "remove"; id: string }
        | { type: "revert"; id: string }
        | { type: "restore"; id: string }
        | { type: "updateFromSource" | "approveUpdate" | "dismissUpdate" | "reopenUpdate" | "undoUpdate"; id: string }
        | { type: "settings"; settings: SkillSettings }
        | { type: "assign"; agentId: string; skills: { skillId: string; enabled: boolean }[] },
    ): Promise<unknown> => {
      switch (action.type) {
        case "import":
          return api.skills.import(orgId, action.input, action.upload);
        case "importPicked":
          return api.skills.importPicked(orgId, action.url, action.paths, action.forAgentId);
        case "create":
          return api.skills.create(orgId, action.input);
        case "update":
          return api.skills.update(orgId, action.id, action.patch);
        case "reimport":
          return api.skills.reimport(orgId, action.id);
        case "remove":
          return api.skills.remove(orgId, action.id);
        case "assign":
          return api.skills.setForAgent(orgId, action.agentId, action.skills);
        case "revert":
          return api.skills.revert?.(orgId, action.id) ?? Promise.resolve();
        case "restore":
          return api.skills.restore?.(orgId, action.id) ?? Promise.resolve();
        case "updateFromSource":
        case "approveUpdate":
        case "dismissUpdate":
        case "reopenUpdate":
        case "undoUpdate":
          return api.skills[action.type]?.(orgId, action.id) ?? Promise.resolve();
        case "settings":
          return api.skills.saveSettings?.(orgId, action.settings) ?? Promise.resolve();
      }
    },
    // The library and every agent's lists (`keys.skills` is their prefix).
    onSettled: () => qc.invalidateQueries({ queryKey: keys.skills(orgId) }),
  });
}

// ── Agent computer and Run code settings ─────────────────────────────────────

/** The organization's Run code settings (`retry: false`). */
export const useSandboxSettings = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.sandboxSettings(orgId),
    queryFn: () => api.sandbox.settings(orgId),
    enabled,
    retry: false,
  });
};

export function useSaveSandboxSettings(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SandboxSettingsInput) => api.sandbox.saveSettings(orgId, input),
    onSuccess: (saved) => qc.setQueryData(keys.sandboxSettings(orgId), saved),
  });
}

/**
 * "Quem pensa" (its owner or an admin; members don't load it). `pollMs`: asked again this often where no event
 * keeps it current (the onboarding opens no socket).
 */
export const useAgentBrain = (
  orgId: string,
  agentId: string,
  enabled = true,
  pollMs: number | false = false,
  /** The team's right hand's workspace AI (admins), under the same key so every invalidation reaches it. */
  scope?: BrainScope,
) => {
  const api = useApi();
  return useQuery({
    queryKey: scope ? [...keys.agentBrain(orgId, agentId), scope] : keys.agentBrain(orgId, agentId),
    queryFn: () => api.agents.brain(orgId, agentId, scope),
    enabled,
    retry: false,
    refetchInterval: pollMs,
  });
};

/** "Quem pensa" for an agent still being created ("Criar agente"): the workspace's computers and what each offers. */
export const useBrainMachines = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.brainMachines(orgId),
    queryFn: () => api.agents.brainMachines(orgId),
    retry: false,
  });
};

/** "Criar agente": what a new agent starts thinking with (ADR 0094), for whoever creates agents. */
export const useNewAgentSetup = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.newAgentSetup(orgId),
    queryFn: () => api.agents.newAgentSetup(orgId),
    enabled,
    retry: false,
  });
};

/** "Usar em outros agentes": what the setup would do to each agent, nothing kept; asked again when either changes. */
export const useSetupPreview = (orgId: string, setup: AgentSetup | null, agentIds: readonly string[]) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.setupPreview(orgId, JSON.stringify([setup, agentIds])),
    queryFn: () => api.agents.applySetup(orgId, { setup: setup as AgentSetup, agentIds: [...agentIds], preview: true }),
    enabled: setup !== null && agentIds.length > 0,
    retry: false,
    // Each run walks every agent through its rules: once per opening is enough.
    refetchOnWindowFocus: false,
  });
};

/** "Contas de IA": the viewer's AI accounts on every computer, and where they can add one. */
export const useAiAccounts = (orgId: string, enabled = true, pollMs: number | false = false) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.aiAccounts(orgId),
    queryFn: () => api.machines.aiAccounts(orgId),
    enabled,
    refetchInterval: pollMs,
  });
};

/**
 * ADR 0041 §2: a sign-in on the computer, asked every 2 s until it ends (done, failed or expired), through failed
 * reads too (`loginRead` says how long they may last).
 */
export const useAccountLogin = (orgId: string, machineId: string, loginId: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.accountLogin(orgId, machineId, loginId ?? ""),
    queryFn: async ({ client, queryKey }) => {
      try {
        return await api.machines.accountLogin(orgId, machineId, loginId ?? "");
      } catch (error) {
        if (!loginReadPasses(error)) throw error;
        // The read before this one failed too: the run goes on from its first.
        const before = client.getQueryState(queryKey)?.error;
        throw new LoginReadError(error, before instanceof LoginReadError ? before.since : Date.now());
      }
    },
    enabled: loginId !== null,
    // Waiting from its start. With data, a read keeps the last error until an answer clears it, so a run of failed
    // reads adds up, and the block never drops back to loading meanwhile.
    initialData: loginId === null ? undefined : { state: "waiting" },
    retry: false,
    refetchInterval: (q) => (q.state.data && q.state.data.state !== "waiting" ? false : 2000),
    // The person is on Claude's page in another tab meanwhile.
    refetchIntervalInBackground: true,
  });
};

export const useComputer = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.computer(orgId, agentId),
    queryFn: () => api.sandbox.computer(orgId, agentId),
    enabled,
    retry: false,
    meta: { quiet: true },
  });
};

/** A connected machine for the agent, or none; the computer view follows the answer. */
export function useSetComputerTarget(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, machineId }: { agentId: string; machineId: string | null }) =>
      api.sandbox.setTarget(orgId, agentId, machineId),
    meta: { silent: true },
    onSuccess: (target, { agentId }) => {
      qc.setQueryData<AgentComputer>(keys.computer(orgId, agentId), (old) => (old ? { ...old, target } : old));
      void qc.invalidateQueries({ queryKey: keys.computer(orgId, agentId) });
      void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
    },
  });
}

// ── Connected computers ─────────────────────────────────────────────────────

/** `pollMs`: also refetch this often (while waiting for a new machine to pair); events keep it live otherwise. */
export const useMachines = (orgId: string, enabled = true, pollMs: number | false = false) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.machines(orgId),
    queryFn: () => api.machines.list(orgId),
    enabled,
    retry: false,
    refetchInterval: pollMs,
    meta: { quiet: true },
  });
};

/**
 * Offline computers that agents wait for, and where they could move. While any is shown it refetches
 * every 30 s (and on focus); `machine.status` / `machine.agents_moved` events refresh it too.
 */
export const useMachineOutages = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.machineOutages(orgId),
    queryFn: () => api.machines.outages(orgId),
    enabled,
    retry: false,
    refetchInterval: (q) => ((q.state.data?.outages.length ?? 0) > 0 ? 30_000 : false),
    refetchOnWindowFocus: true,
    meta: { quiet: true },
  });
};

/**
 * A computer's line (who works on it, who waits, estimates). `computer.queue` events refetch it; while anything
 * waits it also refetches every 30 s, so the estimates keep counting down.
 */
export const useMachineQueue = (orgId: string, machineId: string | null | undefined, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.machineQueue(orgId, machineId ?? ""),
    queryFn: () => api.machines.queue(orgId, machineId ?? ""),
    enabled: enabled && Boolean(machineId),
    retry: false,
    refetchInterval: (q) => ((q.state.data?.waiting.length ?? 0) > 0 ? 30_000 : false),
    meta: { quiet: true },
  });
};

/** "Trocar computador": moves waiting agents off an offline computer; outages, agents, computers and chats follow. */
export function useMoveAgents(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, ...input }: MoveAgentsInput & { machineId: string }) =>
      api.machines.moveAgents(orgId, machineId, input),
    meta: { silent: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
      void qc.invalidateQueries({ queryKey: keys.agents(orgId) });
      void qc.invalidateQueries({ queryKey: keys.computers(orgId) });
      // Every conversation's messages (the waiting cards change).
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "org" &&
          q.queryKey[1] === orgId &&
          q.queryKey[2] === "channel" &&
          q.queryKey[4] === "messages",
      });
    },
  });
}

/** `/conectar?code=`: the computer that made this code (ADR 0036 §5). */
export const useMachineDevice = (userCode: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.machineDevice(userCode),
    queryFn: () => api.machines.device(userCode),
    enabled: enabled && userCode.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { quiet: true },
  });
};

/** "Conectar": the computer joins `orgId`; the list refreshes. */
export function useConfirmDevice() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgId: string; userCode: string; name?: string }) =>
      api.machines.confirmDevice(input.orgId, input.userCode, input.name ? { name: input.name } : {}),
    meta: { silent: true },
    onSuccess: (_m, input) => void qc.invalidateQueries({ queryKey: keys.machines(input.orgId) }),
  });
}

/** "Não fui eu". */
export function useDenyDevice() {
  const api = useApi();
  return useMutation({
    mutationFn: (userCode: string) => api.machines.denyDevice(userCode),
    meta: { silent: true },
  });
}

/** The newest desktop app build (`null`: none published, or the server can't read releases). */
export const useDesktopLatest = (target: string, arch: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.desktopLatest(target, arch),
    queryFn: () => api.machines.desktopLatest(target, arch),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    meta: { quiet: true },
  });
};

/** Pauses a computer from the apps (`until` null: until resumed) or resumes it; the list follows at once. */
export function useMachinePause(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, input }: { machineId: string; input: { until: string | null } | "resume" }) =>
      api.machines.setPause(orgId, machineId, input),
    meta: { silent: true },
    onSuccess: (paused, { machineId }) => {
      qc.setQueryData<Machine[]>(keys.machines(orgId), (list) =>
        list?.map((m) => (m.id === machineId ? { ...m, paused: paused ?? { paused: false } } : m)),
      );
      void qc.invalidateQueries({ queryKey: keys.devices(orgId) });
    },
  });
}

/** Removes a folder (for everyone or one agent) or turns a tool off; the machine follows. */
export function useReduceMachineAccess(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, ...input }: MachineAccessReduce & { machineId: string }) =>
      api.machines.reduceAccess(orgId, machineId, input),
    meta: { silent: true },
    onSuccess: (access, { machineId }) => {
      qc.setQueryData<Machine[]>(keys.machines(orgId), (list) =>
        list?.map((m) => (m.id === machineId ? { ...m, access } : m)),
      );
    },
  });
}

/**
 * One click where a tool is off on a computer: its owner turns it on (`allow`), anyone else asks them (`ask`). The
 * machines and devices lists refetch so every screen that waited on it moves on.
 */
export function useAllowMachineTool(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ machineId, tool, ask }: { machineId: string; tool: MachineTool; ask?: boolean }) => {
      if (!ask) return api.machines.allowTool(orgId, machineId, tool);
      await api.machines.askTool(orgId, machineId, tool);
      return null;
    },
    meta: { silent: true },
    onSuccess: (access, { machineId }) => {
      if (access)
        qc.setQueryData<Machine[]>(keys.machines(orgId), (list) =>
          list?.map((m) => (m.id === machineId ? { ...m, access } : m)),
        );
      void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
      void qc.invalidateQueries({ queryKey: keys.devices(orgId) });
    },
  });
}

/** What a computer's coding CLIs decide: its row, every agent's "Quem pensa" and the plans' panels. */
function invalidateClis(qc: ReturnType<typeof useQueryClient>, orgId: string) {
  void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
  void qc.invalidateQueries({ queryKey: keys.agentPages(orgId) });
  void qc.invalidateQueries({ queryKey: keys.aiAccounts(orgId) });
}

/** "Já instalei, verificar de novo": the computer reads its PATH again and looks for its coding CLIs now. */
export function useCheckMachineClis(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (machineId: string) => api.machines.checkClis(orgId, machineId),
    meta: { silent: true },
    onSettled: () => invalidateClis(qc, orgId),
  });
}

/**
 * Installing a coding CLI on a computer, for the person who paired it (`on`): where it stands, asked every 1.5 s while
 * it runs; once it ends, what thinks for the agents is asked again (the computer has already looked again).
 */
export function useCliInstall(orgId: string, machineId: string | null, tool: InstallableCli, on: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.cliInstall(orgId, machineId ?? "", tool);
  const state = useQuery({
    queryKey: key,
    queryFn: () => api.machines.cliInstall(orgId, machineId ?? "", tool, "status"),
    enabled: on && machineId !== null,
    retry: false,
    refetchInterval: (q) => (q.state.data?.install?.state === "running" ? CLI_INSTALL_POLL_MS : false),
    meta: { quiet: true },
  });
  const ended = state.data?.install && state.data.install.state !== "running" ? state.data.install.state : null;
  useEffect(() => {
    if (ended) invalidateClis(qc, orgId);
  }, [ended, qc, orgId]);
  const start = useMutation({
    mutationFn: () => api.machines.cliInstall(orgId, machineId ?? "", tool, "start"),
    meta: { silent: true },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const cancel = useMutation({
    mutationFn: () => api.machines.cliInstall(orgId, machineId ?? "", tool, "cancel"),
    meta: { silent: true },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const ask = useMutation({
    mutationFn: () => api.machines.askCliInstall(orgId, machineId ?? "", tool),
    meta: { silent: true },
  });
  return { install: on ? (state.data?.install ?? null) : null, start, cancel, ask };
}

export function useMachineAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { machineId: string; action: "rename"; name: string } | { machineId: string; action: "remove" },
    ) =>
      input.action === "rename"
        ? api.machines.rename(orgId, input.machineId, input.name).then(() => undefined)
        : api.machines.remove(orgId, input.machineId),
    meta: { silent: true },
    onSuccess: (_r, input) => {
      qc.setQueryData<Machine[]>(keys.machines(orgId), (list) =>
        input.action === "remove"
          ? list?.filter((m) => m.id !== input.machineId)
          : list?.map((m) => (m.id === input.machineId ? { ...m, name: input.name } : m)),
      );
      void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
      // Agents on a removed machine are left with no computer; a renamed one shows its new name.
      void qc.invalidateQueries({ queryKey: keys.computers(orgId) });
    },
  });
}

/** The server's own computer in this organization; null when the server has none or doesn't serve it. */
export const useHostComputer = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.hostComputer(orgId),
    queryFn: () => api.machines.host(orgId),
    enabled,
    retry: false,
    meta: { quiet: true },
  });
};

/**
 * The workspace's own computer on its way (ADR 0056 §10): `machine.provisioning` events keep it live in the
 * org shell; `pollMs` where no socket is open (the onboarding), a time or one picked from the last answer.
 */
export const useComputerSetup = (
  orgId: string,
  enabled = true,
  pollMs: number | false | ((setup: ComputerSetup | undefined) => number | false) = false,
) => {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.computerSetup(orgId),
    queryFn: async () =>
      newerSetup(qc.getQueryData(keys.computerSetup(orgId)), await api.machines.computerSetup(orgId)),
    enabled: enabled && orgId.length > 0,
    retry: false,
    refetchInterval: typeof pollMs === "function" ? (query) => pollMs(query.state.data) : pollMs,
    // Events keep it current; a reconnect asks again (what came while offline is gone).
    staleTime: 5 * 60_000,
    meta: { quiet: true },
  });
};

/** "Usar o computador deste servidor": it comes back in the list and connects at its next sync. */
export function useHostComputerOn(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.machines.hostOn(orgId),
    meta: { silent: true },
    onSuccess: (state) => {
      qc.setQueryData(keys.hostComputer(orgId), state);
      void qc.invalidateQueries({ queryKey: keys.machines(orgId) });
    },
  });
}

// ── Wiki ─────────────────────────────────────────────────────────────────────

/** Every page (titles, folders, tags): the tree, `[[link]]` resolution, ⌘K. */
export const useWikiTree = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.wikiTree(orgId),
    queryFn: () => api.wiki.tree(orgId),
    enabled,
    staleTime: 30_000,
  });
};

export const useWikiPage = (orgId: string, slug: string | null) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.wikiPage(orgId, slug ?? ""),
    queryFn: () => api.wiki.get(orgId, slug ?? ""),
    enabled: slug !== null && slug !== "",
    retry: false,
  });
};

export const useWikiHistory = (orgId: string, slug: string, enabled: boolean) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.wikiHistory(orgId, slug),
    queryFn: () => api.wiki.history(orgId, slug),
    enabled,
  });
};

export const useWikiGraph = (orgId: string, enabled: boolean) => {
  const api = useApi();
  return useQuery({ queryKey: keys.wikiGraph(orgId), queryFn: () => api.wiki.graph(orgId), enabled });
};

/** What the agents read most in the last 7 days (the wiki's home). */
export const useWikiReads = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.wikiReads(orgId),
    queryFn: () => api.wiki.reads(orgId),
    enabled,
    staleTime: 60_000,
  });
};

export function useWikiAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (
      action:
        | { type: "create"; input: WikiPageInput }
        | { type: "update"; slug: string; input: WikiUpdateInput }
        | { type: "rename"; slug: string; title: string }
        | { type: "move"; slug: string; folder: string }
        | { type: "lock"; slug: string; locked: boolean }
        | { type: "pin"; slug: string; pinned: boolean }
        | { type: "context"; slug: string; on: boolean }
        | { type: "audience"; slug: string; access: WikiAccess }
        | { type: "who"; slug: string; audience: WikiAccess["audience"] }
        | {
            type: "append";
            slug: string;
            text: string;
            source: { kind: "message"; channelId: string; messageId: string };
          },
    ): Promise<WikiPage> => {
      switch (action.type) {
        case "create":
          return api.wiki.create(orgId, action.input);
        case "update":
          return api.wiki.update(orgId, action.slug, action.input);
        case "rename":
          return api.wiki.rename(orgId, action.slug, action.title);
        case "move":
          return api.wiki.move(orgId, action.slug, action.folder);
        case "lock":
          return api.wiki.lock(orgId, action.slug, action.locked);
        case "pin":
          return api.wiki.pin(orgId, action.slug, action.pinned);
        case "context":
          return api.wiki.context(orgId, action.slug, action.on);
        case "audience":
          return api.wiki.audience(orgId, action.slug, action.access);
        case "who":
          return api.wiki.audience(orgId, action.slug, { audience: action.audience });
        case "append":
          return api.wiki.append(orgId, action.slug, { text: action.text, source: action.source });
      }
    },
    onSuccess: (page) => {
      qc.setQueryData(keys.wikiPage(orgId, page.slug), page);
      void qc.invalidateQueries({ queryKey: keys.wiki(orgId) });
    },
  });
}

/** The wiki's Lixeira: pages deleted in the last 30 days. */
export const useWikiTrash = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: keys.wikiTrash(orgId), queryFn: () => api.wiki.trash(orgId), enabled });
};

/** Delete, restore or purge many pages, or set their agents: the whole wiki is read again after. */
export function useWikiBulk(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (
      action:
        | { type: "delete"; target: WikiBulkTarget }
        | { type: "restore"; ids: string[] }
        | { type: "purge"; ids?: string[] }
        | { type: "agents"; ids: string[]; agentIds: string[] | null },
    ) => {
      // One shape for every action: how many changed, how many this person couldn't reach, and which failed.
      const none: WikiBulkFailed = [];
      switch (action.type) {
        case "delete": {
          const r = await api.wiki.removeMany(orgId, action.target);
          return { count: r.deleted, kept: r.kept, failed: none };
        }
        case "restore": {
          const r = await api.wiki.restoreMany(orgId, action.ids);
          return { count: r.restored, kept: r.kept, failed: r.failed };
        }
        case "purge": {
          const r = await api.wiki.purge(orgId, action.ids);
          return { count: r.purged, kept: r.kept, failed: none };
        }
        case "agents": {
          const r = await api.wiki.setAgents(orgId, action.ids, action.agentIds);
          return { count: r.changed, kept: 0, failed: r.failed };
        }
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.wiki(orgId) });
    },
  });
}

/** A wiki folder's audience and the closest limited folder above it. */
export function useWikiFolderAudience(orgId: string, folder: string, enabled = true) {
  const api = useApi();
  return useQuery({
    enabled,
    queryKey: [...keys.wiki(orgId), "folder-audience", folder],
    queryFn: () => api.wiki.folderAudience(orgId, folder),
  });
}

/** Saves a folder's audience: it reaches its pages, so everything in the wiki is read again. */
export function useSetWikiFolderAudience(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { folder: string; access: WikiAccess }) =>
      api.wiki.setFolderAudience(orgId, input.folder, input.access),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wiki(orgId) });
    },
  });
}

// ── Threads (ADR 0029) ──────────────────────────────────────────────────────

/** The Threads page: one page per cursor, most recent activity first. */
export function useThreadList(orgId: string, filters: ThreadFilters, enabled = true) {
  const api = useApi();
  return useInfiniteQuery({
    enabled,
    queryKey: keys.threadList(orgId, filters),
    queryFn: ({ pageParam }) => api.threads.list(orgId, { ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

/** A channel's threads (its "Threads (N)", closed lines and context marks). One page of 100. */
export const channelThreadsQuery = (api: ApiClient, orgId: string, channelId: string, tab: "all" | "archived") =>
  queryOptions({
    queryKey: keys.channelThreads(orgId, channelId, tab),
    queryFn: () => api.threads.inChannel(orgId, channelId, { tab, limit: 100 }),
    staleTime: 30_000,
  });

export function useChannelThreads(orgId: string, channelId: string, tab: "all" | "archived", enabled = true) {
  const api = useApi();
  return useQuery({ ...channelThreadsQuery(api, orgId, channelId, tab), enabled });
}

/** A top-level message some channel's cache already holds (its first page or the older ones). */
function cachedTopLevel(qc: QueryClient, orgId: string, id: string, channelId?: string): Message | undefined {
  const lists = qc.getQueriesData<Message[] | { pages: Message[] }>({
    queryKey: ["org", orgId],
    predicate: (q) =>
      (q.queryKey[2] === "channel" && q.queryKey[4] === "messages" && (!channelId || q.queryKey[3] === channelId)) ||
      (q.queryKey[2] === "older-pages" && (!channelId || q.queryKey[3] === channelId)),
  });
  for (const [, data] of lists) {
    const found = (Array.isArray(data) ? data : data?.pages)?.find((m) => m.id === id && !m.threadId && !m.local);
    if (found) return found;
  }
  return undefined;
}

/**
 * A thread as the caches already know it, shown while its own read is on its way: its row in a channel's thread
 * list or, not a thread yet, its root message as the server makes one from it. None for a range's root (its context
 * comes from the server) or a conversation not in the lists.
 */
export function cachedThreadInfo(qc: QueryClient, orgId: string, threadId: string): ThreadInfo | undefined {
  for (const [, page] of qc.getQueriesData<ThreadPage>({ queryKey: ["org", orgId, "threads", "channel"] })) {
    const found = page?.threads.find((x) => x.id === threadId);
    if (found) return found;
  }
  const root = cachedTopLevel(qc, orgId, threadId);
  if (!root || threadStartOf(root.meta)) return undefined;
  const channel = qc.getQueryData<Channel[]>(keys.channels(orgId))?.find((c) => c.id === root.channelId);
  const dm = channel
    ? undefined
    : qc.getQueryData<DirectMessage[]>(keys.dms(orgId))?.find((d) => d.channelId === root.channelId);
  if (!channel && !dm) return undefined;
  const author = { type: root.author.type, id: root.author.id ?? null } as ThreadInfo["rootAuthor"];
  return {
    id: root.id,
    channelId: root.channelId,
    channelName: channel?.name ?? "",
    channelKind: channel ? "channel" : "dm",
    title: null,
    rootText: voiceOf(root.meta) ? "" : root.body.replace(/\s+/g, " ").trim(),
    rootAuthor: author,
    state: "open",
    createdBy: null,
    closedBy: null,
    closedAt: null,
    archivedBy: null,
    archivedAt: null,
    context: null,
    replyCount: 0,
    lastActivityAt: root.createdAt,
    lastMessage: null,
    participants: [author],
    working: false,
    needsYou: false,
    openedByReplyAt: null,
    suggestedResolved: false,
    canManage: false,
    unread: 0,
    mission: null,
    createdAt: root.createdAt,
  };
}

export function useThreadInfo(orgId: string, threadId: string | null | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.threadInfo(orgId, threadId ?? ""),
    queryFn: () => api.threads.get(orgId, threadId ?? ""),
    enabled: Boolean(threadId),
    staleTime: 15_000,
    // Every opening reads it, as its replies: the open thread clears its unread in this cache before this query
    // mounts, which would pass for a fresh read, and its count and people kept what they were when it last read.
    refetchOnMount: "always",
    placeholderData: () => (threadId ? cachedThreadInfo(qc, orgId, threadId) : undefined),
  });
}

/**
 * A thread's root and replies (the same cache the channel uses for agent replies). Until they are read, the root
 * the channel already holds stands in (`isPlaceholderData`): only the replies are still unknown.
 */
export function useThreadMessages(orgId: string, channelId: string | undefined, rootId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    placeholderData: () => {
      const root = channelId ? cachedTopLevel(qc, orgId, rootId, channelId) : undefined;
      return root ? [root] : undefined;
    },
    queryKey: keys.thread(orgId, channelId ?? "", rootId),
    queryFn: async ({ client, queryKey }) => {
      const start = client.getQueryData<Message[]>(queryKey);
      const read = await api.chat.messages(orgId, channelId ?? "", { threadId: rootId, limit: THREAD_PAGE });
      return withLocalCopies(read, client.getQueryData<Message[]>(queryKey), outbox.has, start);
    },
    enabled: Boolean(channelId),
    staleTime: 30_000,
    // Every opening reads it: a reply heard live keeps the list looking fresh while it may lack what was said when
    // this channel wasn't listened to.
    refetchOnMount: "always",
  });
}

/** How far back the context block looks for the start of a range (pages of 200). */
const RANGE_PAGES = 5;

/**
 * The messages of a thread's context range, oldest first. Not moved: the
 * context channel's top-level messages from the first to the last, minus the
 * excluded ones. Moved: they are replies of the root now, written before it
 * (real replies always come after the root, which is made after the range).
 */
export async function loadThreadRange(api: ApiClient, orgId: string, thread: ThreadInfo): Promise<Message[]> {
  const ctx = thread.context;
  if (!ctx) return [];
  if (ctx.moved) {
    // Only those before the root: a thread's read holds its latest replies, and these are its oldest.
    const all = await api.chat.messages(orgId, thread.channelId, {
      threadId: thread.id,
      before: thread.createdAt,
      limit: 200,
    });
    return all.filter((m) => m.id !== thread.id && m.createdAt < thread.createdAt);
  }
  let list = await api.chat.messages(orgId, ctx.channelId, { limit: 200 });
  for (let page = 1; page < RANGE_PAGES && !list.some((m) => m.id === ctx.firstMessageId); page++) {
    const oldest = list[0];
    if (!oldest) break;
    const older = await api.chat.messages(orgId, ctx.channelId, { before: oldest.createdAt, limit: 200 });
    if (older.length === 0) break;
    list = [...older, ...list];
  }
  const from = list.findIndex((m) => m.id === ctx.firstMessageId);
  const to = list.findIndex((m) => m.id === ctx.lastMessageId);
  if (from < 0 || to < from) return [];
  const excluded = new Set(ctx.excludedMessageIds);
  return list.slice(from, to + 1).filter((m) => !excluded.has(m.id) && m.id !== thread.id && !m.meta?.threadStart);
}

export function useThreadRange(orgId: string, thread: ThreadInfo | undefined, enabled = true) {
  const api = useApi();
  const ctx = thread?.context;
  return useQuery({
    queryKey: [
      ...keys.threadRange(orgId, thread?.id ?? ""),
      ctx?.firstMessageId,
      ctx?.lastMessageId,
      ctx?.excludedMessageIds.length,
      ctx?.moved,
    ],
    queryFn: () => (thread ? loadThreadRange(api, orgId, thread) : Promise.resolve([])),
    enabled: Boolean(enabled && thread?.context),
    staleTime: 30_000,
  });
}

/** After a change: lists, the thread, and both conversations (markers, moved messages). */
function refreshThread(qc: ReturnType<typeof useQueryClient>, orgId: string, thread: ThreadInfo, gone = false) {
  if (gone) qc.removeQueries({ queryKey: keys.threadInfo(orgId, thread.id) });
  else qc.setQueryData(keys.threadInfo(orgId, thread.id), thread);
  void qc.invalidateQueries({ queryKey: keys.threads(orgId), predicate: (q) => q.queryKey[3] !== "one" });
  for (const channelId of new Set([thread.channelId, thread.context?.channelId].filter(Boolean) as string[])) {
    void qc.invalidateQueries({ queryKey: ["org", orgId, "channel", channelId] });
  }
}

export function useCreateThread(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: ThreadCreateInput) => api.threads.create(orgId, input),
    onSuccess: (thread) => refreshThread(qc, orgId, thread),
  });
}

/**
 * Every change to one thread: rename or adjust (`update`), the actions
 * (move, return, close, reopen, archive, unarchive) and undoing a new one
 * (`delete`). Errors are the caller's to say (translated by code).
 */
export function useThreadMutation(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (
      change:
        | { type: "update"; thread: ThreadInfo; patch: ThreadPatch }
        | { type: "action"; thread: ThreadInfo; action: ThreadAction }
        | { type: "delete"; thread: ThreadInfo },
    ): Promise<ThreadInfo | null> => {
      if (change.type === "update") return api.threads.update(orgId, change.thread.id, change.patch);
      if (change.type === "action") return api.threads.act(orgId, change.thread.id, change.action);
      await api.threads.remove(orgId, change.thread.id);
      return null;
    },
    // The view a change came back with (its `canManage` is ours); a deleted thread leaves the cache.
    onSuccess: (thread, change) => refreshThread(qc, orgId, thread ?? change.thread, change.type === "delete"),
  });
}

// ── Notifications ────────────────────────────────────────────────────────────

type QC = ReturnType<typeof useQueryClient>;

/** One filter's list (pages of 50), with the counts of every filter on the first page. */
export function useNotifications(orgId: string, filter: NotificationFilter) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.notificationList(orgId, filter),
    queryFn: ({ pageParam }) =>
      api.notifications.list(orgId, { filter, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** The badge on the bell: unread (and how many wait on me). Live via `notification.counts`. */
export const useNotificationCount = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.notificationCount(orgId),
    queryFn: () => api.notifications.count(orgId),
    staleTime: 60_000,
    meta: { quiet: true },
  });
};

/**
 * "Esperando você" (ADR 0172): what waits on me in this workspace, oldest first. Live through the inbox's own events
 * (`applyNotificationEvent`).
 */
export const useWaitingOnMe = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.waiting(orgId),
    queryFn: () => api.notifications.waiting(orgId),
    staleTime: 60_000,
    meta: { quiet: true },
  });
};

/** What reaches my devices as a notification in this workspace (ADR 0071 §8). */
export const useNoticePrefs = (orgId: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.noticePrefs(orgId), queryFn: () => api.notifications.prefs(orgId) });
};

/** One category on or off: the switch moves at once, and goes back if the server refuses. */
export function useSetNoticePref(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, on }: { category: NoticeCategory; on: boolean }) =>
      api.notifications.setPref(orgId, category, on),
    onMutate: async ({ category, on }) => {
      await qc.cancelQueries({ queryKey: keys.noticePrefs(orgId) });
      const before = qc.getQueryData<NoticePrefs>(keys.noticePrefs(orgId));
      qc.setQueryData<NoticePrefs>(keys.noticePrefs(orgId), (prefs) =>
        prefs ? { ...prefs, categories: prefs.categories.map((c) => (c.id === category ? { ...c, on } : c)) } : prefs,
      );
      return { before };
    },
    onError: (_error, _input, context) => qc.setQueryData(keys.noticePrefs(orgId), context?.before),
    onSuccess: (prefs) => qc.setQueryData(keys.noticePrefs(orgId), prefs),
  });
}

/** "Pedir a um admin" (`admin_ask`): sent to whoever may do it. */
export function useAskAdmins(orgId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (ask: AdminAsk) => api.notifications.askAdmins(orgId, ask) });
}

/** Where I put the tools at the top of my sidebar in this workspace (only the ones I moved). */
export const useSidebarItems = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.sidebarItems(orgId),
    queryFn: () => api.orgs.sidebarItems(orgId),
    staleTime: 60_000,
  });
};

/**
 * Moves one tool, or with `null` puts every tool back on its default: the sidebar changes at once and goes back if the
 * server refuses. The server keeps my other choices as it has them, so one made on another device stays, and answers
 * with every choice it keeps. The requests go one at a time, so the last answer is what stays (`onMutate` still runs
 * at once for one that waits its turn). A tool put where the workspace's mode has it by default (`personal`, ADR
 * 0158) is no choice: it is dropped, and follows the mode from then on.
 */
export function useSetSidebarItem(orgId: string, personal = false) {
  const api = useApi();
  const qc = useQueryClient();
  const mutationKey = ["sidebar-items", orgId];
  return useMutation({
    mutationKey,
    scope: { id: `sidebar-items:${orgId}` },
    mutationFn: (move: { item: SidebarItem; place: SidebarPlace } | null) =>
      move
        ? api.orgs.setSidebarItem(
            orgId,
            move.item,
            move.place === sidebarDefaults(personal)[move.item] ? null : move.place,
          )
        : api.orgs.setSidebarItems(orgId, {}),
    onMutate: async (move) => {
      await qc.cancelQueries({ queryKey: keys.sidebarItems(orgId) });
      const before = qc.getQueryData<SidebarItems>(keys.sidebarItems(orgId));
      qc.setQueryData<SidebarItems>(keys.sidebarItems(orgId), (items) =>
        move ? withSidebarPlace(items, move.item, move.place, personal) : {},
      );
      return { before };
    },
    onError: (_error, _move, context) => {
      // A later choice still on its way answers with every choice the server keeps: its answer decides.
      if (qc.isMutating({ mutationKey }) > 1) return;
      qc.setQueryData(keys.sidebarItems(orgId), context?.before);
      // `before` can hold an earlier choice the server refused as well: it says what stays.
      void qc.invalidateQueries({ queryKey: keys.sidebarItems(orgId) });
    },
    // A later choice still on its way keeps the screen until its own answer.
    onSuccess: (items) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(keys.sidebarItems(orgId), items);
    },
  });
}

/**
 * A sidebar order's cache, per mode: the server answers an order never saved with the default of the workspace's mode
 * (ADR 0159), so a workspace that changes mode reads it again at once.
 */
const sidebarOrderKey = (orgId: string, personal: boolean) =>
  [...keys.sidebarOrder(orgId), personal ? "personal" : "team"] as const;
const sidebarToolOrderKey = (orgId: string, personal: boolean) =>
  [...keys.sidebarToolOrder(orgId), personal ? "personal" : "team"] as const;

/** The sidebar's sections in my order in this workspace (the default of its mode until it loads). */
export const useSidebarOrder = (orgId: string, personal = false): SidebarSection[] => {
  const api = useApi();
  return (
    useQuery({
      queryKey: sidebarOrderKey(orgId, personal),
      queryFn: () => api.orgs.sidebarOrder(orgId),
      staleTime: 60_000,
    }).data ?? [...sidebarSections(personal)]
  );
};

/** Saves my section order (`null`: the default): the sidebar changes at once and goes back if the server refuses. */
export function useSetSidebarOrder(orgId: string, personal = false) {
  const api = useApi();
  const qc = useQueryClient();
  const key = sidebarOrderKey(orgId, personal);
  return useMutation({
    scope: { id: `sidebar-order:${orgId}` },
    mutationFn: (order: SidebarSection[] | null) => api.orgs.setSidebarOrder(orgId, order),
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<SidebarSection[]>(key);
      qc.setQueryData<SidebarSection[]>(key, order ?? [...sidebarSections(personal)]);
      return { before };
    },
    onError: (_error, _order, context) => qc.setQueryData(key, context?.before),
    onSuccess: (order) => qc.setQueryData(key, order),
  });
}

/** How my sidebar shows the agents, and what I pinned, in this workspace (the default until it loads). */
export const useSidebarView = (orgId: string): SidebarView => {
  const api = useApi();
  return (
    useQuery({
      queryKey: keys.sidebarView(orgId),
      queryFn: () => api.orgs.sidebarView(orgId),
      staleTime: 60_000,
    }).data ?? SIDEBAR_VIEW_DEFAULT
  );
};

/**
 * Changes my sidebar view: the sidebar changes at once and the whole view goes to the server, one request at a time,
 * so the last change is what stays. Each change starts from the latest view on screen, so two quick ones never undo
 * each other; a refusal brings back what the server keeps.
 */
export function useSetSidebarView(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.sidebarView(orgId);
  const mutationKey = ["sidebar-view", orgId];
  const save = useMutation({
    mutationKey,
    scope: { id: `sidebar-view:${orgId}` },
    mutationFn: (view: SidebarView) => api.orgs.setSidebarView(orgId, view),
    onError: () => {
      if (qc.isMutating({ mutationKey }) > 1) return;
      void qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (view) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(key, view);
    },
  });
  return (change: (now: SidebarView) => SidebarView) => {
    void qc.cancelQueries({ queryKey: key });
    const next = change(qc.getQueryData<SidebarView>(key) ?? SIDEBAR_VIEW_DEFAULT);
    qc.setQueryData(key, next);
    save.mutate(next);
  };
}

/** How I look at Tarefas in this workspace (the default until it loads, or when it can't). */
export const useIssuesView = (orgId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.issuesView(orgId),
    queryFn: () => api.orgs.issuesView(orgId),
    staleTime: 60_000,
  });
};

/**
 * Changes how I look at Tarefas (`null`: back to the default): the screen changes at once and the whole view goes to
 * the server, one request at a time, so the last change is what stays. Each change starts from the screen's latest
 * view, so two quick ones never undo each other; a refusal brings back what the server keeps.
 */
export function useSetIssuesView(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.issuesView(orgId);
  const mutationKey = ["issues-view", orgId];
  const save = useMutation({
    mutationKey,
    scope: { id: `issues-view:${orgId}` },
    mutationFn: (view: IssuesView) => api.orgs.setIssuesView(orgId, view),
    onError: () => {
      if (qc.isMutating({ mutationKey }) > 1) return;
      void qc.invalidateQueries({ queryKey: key });
    },
    // A later change still on its way keeps the screen until its own answer.
    onSuccess: (view) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(key, view);
    },
  });
  return (change: IssuesViewChange | null) => {
    void qc.cancelQueries({ queryKey: key });
    const now = qc.getQueryData<IssuesView>(key) ?? ISSUES_VIEW_DEFAULT;
    const next = withIssuesView(change ? now : ISSUES_VIEW_DEFAULT, change ?? {});
    qc.setQueryData(key, next);
    save.mutate(next);
  };
}

/**
 * The sidebar's tools in my order in this workspace (the default of its mode until it loads); a tool the app gained
 * since the order was saved goes at its end, as the server's `sidebarToolOrderOf` does.
 */
export const useSidebarToolOrder = (orgId: string, personal = false): SidebarItem[] => {
  const api = useApi();
  const saved = useQuery({
    queryKey: sidebarToolOrderKey(orgId, personal),
    queryFn: () => api.orgs.sidebarToolOrder(orgId),
    staleTime: 60_000,
  }).data;
  return knownToolOrder(saved ?? [], personal);
};

/** Saves my order of the tools (`null`: the default): the sidebar changes at once and goes back if the server refuses. */
export function useSetSidebarToolOrder(orgId: string, personal = false) {
  const api = useApi();
  const qc = useQueryClient();
  const key = sidebarToolOrderKey(orgId, personal);
  return useMutation({
    scope: { id: `sidebar-tool-order:${orgId}` },
    mutationFn: (order: SidebarItem[] | null) => api.orgs.setSidebarToolOrder(orgId, order),
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<SidebarItem[]>(key);
      qc.setQueryData<SidebarItem[]>(key, order ?? [...sidebarItemOrder(personal)]);
      return { before };
    },
    onError: (_error, _order, context) => qc.setQueryData(key, context?.before),
    onSuccess: (order) => qc.setQueryData(key, order),
  });
}

const listCaches = (qc: QC, orgId: string) =>
  qc.getQueriesData<NotificationPages>({ queryKey: [...keys.notifications(orgId), "list"] });

const knownNotification = (qc: QC, orgId: string, id: string) => {
  for (const [, data] of listCaches(qc, orgId)) {
    const hit = allItems(data).find((n) => n.id === id);
    if (hit) return hit;
  }
  return undefined;
};

/** The badge follows one item's change (read, done, snoozed, new) until the server's numbers arrive. */
function moveCount(qc: QC, orgId: string, before: AppNotification | undefined, after: AppNotification | undefined) {
  const delta = (f: "unread" | "waiting") =>
    (after && matchesFilter(after, f) ? 1 : 0) - (before && matchesFilter(before, f) ? 1 : 0);
  qc.setQueryData<NotificationCount>(keys.notificationCount(orgId), (c) =>
    c ? { unread: Math.max(0, c.unread + delta("unread")), waiting: Math.max(0, c.waiting + delta("waiting")) } : c,
  );
}

/** A fresh notification (event, server answer or my optimistic change) in every loaded list and the badge. */
export function cacheNotification(qc: QC, orgId: string, item: AppNotification) {
  const before = knownNotification(qc, orgId, item.id);
  for (const [key, data] of listCaches(qc, orgId)) {
    if (!data) continue;
    const filter = key[4] as NotificationFilter;
    qc.setQueryData<NotificationPages>(key, upsertInPages(data, filter, item, before));
  }
  moveCount(qc, orgId, before, item);
}

/** Resolved on its own (question answered, approval decided, turn passed): out of every list. */
/**
 * Takes a notification out of every list. `keepDone`: the `notification.removed` event says only that it left the
 * inbox, so "Concluídas" keeps it; a drop the page asks for (answered, passed) takes it from there too.
 */
export function dropNotification(qc: QC, orgId: string, id: string, keepDone = false) {
  const before = knownNotification(qc, orgId, id);
  for (const [key, data] of listCaches(qc, orgId)) {
    if (data && !(keepDone && key[4] === "done"))
      qc.setQueryData<NotificationPages>(key, removeFromPages(data, id, before));
  }
  moveCount(qc, orgId, before, undefined);
}

/** `notification.upserted` / `removed` / `counts` (user scope). */
export function applyNotificationEvent(qc: QC, orgId: string, event: NotificationEvent) {
  if (event.type === "notification.upserted" && event.notification.kind === "join_request")
    void qc.invalidateQueries({ queryKey: keys.joinRequests(orgId) });
  // What waits on me changes with a waiting row coming or any row leaving (a count alone says nothing new).
  if (event.type === "notification.removed" || (event.type === "notification.upserted" && event.notification.waiting))
    void qc.invalidateQueries({ queryKey: keys.waiting(orgId) });
  if (event.type === "notification.upserted") cacheNotification(qc, orgId, event.notification);
  else if (event.type === "notification.removed") {
    dropNotification(qc, orgId, event.id, true);
    // Marked done on another device: "Concluídas" gains it (one auto-resolved changes nothing there).
    void qc.invalidateQueries({ queryKey: keys.notificationList(orgId, "done") });
  } else {
    const count = { unread: event.unread, waiting: event.waiting };
    qc.setQueryData<NotificationCount>(keys.notificationCount(orgId), count);
    for (const [key, data] of listCaches(qc, orgId))
      if (data) qc.setQueryData<NotificationPages>(key, withServerCounts(data, count.unread, count.waiting));
  }
}

export const isNotificationEvent = (e: { type: string }): e is NotificationEvent =>
  e.type === "notification.upserted" || e.type === "notification.removed" || e.type === "notification.counts";

export type NotificationAction =
  | { type: "read"; item: AppNotification; read: boolean }
  | { type: "done"; item: AppNotification; done: boolean }
  /** `until: null` undoes a snooze ("Desfazer"). */
  | { type: "snooze"; item: AppNotification; until: string | null }
  | { type: "readAll"; filter: NotificationFilter }
  /** Undo of "Marcar tudo como lido": the ids it changed. */
  | { type: "unreadMany"; ids: string[] };

/** The changed items as the server sent them, and the ids "Marcar tudo como lido" touched. */
export interface NotificationActionResult {
  items: AppNotification[];
  ids: string[];
}

/** What an action does to the items we have, for the optimistic copy. */
function optimistic(qc: QC, orgId: string, action: NotificationAction, now: string): AppNotification[] {
  switch (action.type) {
    case "read":
      return [{ ...action.item, readAt: action.read ? (action.item.readAt ?? now) : null }];
    case "done":
      return [{ ...action.item, doneAt: action.done ? now : null }];
    case "snooze":
      return [{ ...action.item, snoozedUntil: action.until }];
    case "readAll": {
      const loaded = allItems(qc.getQueryData<NotificationPages>(keys.notificationList(orgId, action.filter)));
      return loaded.filter((n) => n.readAt === null).map((n) => ({ ...n, readAt: now }));
    }
    case "unreadMany":
      return action.ids.flatMap((id) => {
        const known = knownNotification(qc, orgId, id);
        return known ? [{ ...known, readAt: null }] : [];
      });
  }
}

/**
 * Read, Feito, Lembrar depois, Marcar tudo como lido (and their undo): the
 * lists and the badge change at once; a refusal puts them back.
 */
export function useNotificationAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: NotificationAction): Promise<NotificationActionResult> => {
      switch (action.type) {
        case "read":
          return { items: [await api.notifications.read(orgId, action.item.id, action.read)], ids: [action.item.id] };
        case "done":
          return { items: [await api.notifications.done(orgId, action.item.id, action.done)], ids: [action.item.id] };
        case "snooze":
          return {
            items: [await api.notifications.snooze(orgId, action.item.id, action.until)],
            ids: [action.item.id],
          };
        case "readAll":
          return { items: [], ids: (await api.notifications.readAll(orgId, action.filter)).ids };
        case "unreadMany":
          return {
            items: await Promise.all(action.ids.map((id) => api.notifications.read(orgId, id, false))),
            ids: action.ids,
          };
      }
    },
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: keys.notifications(orgId) });
      const lists = listCaches(qc, orgId);
      const count = qc.getQueryData<NotificationCount>(keys.notificationCount(orgId));
      for (const item of optimistic(qc, orgId, action, new Date().toISOString())) cacheNotification(qc, orgId, item);
      return { lists, count };
    },
    onError: (_error, _action, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.lists) qc.setQueryData(key, data);
      qc.setQueryData(keys.notificationCount(orgId), ctx.count);
    },
    onSuccess: (result) => {
      for (const item of result.items) cacheNotification(qc, orgId, item);
    },
    onSettled: (_r, _e, action) => {
      void qc.invalidateQueries({ queryKey: keys.notificationCount(orgId) });
      // Marking everything read touches items beyond the loaded pages.
      if (action.type === "readAll" || action.type === "unreadMany")
        void qc.invalidateQueries({ queryKey: [...keys.notifications(orgId), "list"] });
    },
  });
}

/**
 * "Responder" in the inbox, through the endpoints that already exist: a
 * message (channel, thread or DM), an issue comment, or an answer to an agent's
 * question.
 */
export function useNotificationReply(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, text, choice }: { target: ReplyTarget; text: string; choice?: boolean }) => {
      switch (target.kind) {
        case "message": {
          const message = await api.chat.post(orgId, target.channelId, {
            body: text,
            clientId: newClientId(),
            ...(target.threadId ? { threadId: target.threadId } : {}),
          });
          cacheMessage(qc, orgId, message);
          return { kind: "message" as const, message };
        }
        case "issue":
          await api.issues.comment(orgId, target.issueId, text);
          void qc.invalidateQueries({ queryKey: keys.issueActivity(orgId, target.issueId) });
          void qc.invalidateQueries({ queryKey: keys.issues(orgId) });
          return { kind: "issue" as const };
        case "question":
          return {
            kind: "question" as const,
            question: await api.questions.answer(orgId, target.questionId, choice ? { choice: text } : { text }),
          };
      }
    },
  });
}

// ── Phone app: read state, pins, following, working now, reminders ─────────────

/** The optional parts of the client (`ApiClient.pins`…): throws when this client lacks one. */
function part<
  K extends
    | "pins"
    | "threadFollows"
    | "reads"
    | "working"
    | "reminders"
    | "actions"
    | "actionCards"
    | "agentForYou"
    | "gifs",
>(api: ApiClient, name: K): NonNullable<ApiClient[K]> {
  const value = api[name];
  if (!value) throw new Error(`This API client has no ${name}`);
  return value as NonNullable<ApiClient[K]>;
}

/** Marks a channel or DM read now; the channel and DM lists show it with no unread at once. */
export function useMarkChannelRead(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (channelId: string) => api.dms.markRead(orgId, channelId),
    onMutate: (channelId) => clearUnread(qc, orgId, channelId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
      void qc.invalidateQueries({ queryKey: keys.dms(orgId) });
      void qc.invalidateQueries({ queryKey: keys.unreadThreads(orgId) });
    },
  });
}

/**
 * The right hand waves under its greeting on the person's first visit to its DM (ADR 0137 §6): decided once, as the
 * DM opens, and kept for the visit. That visit marks the DM read, even with nothing in it yet, so the next one, on
 * any device, has no wave.
 */
export function useRightHandWave(orgId: string, agentId: string): boolean {
  const dms = useDms(orgId);
  const markRead = useMarkChannelRead(orgId).mutate;
  const first = firstVisitOf(dms.data, agentId);
  const [wave, setWave] = useState(first);
  const channelId = dms.data?.find((d) => d.with.type === "agent" && d.with.id === agentId)?.channelId;
  useEffect(() => {
    if (first === undefined) return;
    setWave((w) => w ?? first);
    if (first && channelId) markRead(channelId);
  }, [first, channelId, markRead]);
  return wave === true;
}

/**
 * A DM just opened, from `dms.open`'s answer, in the cached DM list: its header and the search find it without the
 * list being read again. A list not loaded yet loads whole by itself.
 */
export function addDm(qc: QueryClient, orgId: string, dm: DirectMessage) {
  const key = keys.dms(orgId);
  const add = () =>
    qc.setQueryData<DirectMessage[]>(key, (list) =>
      list && !list.some((d) => d.channelId === dm.channelId) ? [...list, dm] : list,
    );
  add();
  // A read of the list already on its way (the sidebar's, started with the page) may have left before this DM
  // existed, and its answer would replace the list: once it lands, the DM goes in again, with no read of its own.
  void qc.refetchQueries({ queryKey: key, exact: true, fetchStatus: "fetching" }, { cancelRefetch: false }).then(add);
}

/** A conversation shows nothing unread in the cached lists (read here or on another device). */
function clearUnread(qc: QueryClient, orgId: string, channelId: string) {
  qc.setQueryData<Channel[]>(keys.channels(orgId), (list) =>
    list?.map((c) => (c.id === channelId ? { ...c, unreadCount: 0, mentionCount: 0 } : c)),
  );
  qc.setQueryData<DirectMessage[]>(keys.dms(orgId), (list) =>
    list?.map((d) => (d.channelId === channelId ? { ...d, unread: 0 } : d)),
  );
}

/** Mutes or unmutes a channel for me: it never looks unread while muted (a mention of me still counts). */
export function useMuteChannel(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, muted }: { channelId: string; muted: boolean }) =>
      part(api, "reads").mute(orgId, channelId, muted),
    onMutate: ({ channelId, muted }) => setMuted(qc, orgId, channelId, muted),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.channels(orgId) }),
  });
}

function setMuted(qc: QueryClient, orgId: string, channelId: string, muted: boolean) {
  qc.setQueryData<Channel[]>(keys.channels(orgId), (list) =>
    list?.map((c) => (c.id === channelId ? { ...c, muted } : c)),
  );
}

/** Marks a thread's replies read now (the thread open at its end); its unread and the Threads mark follow. */
export function useMarkThreadRead(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    // A client without reads (a test's fake) has nothing to mark.
    mutationFn: async (threadId: string) => api.reads?.markThreadRead(orgId, threadId),
    onMutate: (threadId) => clearThreadUnread(qc, orgId, threadId),
    onSettled: () => refreshThreadUnread(qc, orgId),
  });
}

function clearThreadUnread(qc: QueryClient, orgId: string, threadId: string) {
  qc.setQueryData<ThreadInfo>(keys.threadInfo(orgId, threadId), (t) => (t ? { ...t, unread: 0 } : t));
}

/** The thread lists, the Threads mark, the channels (a thread's replies count there too) and the tasks read again. */
function refreshThreadUnread(qc: QueryClient, orgId: string) {
  void qc.invalidateQueries({ queryKey: keys.threads(orgId), predicate: (q) => q.queryKey[3] !== "one" });
  void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
  void qc.invalidateQueries({ queryKey: keys.unreadTasks(orgId) });
}

/** How many threads I follow have a reply I haven't read (the Threads entry's mark); live via `applyUnreadEvent`. */
export function useUnreadThreads(orgId: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.unreadThreads(orgId),
    queryFn: () => part(api, "reads").unreadThreads(orgId),
    enabled: Boolean(api.reads),
    staleTime: 30_000,
  });
}

/**
 * The tasks whose conversation has a reply I haven't read (ADR 0145), with the ones that mention me. Under the tasks'
 * key, so whatever reads the boards again reads it too; a notice about a task and my reads refresh it as well.
 */
export function useUnreadTasks(orgId: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.unreadTasks(orgId),
    queryFn: () => api.reads?.unreadTasks?.(orgId) ?? Promise.resolve([]),
    enabled: Boolean(api.reads?.unreadTasks),
    staleTime: 30_000,
  });
}

/** One task's unread replies and mentions of me in its conversation; none: zeros. */
export function useTaskUnread(orgId: string, issueId: string) {
  const found = useUnreadTasks(orgId).data?.find((u) => u.issueId === issueId);
  return { unread: found?.unread ?? 0, mentions: found?.mentions ?? 0 };
}

/**
 * The Tarefas entry's marks, as a channel's: how many tasks have a reply I haven't read in their conversation (it goes
 * bold) and every mention of me there not read yet (its red number).
 */
export function useTasksUnread(orgId: string) {
  const list = useUnreadTasks(orgId).data ?? [];
  return {
    unread: list.filter((u) => u.unread > 0).length,
    mentions: list.reduce((n, u) => n + u.mentions, 0),
  };
}

/**
 * How long `channel.activity` waits for more before a list reads again: a burst of messages (an agent's steps) is one
 * read per client, however many members hear it.
 */
export const UNREAD_REFRESH_MS = 2000;
const activityTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Runs `read` once `UNREAD_REFRESH_MS` after the first call for `key`; calls meanwhile join it. */
function readOncePerBurst(key: string, read: () => void) {
  if (activityTimers.has(key)) return;
  activityTimers.set(
    key,
    setTimeout(() => {
      activityTimers.delete(key);
      read();
    }, UNREAD_REFRESH_MS),
  );
}

/** A task changed, a reply in its conversation too (ADR 0145): the boards on screen read again, once per burst. */
export function applyIssueEvent(qc: QueryClient, orgId: string, event: { type: string }) {
  if (
    event.type === "issue.created" ||
    event.type === "issue.updated" ||
    event.type === "issue.deleted" ||
    event.type === "issue.audience"
  )
    readOncePerBurst(`${orgId}:issues`, () => void qc.invalidateQueries({ queryKey: keys.issues(orgId) }));
  // A task's conversation has no members to hear `channel.activity`: a notice about the task is my news of it.
  else if (event.type === "notification.upserted" && taskNoticeOf(event))
    readOncePerBurst(`${orgId}:unread-tasks`, () => void qc.invalidateQueries({ queryKey: keys.unreadTasks(orgId) }));
}

const taskNoticeOf = (event: { type: string }) =>
  Boolean((event as { notification?: { source?: { issueId?: unknown } } }).notification?.source?.issueId);

/**
 * My own topic's unread marks, on the web and the phone: a message in a conversation I'm in has its list read again
 * (the DMs or the channels; a thread's reply, which the server sends only to its followers, the threads too), once
 * per burst; a read or a mute from any of my devices shows at once.
 */
export function applyUnreadEvent(qc: QueryClient, orgId: string, event: { type: string }) {
  const e = event as UnreadEvent;
  if (e.type === "channel.activity") {
    // Said where no screen of this app listens (a list loaded ahead, on hover or at start, counts as fresh): that
    // conversation reads again when it is shown.
    if (!openScreens.get(qc)?.has(`${orgId}:${e.channelId}`))
      void qc.invalidateQueries({ queryKey: ["org", orgId, "channel", e.channelId], refetchType: "none" });
    if (e.dm) readOncePerBurst(`${orgId}:dms`, () => void qc.invalidateQueries({ queryKey: keys.dms(orgId) }));
    else readOncePerBurst(`${orgId}:channels`, () => void qc.invalidateQueries({ queryKey: keys.channels(orgId) }));
    if (e.threadId)
      readOncePerBurst(
        `${orgId}:threads`,
        () => void qc.invalidateQueries({ queryKey: keys.threads(orgId), predicate: (q) => q.queryKey[3] !== "one" }),
      );
  } else if (e.type === "channel.read") {
    clearUnread(qc, orgId, e.channelId);
    void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
    void qc.invalidateQueries({ queryKey: keys.dms(orgId) });
    void qc.invalidateQueries({ queryKey: keys.unreadThreads(orgId) });
  } else if (e.type === "channel.muted") setMuted(qc, orgId, e.channelId, e.muted);
  else if (e.type === "thread.read") {
    clearThreadUnread(qc, orgId, e.threadId);
    refreshThreadUnread(qc, orgId);
  }
}

/**
 * The returns agents set in a conversation, still to come, the soonest first (ADR 0037): the bar above the composer
 * holds them. Live: a `follow_up` line's `message.created` refreshes it (`isReturnLine`).
 */
export function useFollowUps(orgId: string, channelId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: keys.followUps(orgId, channelId),
    queryFn: () => api.chat.followUps(orgId, channelId),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Cancels a return: it leaves the conversation's list at once (also when it had already come or gone: there is nothing
 * left to cancel), then the lists read again.
 */
export function useCancelFollowUp(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const drop = (channelId: string, messageId: string) =>
    qc.setQueryData<PendingReturn[]>(keys.followUps(orgId, channelId), (old) =>
      old?.filter((r) => r.messageId !== messageId),
    );
  return useMutation({
    mutationFn: async ({ messageId }: { channelId: string; messageId: string }) => {
      try {
        await api.chat.cancelFollowUp(orgId, messageId);
      } catch (error) {
        if (!(error instanceof ApiError && (error.status === 404 || error.status === 409))) throw error;
      }
    },
    onSuccess: (_done, { channelId, messageId }) => drop(channelId, messageId),
    onSettled: (_done, _error, { channelId }) => {
      void qc.invalidateQueries({ queryKey: keys.followUps(orgId, channelId) });
      void qc.invalidateQueries({ queryKey: keys.taskManager(orgId) });
      void qc.invalidateQueries({ queryKey: keys.agentStatus(orgId) });
    },
  });
}

/** A channel's pinned messages, newest pin first (live: `message.pinned` / `message.unpinned`). */
export function usePins(orgId: string, channelId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: keys.pins(orgId, channelId),
    queryFn: () => part(api, "pins").list(orgId, channelId),
    enabled: enabled && Boolean(api.pins),
    staleTime: 30_000,
  });
}

/** Pin or unpin a message; refreshes the pins and the conversation (its `pinned` marks). */
export function usePinMessage(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, messageId, pinned }: { channelId: string; messageId: string; pinned: boolean }) => {
      const pins = part(api, "pins");
      if (pinned) await pins.pin(orgId, channelId, messageId);
      else await pins.unpin(orgId, channelId, messageId);
    },
    onSuccess: (_v, { channelId }) => {
      void qc.invalidateQueries({ queryKey: keys.pins(orgId, channelId) });
      void qc.invalidateQueries({ queryKey: keys.messages(orgId, channelId) });
      void qc.invalidateQueries({ queryKey: ["org", orgId, "channel", channelId, "thread"] });
    },
  });
}

/** Follow or unfollow a thread; the thread views and the channel list (unread) follow. */
export function useFollowThread(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, following }: { threadId: string; following: boolean }) => {
      const follows = part(api, "threadFollows");
      return following ? follows.follow(orgId, threadId) : follows.unfollow(orgId, threadId);
    },
    onSuccess: (result) => {
      qc.setQueryData<ThreadInfo>(keys.threadInfo(orgId, result.threadId), (t) =>
        t ? { ...t, following: result.following } : t,
      );
      void qc.invalidateQueries({ queryKey: keys.threads(orgId), predicate: (q) => q.queryKey[3] !== "one" });
      void qc.invalidateQueries({ queryKey: keys.channels(orgId) });
    },
  });
}

/**
 * "Trabalhando agora": agent runs in progress where you are (refetch on `agent.run` / `run.finished`). `pollMs`: asked
 * again this often where no channel's events reach (Início).
 */
export function useWorkingRuns(orgId: string, enabled = true, pollMs: number | false = false) {
  const api = useApi();
  return useQuery({
    queryKey: keys.working(orgId),
    queryFn: () => part(api, "working").list(orgId),
    enabled: enabled && Boolean(api.working),
    staleTime: 10_000,
    refetchInterval: pollMs,
  });
}

/** How often the task manager asks again while it's open (ADR 0128): it follows every conversation at once. */
export const TASK_MANAGER_POLL_MS = 3_000;

/**
 * The task manager (ADR 0128): what the agents are doing now, what each one uses, each agent's last hour and what
 * ended since `since` (default: the last 24 h). Asked again every `pollMs` while shown. `doneToday` also asks the
 * count of tasks done since `since`, for the screen that shows it.
 */
export function useTaskManager(
  orgId: string,
  options: { since?: string; enabled?: boolean; pollMs?: number | false; doneToday?: boolean } = {},
) {
  const api = useApi();
  const qc = useQueryClient();
  const since = options.since ?? null;
  const counted = options.doneToday ?? false;
  return useQuery({
    queryKey: [...keys.taskManager(orgId), since, counted],
    queryFn: () => {
      const working = part(api, "working");
      if (!working.taskManager) throw new Error("This server has no task manager yet");
      return working.taskManager(orgId, options.since, counted);
    },
    // The counted answer holds everything the other one does, so a screen opened from the task manager shows it at once.
    placeholderData: counted
      ? undefined
      : () => qc.getQueryData<TaskManagerView>([...keys.taskManager(orgId), since, true]),
    enabled: (options.enabled ?? true) && Boolean(api.working?.taskManager),
    staleTime: 1_000,
    refetchInterval: options.pollMs ?? TASK_MANAGER_POLL_MS,
  });
}

/**
 * A task's steps for "Ver passos" (ADR 0128), to whoever sees it in the task manager: `workFromSteps(data.steps,
 * data.run)` draws them like the chat's work block. `pollMs` while it still works.
 */
export function useTaskSteps(orgId: string, runId: string | null, pollMs: number | false = false) {
  const api = useApi();
  return useQuery({
    queryKey: keys.taskSteps(orgId, runId ?? ""),
    queryFn: () => {
      const working = part(api, "working");
      if (!working.taskSteps) throw new Error("This server can't show a task's steps yet");
      return working.taskSteps(orgId, runId ?? "");
    },
    enabled: runId !== null && Boolean(api.working?.taskSteps),
    refetchInterval: pollMs,
  });
}

/**
 * "Parar" from the task manager or the chat's strip (ADR 0128): stops each task (with the reason the agent reads)
 * and refreshes the lists. Stopping several (an agent's "Parar todas") stops them one by one; one refused doesn't
 * keep the others running. `chain`: what each asked of other agents stops with it.
 */
export function useStopTasks(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runIds: string[]; reason?: string; chain?: boolean }) => {
      const results = await Promise.allSettled(
        input.runIds.map((id) => api.agents.cancelRun(orgId, id, input.reason, input.chain)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length && failed > 0) throw (results[0] as PromiseRejectedResult).reason;
      return { stopped: results.length - failed, failed };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.taskManager(orgId) });
      void qc.invalidateQueries({ queryKey: keys.working(orgId) });
    },
  });
}

/** Continuar agora on runs paused near a limit (the task manager's line over them). */
export function useContinueTasks(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runIds: string[]) => {
      if (!api.working?.continueTasks) throw new Error("This server can't continue tasks yet");
      return api.working.continueTasks(orgId, runIds);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.taskManager(orgId) });
      void qc.invalidateQueries({ queryKey: keys.working(orgId) });
    },
  });
}

/** "Dizer por quê" after stopping a task: the agent reads it (only who stopped it, once). */
export function useStopReason(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: string; reason: string }) => {
      if (!api.agents.stopReason) throw new Error("This server can't take a reason yet");
      return api.agents.stopReason(orgId, input.runId, input.reason);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.taskManager(orgId) }),
  });
}

/** Your pending reminders, soonest first. */
export function useReminders(orgId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: keys.reminders(orgId),
    queryFn: () => part(api, "reminders").list(orgId),
    enabled: enabled && Boolean(api.reminders),
    staleTime: 30_000,
  });
}

/** "Lembrar" (create) and cancel. Errors are the caller's to say (translated by code). */
export function useReminderAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (action: { type: "create"; input: ReminderInput } | { type: "cancel"; id: string }) => {
      const reminders = part(api, "reminders");
      return action.type === "create" ? reminders.create(orgId, action.input) : reminders.cancel(orgId, action.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.reminders(orgId) });
      void qc.invalidateQueries({ queryKey: keys.routines(orgId) });
      void qc.invalidateQueries({ queryKey: keys.calendar(orgId) });
    },
  });
}

// ── GIFs (ADR 0091) ─────────────────────────────────────────────────────────

/** What a search box holds, once it has been still for `ms` (at once when it is emptied). */
export function useSettled(value: string, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), value.trim() ? ms : 0);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

/**
 * The picker's GIF search, a page at a time (`fetchNextPage` while `hasNextPage`): free text, a category, or
 * neither (what is trending), in the person's language (`lang`, two letters). Off while `enabled` is false or this
 * client has no GIF search. A search is kept a few minutes: going back to a chip shows it at once.
 */
export function useGifSearch(
  orgId: string,
  search: { q: string; category: GifCategory | null; lang: string },
  enabled = true,
) {
  const api = useApi();
  const q = search.q.trim();
  // Free text wins: a chip only searches with an empty box.
  const category = q ? null : search.category;
  return useInfiniteQuery({
    queryKey: keys.gifSearch(orgId, q, category, search.lang),
    queryFn: ({ pageParam }) =>
      part(api, "gifs").search(orgId, {
        ...(q ? { q } : {}),
        ...(category ? { category } : {}),
        offset: pageParam,
        limit: GIF_PAGE,
        lang: search.lang,
      }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next ?? undefined,
    enabled: enabled && Boolean(api.gifs),
    staleTime: 5 * 60_000,
    // The words already on screen stay while the next search loads (no flash of the empty state).
    placeholderData: (prev) => prev,
  });
}

// ── Databases (ADR 0039) ────────────────────────────────────────────────────

/** The organization's databases (no passwords), with the agents that read each. */
export const useDatabases = (orgId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.databaseList(orgId),
    queryFn: () => api.databases.list(orgId),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
};

/** A database's tables (the rules' table picker); on a whole server, of `database` (default: the sample). */
export const useDatabaseTables = (orgId: string, connectionId: string | null, database?: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.databaseTables(orgId, connectionId ?? "", database),
    queryFn: () => api.databases.tables(orgId, connectionId ?? "", database),
    enabled: Boolean(connectionId),
    staleTime: 5 * 60_000,
    retry: false,
  });
};

/** A whole-server connection's databases; `refresh()` reads the list again on the server. */
export const useServerDatabases = (orgId: string, connectionId: string, enabled = true) => {
  const api = useApi();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.serverDatabases(orgId, connectionId),
    queryFn: () => api.databases.serverDatabases(orgId, connectionId),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => api.databases.serverDatabases(orgId, connectionId, true),
    onSuccess: (names) => qc.setQueryData(keys.serverDatabases(orgId, connectionId), names),
  });
  return { ...query, refresh };
};

/** An agent's access and rules per database. */
export const useAgentDatabases = (orgId: string, agentId: string, enabled = true) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.agentDatabases(orgId, agentId),
    queryFn: () => api.databases.agent(orgId, agentId),
    enabled,
    retry: false,
  });
};

/** Connect, rename or reconnect, and disconnect a database; each refreshes every database read. */
export function useDatabaseAction(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.databases(orgId) });
  return {
    connect: useMutation({
      mutationFn: (input: DatabaseConnectionInput) => api.databases.connect(orgId, input),
      onSuccess: done,
      // The form says why (wrong password, server not reachable…).
      meta: { silent: true },
    }),
    update: useMutation({
      mutationFn: ({
        connectionId,
        ...input
      }: DatabaseConnectionInput & { connectionId: string; offActions?: DatabaseActionName[] }) =>
        api.databases.update(orgId, connectionId, input),
      onSuccess: done,
      meta: { silent: true },
    }),
    disconnect: useMutation({
      mutationFn: (connectionId: string) => api.databases.disconnect(orgId, connectionId),
      onSuccess: done,
    }),
  };
}

/** Saves an agent's access and rules for one database. */
export function useSetAgentDatabase(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      connectionId,
      input,
    }: {
      agentId: string;
      connectionId: string;
      input: AgentDatabaseInput;
    }) => api.databases.setAgent(orgId, agentId, connectionId, input),
    meta: { silent: true },
    onSuccess: (saved, { agentId }) => {
      qc.setQueryData<AgentDatabase[]>(keys.agentDatabases(orgId, agentId), (list) =>
        list ? list.map((d) => (d.connectionId === saved.connectionId ? saved : d)) : list,
      );
      void qc.invalidateQueries({ queryKey: keys.databaseList(orgId) });
      void qc.invalidateQueries({ queryKey: keys.scopes(orgId, agentId) });
    },
  });
}

/** `/autorizar?req=`: the app asking and the workspaces it could get (ADR 0119). Asked once: it answers once. */
export const useAppConsent = (requestId: string) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.appConsent(requestId),
    queryFn: () => api.apps.consent(requestId),
    enabled: requestId.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { quiet: true },
  });
};

/** Permitir or Cancelar on the consent page; the page goes to `redirectTo` once. */
export function useDecideAppConsent(requestId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AppConsentDecision) => api.apps.decide(requestId, input),
    meta: { silent: true },
    onSuccess: (_r, input) => {
      if (input.orgId) void qc.invalidateQueries({ queryKey: ["org", input.orgId, "apps"] });
    },
  });
}

/** Settings → AI apps. `pollMs`: also refetch this often (while waiting for an app to connect). */
export const useApps = (orgId: string, all = false, pollMs: number | false = false) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.apps(orgId, all),
    queryFn: () => api.apps.list(orgId, all),
    refetchInterval: pollMs,
  });
};

/** Desconectar an app, Revogar a token, Criar token: both lists refresh. */
export function useAppActions(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["org", orgId, "apps"] });
  return {
    disconnect: useMutation({ mutationFn: (grantId: string) => api.apps.disconnect(orgId, grantId), onSuccess: done }),
    revokeToken: useMutation({
      mutationFn: (grantId: string) => api.apps.revokeToken(orgId, grantId),
      onSuccess: done,
    }),
    createToken: useMutation({
      mutationFn: (input: PersonalTokenInput) => api.apps.createToken(orgId, input),
      meta: { silent: true },
      onSuccess: done,
    }),
  };
}

/**
 * While a phone guide waits for a phone on `machineId` (`on`), asks that computer now and every 20 s to also look for
 * a plugged phone it has no driver for: adb never lists one, and the computer looks only while asked.
 */
export function useLookForPhones(orgId: string, machineId: string | null, on: boolean) {
  const api = useApi();
  useEffect(() => {
    if (!on || !machineId) return;
    const look = () => void api.devices.lookForPhones(orgId, machineId).catch(() => undefined);
    look();
    const id = setInterval(look, PHONE_LOOK_MS);
    return () => clearInterval(id);
  }, [api, orgId, machineId, on]);
}

/**
 * The iPhones `machineId` (a Mac) offers over Wi-Fi, asked while `on` (its page or the iPhone guide is open, for who
 * may manage it): one is picked with `pick`, and the devices refetch so it shows up among the Mac's phones.
 */
export function useWifiIphones(orgId: string, machineId: string | null, on: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: keys.wifiIphones(orgId, machineId ?? ""),
    queryFn: () => api.devices.wifiIphones(orgId, machineId ?? ""),
    enabled: on && machineId !== null,
    retry: false,
    refetchInterval: WIFI_IPHONES_POLL_MS,
    meta: { quiet: true },
  });
  const pick = useMutation({
    mutationFn: (serial: string) => api.devices.pickIphoneOverWifi(orgId, machineId ?? "", serial),
    meta: { silent: true },
    onSuccess: (data) => {
      qc.setQueryData(keys.wifiIphones(orgId, machineId ?? ""), data);
      void qc.invalidateQueries({ queryKey: keys.devices(orgId) });
    },
  });
  return { available: on ? (list.data?.available ?? []) : [], pick };
}

/**
 * The iPhone guide's Developer Mode step asks its Mac: `look` reads the iPhone again now (the devices refetch once it
 * answered), `openXcode` opens Xcode there, which shows the switch on a plugged iPhone that hides it.
 */
export function useIphoneDevMode(orgId: string, machineId: string | null) {
  const api = useApi();
  const qc = useQueryClient();
  const look = useMutation({
    mutationFn: () => api.devices.lookForPhones(orgId, machineId ?? ""),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.devices(orgId) }),
  });
  const openXcode = useMutation({
    mutationFn: () => api.devices.openXcode(orgId, machineId ?? ""),
    meta: { silent: true },
  });
  return { look, openXcode };
}

/**
 * A Mac fixing its own Xcode for the iPhone guide (`on`: the guide shows the Xcode step to who may manage the Mac):
 * where the last fix stands, asked every 1.5 s while macOS's password window is open or the commands run. Once done,
 * the devices refetch: the Mac has already looked at Xcode again.
 */
export function useXcodeFix(orgId: string, machineId: string | null, on: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  const key = keys.xcodeFix(orgId, machineId ?? "");
  const state = useQuery({
    queryKey: key,
    queryFn: () => api.devices.xcodeFix(orgId, machineId ?? ""),
    enabled: on && machineId !== null,
    retry: false,
    refetchInterval: (q) => (xcodeFixLive(q.state.data?.fix) ? XCODE_FIX_POLL_MS : false),
    meta: { quiet: true },
  });
  const done = state.data?.fix?.state === "done";
  useEffect(() => {
    if (done) void qc.invalidateQueries({ queryKey: keys.devices(orgId) });
  }, [done, qc, orgId]);
  const start = useMutation({
    mutationFn: (kind: "select" | "update") => api.devices.startXcodeFix(orgId, machineId ?? "", kind),
    meta: { silent: true },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const cancel = useMutation({
    mutationFn: () => api.devices.cancelXcodeFix(orgId, machineId ?? ""),
    meta: { silent: true },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  return { view: on ? state.data : undefined, start, cancel };
}

/**
 * Where a Wi-Fi pairing that `started` stands (bring your own devices), asked every 1.5 s while the computer looks
 * for the phone, pairs or connects it. Another try, another computer or leaving the screen stops it on the computer.
 * The QR comes only with the start, so it is kept from there.
 */
export function useWifiPairState(orgId: string, machineId: string | null, started: WifiPairing | undefined) {
  const api = useApi();
  const id = started && wifiPairLive(started) ? started.id : null;
  const state = useQuery({
    queryKey: ["wifi-pair-state", orgId, machineId, id],
    queryFn: () => api.devices.wifiPairing(orgId, machineId ?? "", id ?? ""),
    enabled: id !== null && machineId !== null,
    gcTime: 0,
    retry: false,
    refetchInterval: (q) => (wifiPairLive(q.state.data ?? started) ? WIFI_PAIR_POLL_MS : false),
    meta: { quiet: true },
  });
  useEffect(() => {
    if (!id || !machineId) return;
    return () => void api.devices.cancelWifiPairing(orgId, machineId, id).catch(() => undefined);
  }, [api, orgId, machineId, id]);
  return started && state.data ? { ...state.data, qr: started.qr } : started;
}
