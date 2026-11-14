import { type ManagedTask, useStopTasks, useTaskManager } from "@agenteschat/client";
import { agentGrammar } from "@agenteschat/client/lib/grammar";
import { todayStart } from "@agenteschat/client/lib/task-manager";
import { useIsFocused } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { haptics, useToast } from "@/ui";
import { useOrgId } from "../shared/hooks";
import { agentTasksOf, doneTodayOf, type Place } from "./logic";

/**
 * A stopped task stays "Parando…" on screen this long after the server took the stop, so it doesn't flash back to
 * its old state before the list asks again; one still listed after it shows what it really is.
 */
const STOPPING_HOLD_MS = 8_000;

/** Nothing being stopped from here. */
const NO_STOPS: ReadonlySet<string> = new Set();

/**
 * The task manager with what ended today (ADR 0128), asked again while this screen is on top: every screen that
 * shows it (the list, a task, an agent's tasks, Agentes' row, a DM's header) reads the same entry, so moving between
 * them is instant. `doneToday` (the list's "done today") asks the count too, in an entry the others start from.
 */
export function useTasksToday(options: { enabled?: boolean; pollMs?: number; doneToday?: boolean } = {}) {
  const orgId = useOrgId();
  const focused = useIsFocused();
  return useTaskManager(orgId, {
    since: todayStart(),
    enabled: (options.enabled ?? true) && focused,
    doneToday: options.doneToday ?? false,
    ...(options.pollMs ? { pollMs: options.pollMs } : {}),
  });
}

/**
 * One agent's tasks now (null while it has none; `agentId` null asks nothing) and what it finished today. `here` tags
 * the ones asked in that conversation; `stopping` the ones this screen asked to stop.
 */
export function useAgentTasks(
  agentId: string | null,
  options: { here?: Place | null; stopping?: ReadonlySet<string>; pollMs?: number } = {},
) {
  const query = useTasksToday({ enabled: agentId !== null, ...(options.pollMs ? { pollMs: options.pollMs } : {}) });
  const list = query.data?.tasks;
  const ended = query.data?.ended;
  const channelId = options.here?.channelId ?? null;
  const threadId = options.here?.threadId ?? null;
  const stopping = options.stopping ?? NO_STOPS;
  const view = useMemo(() => {
    if (!agentId || !list) return null;
    return agentTasksOf(list, agentId, channelId ? { channelId, threadId } : null, stopping);
  }, [agentId, list, channelId, threadId, stopping]);
  const doneToday = useMemo(() => (agentId && ended ? doneTodayOf(ended, agentId) : 0), [agentId, ended]);
  return { view, doneToday, query };
}

/**
 * "Parar": stops tasks (with the reason the agent reads) and keeps them "Parando…" until they leave the list. Nothing
 * asked for one task; several are confirmed first by the screen that offers them.
 */
export function useStopper() {
  const { t } = useTranslation();
  const orgId = useOrgId();
  const toast = useToast();
  const { mutate } = useStopTasks(orgId);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const release = useCallback((runIds: readonly string[]) => {
    setStopping((was) => {
      const next = new Set(was);
      for (const id of runIds) next.delete(id);
      return next;
    });
  }, []);
  const stop = useCallback(
    (runIds: readonly string[], reason?: string, chain?: boolean) => {
      if (runIds.length === 0) return;
      haptics.firm();
      setStopping((was) => new Set([...was, ...runIds]));
      const why = reason?.trim();
      mutate(
        { runIds: [...runIds], ...(why ? { reason: why } : {}), ...(chain ? { chain } : {}) },
        {
          onSuccess: (result) => {
            if (result.failed > 0) toast({ title: t("taskManager.failed"), icon: "x" });
            setTimeout(() => release(runIds), STOPPING_HOLD_MS);
          },
          onError: () => {
            toast({ title: t("taskManager.failed"), icon: "x" });
            release(runIds);
          },
        },
      );
    },
    [mutate, release, toast, t],
  );
  return { stopping, stop };
}

/**
 * "Parar" asked by one alert, the system's: what stops and what the agent does; a task that asked other agents stops
 * them too. A task's screen and the work-along line's long press ask it.
 */
export function askToStop(
  t: TFunction,
  task: Pick<ManagedTask, "runId" | "helpers">,
  title: string,
  agentName: string,
  stop: (runIds: readonly string[], reason?: string, chain?: boolean) => void,
) {
  Alert.alert(
    t("mobile.taskManager.stopTitle", { title }),
    task.helpers ? t("taskManager.confirm.chainBody") : t("mobile.taskManager.stopBody", agentGrammar(agentName)),
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("taskManager.confirm.stop", { count: 1 + (task.helpers ?? 0) }),
        style: "destructive",
        onPress: () => stop([task.runId], undefined, true),
      },
    ],
  );
}
