import { isRightHand } from "@agenteschat/client/lib/right-hand";
import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { Main } from "@/components/Main";
import { useOrg } from "@/components/org-context";
import { useDirectory } from "@/hooks/useDirectory";
import { SettingsPage } from "@/pages/SettingsPage";
import {
  isSettingsSection,
  MOVED_SETTINGS_SECTIONS,
  RIGHT_HAND_SECTION,
  settingsSearch,
} from "@/pages/settings-sections";

/** The right hand's settings are its own page: its old settings address opens that, the settings while it loads. */
function RightHandRedirect() {
  const { org } = useOrg();
  const dir = useDirectory(org.id);
  const agent = dir.agents.find(isRightHand);
  if (dir.loading) return null;
  return agent ? (
    <Navigate to="/org/$orgId/agents/$agentId" params={{ orgId: org.id, agentId: agent.id }} replace />
  ) : (
    <Navigate to="/org/$orgId/settings" params={{ orgId: org.id }} replace />
  );
}

/** One settings section per URL: `/settings/connectors` (OAuth returns here with `?connected`/`?review=1`/`?mail`). */
export const Route = createFileRoute("/org/$orgId/settings_/$section")({
  validateSearch: settingsSearch,
  beforeLoad: ({ params, search }) => {
    // The admins' e-mail about a request (`?request=…&do=…`) names Members: requests are answered in Convites now.
    const moved =
      params.section === "members" && search.request !== undefined
        ? "invites"
        : MOVED_SETTINGS_SECTIONS[params.section];
    if (moved)
      throw redirect({
        to: "/org/$orgId/settings/$section",
        params: { ...params, section: moved },
        search,
        replace: true,
      });
    if (params.section !== RIGHT_HAND_SECTION && !isSettingsSection(params.section)) {
      throw redirect({ to: "/org/$orgId/settings", params: { orgId: params.orgId } });
    }
  },
  component: function SettingsSectionRoute() {
    const { section } = Route.useParams();
    const { connected, outcome, review, mail, account, install, skill, agent, person, create } = Route.useSearch();
    if (section === RIGHT_HAND_SECTION) return <RightHandRedirect />;
    return (
      <Main>
        <SettingsPage
          section={isSettingsSection(section) ? section : "general"}
          connected={connected}
          outcome={outcome}
          review={review !== undefined}
          mail={mail}
          account={account}
          install={install}
          skill={skill}
          agent={agent}
          person={person}
          create={create !== undefined}
        />
      </Main>
    );
  },
});
