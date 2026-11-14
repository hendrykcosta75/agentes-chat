import type { Credential, OrgSettings } from "@agenteschat/client";
import {
  useAddCredential,
  useAiAccounts,
  useAuthConfig,
  useComposioUsage,
  useComputerSetup,
  useCredentials,
  useJoinRequests,
  usePlatformKey,
  useRemoveCredential,
  useRotateCredential,
  useServerTelemetry,
  useSetServerTelemetry,
  useSettings,
  useUpdateSettings,
  useUsageReport,
  useWorkspaceUsesApi,
} from "@agenteschat/client";
import { selfHosted, showsAbout } from "@agenteschat/client/lib/about";
import { keyRemovalText } from "@agenteschat/client/lib/ai-accounts";
import { composioUsageText, showsComposioUsage } from "@agenteschat/client/lib/composio";
import { computerEdition } from "@agenteschat/client/lib/computer";
import { settingsFrozen } from "@agenteschat/client/lib/deletion";
import { CUSTOM_PROVIDER } from "@agenteschat/client/lib/endpoints";
import { errorText, keyRefusal } from "@agenteschat/client/lib/errors";
import { FIELD_LIMITS } from "@agenteschat/client/lib/field-limits";
import { formatShortDate, formatUsd, relativeTime } from "@agenteschat/client/lib/format";
import { can } from "@agenteschat/client/lib/permissions";
import { settingsSectionNameKey, settingsSectionTextKey } from "@agenteschat/client/lib/personal-view";
import {
  keyLooksValid,
  keyName,
  keyNamedAfterProvider,
  type ProviderId,
  providerGuess,
  providerLabel,
  providerOf,
} from "@agenteschat/client/lib/providers";
import type { RoleTab } from "@agenteschat/client/lib/roles";
import { settingsNav, settingsTabs } from "@agenteschat/client/lib/settings-nav";
import { parseAmount } from "@agenteschat/client/lib/text";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  EmptyState,
  Field,
  Icon,
  InfoHint,
  Input,
  List,
  Locked,
  overLimit,
  PageHeader,
  ProviderLogo,
  SettingNote,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
} from "@agenteschat/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AboutSection } from "@/components/AboutSettings";
import { AccessMatrixSection } from "@/components/AccessLevels";
import { AccountSection } from "@/components/AccountSettings";
import { AiAppsSection } from "@/components/AiApps";
import { ApprovalsSection } from "@/components/ApprovalCover";
import { AuditSection } from "@/components/Audit";
import { AutoModelsRow } from "@/components/AutoModels";
import { usePlanHold } from "@/components/ai/ConnectAiSteps";
import { EndpointForm } from "@/components/ai/EndpointForm";
import { WhoPicksSection } from "@/components/ai/Jev";
import { BillingLinkButton } from "@/components/BillingLinkButton";
import { ConnectorsSection } from "@/components/Connectors";
import { DeleteWorkspaceDialog } from "@/components/DeleteWorkspace";
import type { ConnectStart } from "@/components/devices/ConnectDialog";
import { DevicePage } from "@/components/devices/DevicePage";
import { DevicesSection } from "@/components/devices/DevicesSection";
import { ImportExportSection } from "@/components/ImportFlow";
import { BillingMeters } from "@/components/Limits";
import { ErrorState, LoadingLine, LoadingList } from "@/components/Loading";
import { MediaSettingsSection } from "@/components/MediaSettings";
import { NoticePrefsSection } from "@/components/NoticePrefs";
import { useOrg } from "@/components/org-context";
import { UsageTabs } from "@/components/PeopleUsage";
import { ApiCard, PlanUsageCards } from "@/components/PlanUsage";
import { MyFace, OrgLogoDialog, OrgMark } from "@/components/ProfilePhoto";
import { KeyMismatch, KeyRefused, KeySite, ProviderKeySelect } from "@/components/ProviderKey";
import { RolesSection } from "@/components/roles/RolesSection";
import { SkillsSection } from "@/components/Skills";
import { StorageSection } from "@/components/StorageSettings";
import { TeamMemoryCard } from "@/components/TeamMemory";
import { OpenPrefsButton, useLocalServerHere } from "@/components/ThisMac";
import { VoiceSettingsSection } from "@/components/VoiceSettings";
import { VaultSection } from "@/components/vault/VaultSection";
import { WorkspaceModeDialog } from "@/components/WorkspaceModeDialog";
import { ZoneSelect } from "@/components/ZoneSelect";
import { useCentreCurrent } from "@/hooks/useCentreCurrent";
import { usePersonalView } from "@/hooks/usePersonalView";
import { useRightHandLook } from "@/hooks/useRightHandLook";
import { useTextLimit } from "@/hooks/useTextLimit";
import { useOpenParam } from "@/lib/open-param";
import { useToast } from "@/lib/toast";
import { InvitesPage } from "./InvitesPage";
import { MembersPage } from "./MembersPage";
import {
  isSettingsSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
  settingsNavEntry,
  settingsShort,
} from "./settings-sections";

/**
 * Settings: a left sub-nav and one section per URL (`/settings/connectors`, …).
 * Members only see what they can open.
 */
export function SettingsPage(props: ComponentProps<typeof Settings>) {
  // What this server offers decides the sections (`allowed`): the page waits for it, so none moves in afterwards.
  return useAuthConfig().isPending ? null : <Settings {...props} />;
}

function Settings({
  section,
  connected,
  outcome,
  review,
  mail,
  account,
  device,
  connect,
  install,
  skill,
  agent,
  person,
  role,
  tab,
  create,
}: {
  /** The section a link names; none (`/settings`): Geral for who opens it, else their first one. */
  section?: SettingsSection;
  connected?: string;
  /** Back from OAuth: what came in (`connected`, `reconnected`, `same_account`). */
  outcome?: string;
  review?: boolean;
  /** Back from Gmail/Outlook: `connected` or `failed`, and the mailbox (`account`). */
  mail?: string;
  account?: string;
  /** Skills, back from connecting GitHub in Instalar skill: the link to read again. */
  install?: string;
  /** Skills: the skill to open (a notice of its update). */
  skill?: string;
  /** Devices → one device: a computer's id, or `phones/<id>` (`/settings/devices/{path}`). */
  device?: string;
  /** Devices, with the connect dialog open on this flow (the phone guide's link opens the Android one). */
  connect?: ConnectStart;
  /** Auditoria: the agent it opens filtered to. Skills, with `install`: the agent whose card opened that install. */
  agent?: string;
  /** Orçamento e uso › Pessoas: the person whose month opens (a limit's notice). */
  person?: string;
  /** Cargos › one cargo (its id, `everyone` or `owner`) and its tab (`/settings/roles/{role}?tab=`). */
  role?: string;
  tab?: RoleTab;
  /** Cargos, with Criar cargo open (⌘K's "Criar cargo"). */
  create?: boolean;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const server = useAuthConfig().data;
  const visible = SETTINGS_SECTIONS.filter((s) => s.allowed(org, server));
  // A section a link names that this person can't open: their first one, their account, saying why. Opening the
  // settings with no section named has nothing to explain. Billing where no billing service runs, or Sobre and Voz on
  // agentes.chat Cloud, isn't about their role.
  const wanted = section ?? "general";
  const current = visible.some((s) => s.id === wanted) ? wanted : (visible[0]?.id ?? "account");
  const serverLacks =
    (section === "billing" && !server?.billingUrl) ||
    (section === "about" && !showsAbout(server)) ||
    (section === "voice" && !selfHosted(server));
  const refused = section && current !== section && !serverLacks ? section : null;
  const setup = useComputerSetup(org.id);
  const edition = computerEdition(setup.data);
  // One short list of entries, each a page whose tabs are the sections it holds, every other section under Advanced
  // (a personal workspace's own short list, ADR 0159 §3). A section's own address marks its entry.
  const personal = isPersonal(org);
  const opens = (id: SettingsSection) => visible.some((s) => s.id === id);
  // People joins a personal workspace's short list once someone else is a member (a family).
  const { others } = usePersonalView();
  const short = settingsShort(org, server, others);
  const nav = settingsNav(visible, short);
  const open = visible.map((s) => s.id);
  const marked = settingsNavEntry(current, open, short);
  const tabs = settingsTabs(marked, open, short).filter(isSettingsSection);
  const waiting = useJoinRequests(org.id, tabs.includes("invites")).data?.length ?? 0;
  const inAdvanced = nav.advanced.some((s) => s.id === marked);
  const [opened, setOpened] = useState(inAdvanced);
  // A section of Advanced opened by its address (⌘K, a card, a notice) shows in the list in that same render (the
  // strip centres its key then), and the list stays open after leaving it.
  const advanced = opened || inAdvanced;
  useEffect(() => {
    if (inAdvanced) setOpened(true);
  }, [inAdvanced]);
  const strip = useRef<HTMLDivElement>(null);
  useCentreCurrent(strip, marked);
  const sectionName = (id: SettingsSection) => t(settingsSectionNameKey(org, id));
  // An entry's name in the list: a team's Workspace, People and Connectors hold more than the section they open on.
  const entryName = (id: SettingsSection) =>
    !personal && id === "general"
      ? t("settings.group.org")
      : !personal && id === "members"
        ? t("settings.section.membersPersonal")
        : !personal && id === "connectors"
          ? t("access.kind.connectors")
          : sectionName(id);
  const navigate = useNavigate();
  const link = (s: (typeof visible)[number]) => (
    <li key={s.id}>
      <Link
        to="/org/$orgId/settings/$section"
        params={{ orgId: org.id, section: s.id }}
        className="settings__link"
        aria-current={s.id === marked ? "page" : undefined}
      >
        {s.id === "account" ? <MyFace size="xs" /> : <Icon name={s.icon} size={18} />}
        {entryName(s.id)}
      </Link>
    </li>
  );

  const sections = (
    <>
      {current !== "members" &&
        current !== "invites" &&
        current !== "general" &&
        current !== "roles" &&
        current !== "vault" && (
          <PageHeader
            level={2}
            title={sectionName(current)}
            meta={
              current !== "devices" ? (
                t(settingsSectionTextKey(org, current))
              ) : edition ? (
                t(edition === "cloud" ? "devices.leadCloud" : "devices.lead")
              ) : setup.isError ? null : (
                // Never one edition's words before the server says which this is (the section says if it couldn't).
                <LoadingLine width={320} />
              )
            }
          />
        )}
      {current === "account" && <AccountSection />}
      {current === "notifications" && <NoticePrefsSection />}
      {current === "approvals" && <ApprovalsSection />}
      {current === "apps" && <AiAppsSection />}
      {current === "general" && <GeneralSection />}
      {current === "members" && <MembersPage embedded />}
      {current === "invites" && <InvitesPage />}
      {current === "roles" && <RolesSection roleId={role} tab={tab} create={create} />}
      {current === "vault" && <VaultSection />}
      {current === "audit" && <AuditSection agent={agent} />}
      {current === "media" && <MediaSettingsSection />}
      {current === "voice" && <VoiceSettingsSection />}
      {current === "access" && <AccessMatrixSection />}
      {current === "connectors" && (
        <ConnectorsSection connected={connected} outcome={outcome} review={review} mail={mail} account={account} />
      )}
      {current === "skills" && <SkillsSection install={install} connected={connected} skill={skill} agent={agent} />}
      {current === "storage" && <StorageSection />}
      {current === "devices" && (device ? <DevicePage path={device} /> : <DevicesSection start={connect} />)}
      {current === "usage" && (
        <>
          <UsageTabs person={person} summary={<UsageSection />} />
          {opens("billing") && (
            <SettingsPart id="billing">
              <BillingSection />
            </SettingsPart>
          )}
        </>
      )}
      {current === "import" && <ImportExportSection />}
      {current === "billing" && <BillingSection />}
      {current === "about" && <AboutSection />}
    </>
  );
  // Being deleted, what would change the workspace is greyed out in one place, as on the phone (`settingsFrozen`).
  const body = settingsFrozen(org, current) ? (
    <fieldset className="settings__frozen" disabled>
      {sections}
    </fieldset>
  ) : (
    sections
  );

  return (
    <div className="settings page-split">
      <nav className="settings__nav" data-scroll-restoration-id="settings-nav" aria-label={t("settings.nav")}>
        <div className="settings__head">
          <h1 className="settings__title">{t("settings.title")}</h1>
          {/* Whose settings: the workspace's, by its mark and name; a personal workspace's are the person's own and
              name no workspace (ADR 0159). */}
          {!personal && (
            <span className="settings__org ac-iconline">
              <OrgMark logo={org.logo} size={18} />
              <span>{org.name}</span>
            </span>
          )}
        </div>
        <div className="settings__groups" ref={strip}>
          <div className="settings__group">
            <ul>{nav.main.map(link)}</ul>
          </div>
          {nav.advanced.length > 0 && (
            <div className="settings__group">
              <ul>
                <li>
                  <button
                    type="button"
                    className="settings__link"
                    aria-expanded={advanced}
                    onClick={() => setOpened(!advanced)}
                  >
                    <Icon name={advanced ? "chevronDown" : "chevronRight"} size={18} />
                    {t("settings.advanced")}
                  </button>
                </li>
                {advanced && nav.advanced.map(link)}
              </ul>
            </div>
          )}
        </div>
      </nav>
      <div className="settings__body" data-scroll-restoration-id="settings-section">
        {refused && <Alert tone="neutral">{t("settings.notOpen", { section: sectionName(refused) })}</Alert>}
        {tabs.length > 0 ? (
          <Tabs
            value={current}
            onValueChange={(section) =>
              void navigate({ to: "/org/$orgId/settings/$section", params: { orgId: org.id, section } })
            }
            label={entryName(marked)}
            items={tabs.map((id) => ({
              value: id,
              label: id === "account" ? t("settings.tab.account") : sectionName(id),
              // Convites says how many wait on the person (ADR 0184).
              count: id === "invites" && waiting > 0 ? waiting : undefined,
            }))}
          >
            <TabPanel value={current}>{body}</TabPanel>
          </Tabs>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

/** A section that stands on another one's page under its own heading: Plan and billing on AI and usage. */
function SettingsPart({ id, children }: { id: "billing"; children: ReactNode }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  return (
    <section className="settings__section" aria-labelledby={`settings-part-${id}`}>
      <PageHeader
        level={2}
        titleId={`settings-part-${id}`}
        title={t(settingsSectionNameKey(org, id))}
        meta={t(settingsSectionTextKey(org, id))}
      />
      {children}
    </section>
  );
}

/**
 * Plano e cobrança (ADR 0079): people and files against the plan's limits; the plan, card and invoices live on the
 * billing service, opened signed in.
 */
function BillingSection() {
  const { t } = useTranslation();
  const { org } = useOrg();
  return (
    <Card aria-label={t("settings.section.billing")}>
      <BillingMeters />
      <div className="ac-acts">
        <BillingLinkButton orgId={org.id} from="settings" variant="primary" icon="external">
          {t("billing.open")}
        </BillingLinkButton>
      </div>
    </Card>
  );
}

/**
 * Geral: the org's rows, the context every agent reads, then a
 * tile per area with how it is now. Every change saves by itself: name on blur, zone on pick, context
 * while typing. In a personal workspace it is About you (ADR 0159 §3): the context first, in the person's words, then
 * the time zone, name, checks and mode, and no tiles.
 */
function GeneralSection() {
  const { t } = useTranslation();
  const { org } = useOrg();
  const settings = useSettings(org.id);
  const update = useUpdateSettings(org.id);
  const editable = can(org, "configure");
  const personal = isPersonal(org);
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [timezone, setTimezone] = useState("");
  const [logo, setLogo] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [saved, setSaved] = useState(false);
  const loaded = useRef<string | null>(null);
  const contextTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const contextLimit = useTextLimit(FIELD_LIMITS.workspaceContext);
  // Filled once per org: a refetch after a save must not undo what is being typed.
  useEffect(() => {
    if (!settings.data || loaded.current === org.id) return;
    loaded.current = org.id;
    setName(settings.data.name);
    setContext(settings.data.context);
    setTimezone(settings.data.timezone);
  }, [settings.data, org.id]);
  useEffect(
    () => () => {
      clearTimeout(contextTimer.current);
      clearTimeout(savedTimer.current);
    },
    [],
  );

  const save = (patch: Partial<OrgSettings>) => {
    if (!editable) return;
    update.mutate(patch, {
      onSuccess: () => {
        setSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1800);
      },
    });
  };
  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(settings.data?.name ?? "");
      return;
    }
    if (next !== settings.data?.name) save({ name: next });
  };
  const changeContext = (value: string) => {
    setContext(value);
    clearTimeout(contextTimer.current);
    if (overLimit(value, contextLimit)) return;
    contextTimer.current = setTimeout(() => save({ context: value }), 800);
  };
  const flushContext = () => {
    clearTimeout(contextTimer.current);
    if (settings.data && context !== settings.data.context && !overLimit(context, contextLimit)) save({ context });
  };
  const addIdea = (label: string) => {
    const value = `${context.replace(/\s*$/, "")}${context.trim() ? "\n\n" : ""}${label}: `;
    changeContext(value);
    requestAnimationFrame(() => {
      const el = contextRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(value.length, value.length);
    });
  };
  const ideas = (["who", "now", "never"] as const).map((k) => t(modeKey(org, `settings.contextIdeas.${k}` as const)));
  const orgName = name.trim() || org.name;
  const contextTitle = t(modeKey(org, "settings.contextTitle"), { name: orgName });
  const missing = ideas.filter((label) => !context.toLowerCase().includes(label.toLowerCase()));
  const actionCheck = t(modeKey(org, "settings.actionCheck"));

  // Personal (ADR 0159 §3): About you, the context first; the logo, which a personal workspace shows nowhere it
  // matters, stays a team's row (switching to team brings it back).
  const logoRow = !personal && (
    <div className="settings-row ac-actrow">
      <div className="settings-row__text ac-actrow__text">
        <span className="settings-row__label">{t("orgLogo.label")}</span>
      </div>
      <div className="settings-row__control">
        <OrgMark logo={org.logo} size={32} className="settings__org-logo" />
        {editable && (
          <Button size="sm" type="button" onClick={() => setLogo(true)}>
            {org.logo ? t("orgLogo.change") : t("orgLogo.add")}
          </Button>
        )}
      </div>
    </div>
  );
  const nameRow = (
    <div className="settings-row ac-actrow">
      <div className="settings-row__text ac-actrow__text">
        <label className="settings-row__label" htmlFor="set-name">
          {t(modeKey(org, "settings.name"))}
        </label>
      </div>
      <div className="settings-row__control">
        <Input
          id="set-name"
          spellCheck={false}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          readOnly={!editable}
        />
      </div>
    </div>
  );
  const zoneRow = (
    <div className="settings-row ac-actrow">
      <div className="settings-row__text ac-actrow__text">
        <span className="ac-hintline">
          <span className="settings-row__label">{t("settings.timezone")}</span>
          <InfoHint name={t("common.about", { label: t("settings.timezone") })}>{t("settings.timezoneHelp")}</InfoHint>
        </span>
      </div>
      <div className="settings-row__control">
        <ZoneSelect
          value={timezone || "UTC"}
          onChange={(zone) => {
            setTimezone(zone);
            if (zone !== settings.data?.timezone) save({ timezone: zone });
          }}
          disabled={!editable}
          aria-label={t("settings.timezone")}
        />
      </div>
    </div>
  );
  const checkRow = (
    <div className="settings-row ac-actrow">
      <div className="settings-row__text ac-actrow__text">
        <span className="ac-hintline">
          <label className="settings-row__label" htmlFor="set-action-check">
            {actionCheck}
          </label>
          <InfoHint name={t("common.about", { label: actionCheck })} id="set-action-check-hint">
            {t(modeKey(org, "settings.actionCheckHelp"))}
          </InfoHint>
        </span>
      </div>
      <div className="settings-row__control">
        <Switch
          id="set-action-check"
          checked={settings.data?.actionCheck ?? true}
          onCheckedChange={(on) => save({ actionCheck: on })}
          disabled={!editable || !settings.data}
          aria-describedby="set-action-check-hint"
        />
      </div>
    </div>
  );
  // Who the workspace is for (ADR 0159 §4): the mode it is in now and, for who configures it, the switch to the other.
  const modeRow = (
    <div className="settings-row ac-actrow">
      <div className="settings-row__text ac-actrow__text">
        <span className="ac-hintline">
          <span className="settings-row__label">{t("settings.mode.label")}</span>
          <InfoHint name={t("common.about", { label: t("settings.mode.label") })}>
            {t(personal ? "settings.mode.personalHelp" : "settings.mode.teamHelp")}
          </InfoHint>
        </span>
      </div>
      <div className="settings-row__control">
        <span className="settings-row__value">{t(personal ? "settings.mode.personal" : "settings.mode.team")}</span>
        {editable && (
          <Button size="sm" type="button" onClick={() => setSwitching(true)}>
            {t(personal ? "settings.mode.toTeam" : "settings.mode.toPersonal")}
          </Button>
        )}
      </div>
    </div>
  );
  const workspaceCard = (
    <Card aria-label={t(modeKey(org, "settings.orgTitle"))}>
      <div className="settings-rows">
        {personal ? zoneRow : logoRow}
        {nameRow}
        {!personal && zoneRow}
        {checkRow}
        {modeRow}
      </div>
    </Card>
  );
  const contextCard = (
    <Card aria-labelledby="sec-context">
      <CardHeader
        id="sec-context"
        icon="agent"
        title={contextTitle}
        hint={{
          name: t("common.about", { label: contextTitle }),
          text: t("common.joinSentences", {
            a: t("settings.contextSubtitle"),
            b: t(modeKey(org, "settings.contextHelp"), { name: orgName }),
          }),
        }}
      />
      <Textarea
        ref={contextRef}
        rows={7}
        limit={contextLimit}
        value={context}
        onChange={(e) => changeContext(e.target.value)}
        onBlur={flushContext}
        readOnly={!editable}
        placeholder={t(modeKey(org, "settings.contextPlaceholder"))}
        aria-label={t(modeKey(org, "settings.context"))}
      />
      {editable && missing.length > 0 && (
        <div className="settings-ideas">
          <span>{t("settings.contextMissing")}</span>
          {missing.map((label) => (
            <Button key={label} size="sm" variant="ghost" icon="plus" onClick={() => addIdea(label)}>
              {label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        level={2}
        title={t(settingsSectionNameKey(org, "general"))}
        meta={t(settingsSectionTextKey(org, "general"))}
        actions={
          <span className="settings__saved" data-on={saved || undefined} role="status">
            {saved && (
              <>
                <Icon name="check" size={16} />
                {t("settings.savedShort")}
              </>
            )}
          </span>
        }
      />
      {!editable && <p className="page__note">{t("settings.readOnly")}</p>}

      {personal ? contextCard : workspaceCard}
      {personal ? workspaceCard : contextCard}

      <TeamMemoryCard />

      <UsageStatisticsCard />
      {org.role === "owner" && !org.deletion && <DeleteWorkspaceCard />}
      <OrgLogoDialog open={logo} onClose={() => setLogo(false)} />
      <WorkspaceModeDialog
        open={switching}
        to={personal ? "team" : "personal"}
        onClose={() => setSwitching(false)}
        onSwitched={(next) => setName(next.name)}
      />
    </>
  );
}

/**
 * Owners, at the bottom of Geral: deleting the workspace. Its dialog is kept in the address (`?delete=1`), which the
 * phone, the account's blockers and a sign-in again open.
 */
function DeleteWorkspaceCard() {
  const { t } = useTranslation();
  const { org } = useOrg();
  const [open, setOpen] = useOpenParam("delete");
  return (
    <Card aria-labelledby="sec-delete" className="settings-danger">
      <CardHeader
        id="sec-delete"
        icon="trash"
        title={t("deleteOrg.card.title")}
        subtitle={t("deleteOrg.card.text", { name: org.name })}
        action={
          <Button size="sm" variant="danger" onClick={() => setOpen(1)}>
            {t("deleteOrg.card.button")}
          </Button>
        }
      />
      <DeleteWorkspaceDialog org={org} open={open !== null} onClose={() => setOpen(null)} />
    </Card>
  );
}

/**
 * The usage report's switch (ADR 0060 §5): the title, the switch and "Ver o que é enviado". Only the
 * installation's owner gets it (the API answers `null` to everyone else, and on agentes.chat itself).
 */
function UsageStatisticsCard() {
  const { t } = useTranslation();
  const telemetry = useServerTelemetry();
  const set = useSetServerTelemetry();
  const [open, setOpen] = useState(false);
  const here = useLocalServerHere();
  const data = telemetry.data;
  if (!data) return null;
  // Switched off in the app that runs this server: on that very computer, its Preferences › Servers one click away.
  const inApp = data.envOff && data.report.install === "desktop" && here;
  return (
    <Card aria-labelledby="sec-telemetry">
      <CardHeader
        id="sec-telemetry"
        icon="chart"
        title={t("settings.telemetry.title")}
        action={
          <Button
            variant="link"
            onClick={() => {
              setOpen(true);
              void telemetry.refetch();
            }}
          >
            {t("settings.telemetry.see")}
          </Button>
        }
      />
      <div className="settings-rows">
        <div className="settings-row ac-actrow">
          <div className="settings-row__text ac-actrow__text">
            <span className="ac-hintline">
              <label className="settings-row__label" htmlFor="set-telemetry">
                {t("settings.telemetry.label")}
              </label>
              <InfoHint name={t("common.about", { label: t("settings.telemetry.label") })} id="set-telemetry-hint">
                {t("settings.telemetry.help")}
              </InfoHint>
            </span>
            {inApp ? (
              <span className="settings-row__status ac-actline">
                <span id="set-telemetry-help">{t("settings.telemetry.envOffHere")}</span>
                <OpenPrefsButton tab="servers">{t("machines.thisMac.openServers")}</OpenPrefsButton>
              </span>
            ) : (
              data.envOff && (
                <span className="settings-row__status" id="set-telemetry-help">
                  {t(
                    data.report.install === "desktop"
                      ? "settings.telemetry.envOffDesktop"
                      : "settings.telemetry.envOff",
                  )}
                </span>
              )
            )}
          </div>
          <div className="settings-row__control">
            <Switch
              id="set-telemetry"
              checked={data.enabled && !data.envOff}
              onCheckedChange={(on) => set.mutate(on)}
              disabled={data.envOff || set.isPending}
              aria-describedby={data.envOff ? "set-telemetry-hint set-telemetry-help" : "set-telemetry-hint"}
            />
          </div>
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("settings.telemetry.dialogTitle")}
        description={t("settings.telemetry.dialogText")}
        closeLabel={t("common.close")}
        width={560}
      >
        <DialogBody>
          <pre className="md__code" style={{ margin: 0, maxHeight: 420 }}>
            {JSON.stringify(data.report, null, 2)}
          </pre>
        </DialogBody>
      </Dialog>
    </Card>
  );
}

function KeysSection() {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const allowed = can(org, "manage_credentials");
  const credentials = useCredentials(org.id, allowed);
  const settings = useSettings(org.id);
  const platform = usePlatformKey(org.id);
  const updateSettings = useUpdateSettings(org.id);
  const remove = useRemoveCredential(org.id);
  const [dialog, setDialog] = useState<
    | null
    | { type: "add" }
    | { type: "rotate"; cred: Credential }
    | { type: "remove"; cred: Credential }
    | { type: "models"; cred: Credential }
  >(null);
  const look = useRightHandLook();
  const hold = usePlanHold();
  const plans = useAiAccounts(org.id).data?.accounts.length ?? 0;
  if (!allowed) return null;
  const live = (credentials.data ?? []).filter((c) => !c.revokedAt);
  const noKeys = credentials.isSuccess && live.length === 0;
  // On plans alone the screen is the accounts: the first key is added from "Conectar uma IA", and this card comes
  // with it.
  if (live.length === 0 && plans > 0) return null;
  return (
    <Card aria-labelledby="sec-keys">
      <CardHeader
        id="sec-keys"
        icon="key"
        title={t("settings.keysTitle")}
        hint={{ name: t("common.about", { label: t("settings.keysTitle") }), text: t("settings.keysSubtitle") }}
        action={
          !noKeys &&
          !hold && (
            <Button size="sm" icon="plus" onClick={() => setDialog({ type: "add" })}>
              {t("settings.addKey")}
            </Button>
          )
        }
      />
      {platform.data && <p className="small muted">{t("settings.platformAvailable")}</p>}
      {credentials.isLoading && <LoadingList count={2} avatar={false} trailing />}
      {hold && <SettingNote icon="alert">{t("connectAi.key.closed")}</SettingNote>}
      {noKeys && !hold && (
        <EmptyState
          size="panel"
          agent={look}
          title={t("settings.noKeysTitle")}
          actions={
            <Button variant="primary" icon="plus" onClick={() => setDialog({ type: "add" })}>
              {t("settings.addKey")}
            </Button>
          }
        >
          {t("settings.noKeys")}
        </EmptyState>
      )}
      {live.length > 0 && (
        <List className="key-list">
          {live.map((c) => {
            const isDefault = settings.data?.defaultCredentialId === c.id;
            return (
              <div key={c.id} className="ac-list__row key-row ac-mediarow ac-mediarow--row">
                <span className="ac-mediarow__face">
                  <ProviderLogo id={c.provider} size="sm" />
                </span>
                <span className="ac-mediarow__head">
                  <b>{c.label}</b>
                </span>
                <span className="ac-mediarow__body small muted">
                  <span>
                    {c.endpoint
                      ? `${c.endpoint.baseURL} · `
                      : `${keyNamedAfterProvider(c) ? "" : `${providerLabel(c.provider)} · `}${t("settings.keyEndsIn", { hint: c.keyHint })} · `}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {t("settings.keyAdded", { when: relativeTime(t, i18n.language, c.createdAt) })}
                    </span>
                  </span>
                </span>
                <span className="key-row__tail ac-mediarow__end ac-mediarow__end--wrap">
                  {c.endpoint ? (
                    <Button variant="link" onClick={() => setDialog({ type: "models", cred: c })}>
                      {t("endpoint.models")}
                    </Button>
                  ) : isDefault ? (
                    <Chip icon="check">{t("settings.default")}</Chip>
                  ) : (
                    <Button
                      variant="link"
                      disabled={updateSettings.isPending}
                      loading={updateSettings.isPending}
                      onClick={() => updateSettings.mutate({ defaultCredentialId: c.id })}
                    >
                      {t("settings.makeDefault")}
                    </Button>
                  )}
                  <div className="ac-acts">
                    {!hold && (
                      <Button variant="link" onClick={() => setDialog({ type: "rotate", cred: c })}>
                        {t("settings.rotate")}
                      </Button>
                    )}
                    <Button
                      variant="link"
                      className="ac-link--danger"
                      onClick={() => setDialog({ type: "remove", cred: c })}
                    >
                      {t("settings.remove")}
                    </Button>
                  </div>
                </span>
              </div>
            );
          })}
        </List>
      )}
      {live.some((c) => c.provider === "openrouter") && <AutoModelsRow />}
      <KeyDialog
        mode={dialog?.type === "add" ? "add" : dialog?.type === "rotate" ? "rotate" : null}
        cred={dialog && dialog.type !== "add" ? dialog.cred : undefined}
        onClose={() => setDialog(null)}
      />
      <Dialog
        open={dialog?.type === "models"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("endpoint.modelsTitle", { name: dialog?.type === "models" ? dialog.cred.label : "" })}
        closeLabel={t("common.close")}
        width={520}
      >
        {dialog?.type === "models" && (
          <EndpointForm
            orgId={org.id}
            credential={dialog.cred}
            onCancel={() => setDialog(null)}
            onDone={() => setDialog(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={dialog?.type === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("settings.removeTitle", { label: dialog?.type === "remove" ? dialog.cred.label : "" })}
        description={dialog?.type === "remove" ? keyRemovalText(t, dialog.cred, live, platform.data === true) : ""}
        closeLabel={t("common.close")}
        width={440}
      >
        <DialogFooter>
          <Button onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            loading={remove.isPending}
            onClick={() => {
              if (dialog?.type !== "remove") return;
              remove.mutate({ id: dialog.cred.id, purge: true, release: true }, { onSuccess: () => setDialog(null) });
            }}
          >
            {t("settings.remove")}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

/**
 * Adds or rotates a key. The Connect dialog (`ConnectAi`) opens it to add one with the provider it
 * guessed, or the key a person pasted in the chat, and hears when it was saved (`onAdded`).
 */
export function KeyDialog({
  mode,
  cred,
  onClose,
  provider: suggested,
  apiKey: pasted,
  title,
  onAdded,
}: {
  mode: "add" | "rotate" | null;
  cred: Credential | undefined;
  onClose: () => void;
  provider?: string;
  apiKey?: string;
  title?: string;
  onAdded?: (cred: Credential) => void;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const add = useAddCredential(org.id, true);
  const rotate = useRotateCredential(org.id, true);
  const [refused, setRefused] = useState<ReturnType<typeof keyRefusal>>(null);
  const failed = (e: unknown) => {
    setRefused(keyRefusal(t, e));
    if (!keyRefusal(t, e)) toast.show(errorText(t, e), "error");
  };
  const unchecked = (saved: Credential) => {
    if (saved.check === "unchecked")
      toast.show(t("connectAi.key.savedUnchecked", { provider: keyName(saved) }), "info");
  };
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  // "Outro provedor" (ADR 0146): its own form instead of a key's.
  const [custom, setCustom] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [touched, setTouched] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the form each time it opens
  useEffect(() => {
    setLabel("");
    setApiKey(pasted ?? "");
    setWorkspaceId("");
    setProvider(providerGuess(pasted, suggested ?? cred?.provider));
    setCustom(mode === "add" && suggested === CUSTOM_PROVIDER);
    setTouched(false);
    setRefused(null);
  }, [mode, cred]);
  // An endpoint's key (ADR 0146) has no published format: the server's 8-character floor is the whole check.
  const endpointKey = cred?.provider === CUSTOM_PROVIDER;
  const valid = endpointKey ? apiKey.trim().length >= 8 : keyLooksValid(provider, apiKey);
  const error =
    !touched || valid ? undefined : mode === "add" ? (
      <KeyMismatch provider={provider} apiKey={apiKey} onPick={setProvider} />
    ) : endpointKey ? (
      t("settings.keyInvalid")
    ) : (
      t(`onboarding.keyInvalid.${provider}`)
    );
  const pending = add.isPending || rotate.isPending;
  const providerSelect = (
    <Field label={t("settings.provider")} id="key-provider">
      <ProviderKeySelect
        value={custom ? CUSTOM_PROVIDER : provider}
        disabled={pending}
        onChange={(v) => {
          setCustom(v === CUSTOM_PROVIDER);
          if (v !== CUSTOM_PROVIDER) setProvider(v);
        }}
      />
    </Field>
  );
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(o) => !o && onClose()}
      title={
        mode === "rotate"
          ? t("settings.rotateTitle", { label: cred?.label ?? "" })
          : (title ?? t("settings.addKeyTitle"))
      }
      description={mode === "rotate" ? t("settings.rotateHelp") : undefined}
      closeLabel={t("common.close")}
      width={440}
    >
      {custom && mode === "add" ? (
        <EndpointForm
          orgId={org.id}
          lead={providerSelect}
          onCancel={onClose}
          onDone={(saved) => {
            onAdded?.(saved);
            onClose();
          }}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!valid) return;
            setRefused(null);
            if (mode === "rotate" && cred) {
              rotate.mutate(
                { id: cred.id, apiKey: apiKey.trim() },
                {
                  onError: failed,
                  onSuccess: (saved) => {
                    toast.show(t("settings.rotated"));
                    unchecked(saved);
                    onClose();
                  },
                },
              );
            } else {
              add.mutate(
                {
                  provider,
                  label: label.trim() || providerLabel(provider),
                  apiKey: apiKey.trim(),
                  ...(provider === "anthropic" && workspaceId.trim() ? { workspaceId: workspaceId.trim() } : {}),
                },
                {
                  onError: failed,
                  onSuccess: (saved) => {
                    unchecked(saved);
                    onAdded?.(saved);
                    onClose();
                  },
                },
              );
            }
          }}
        >
          <Locked when={pending}>
            <DialogBody>
              {mode === "add" && providerSelect}
              {mode === "add" && (
                <Field label={t("settings.keyLabel")} id="key-label">
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("settings.keyLabelPlaceholder", { provider: providerLabel(provider) })}
                  />
                </Field>
              )}
              <Field
                label={t("settings.keyValue")}
                id="key-value-set"
                error={error}
                example={endpointKey ? undefined : <KeySite provider={provider} />}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={endpointKey ? undefined : providerOf(provider)?.placeholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
              {refused && <KeyRefused refusal={refused} />}
              {mode === "add" && provider === "anthropic" && (
                <Field
                  label={t("onboarding.anthropicWorkspace")}
                  id="key-ws-set"
                  hint={{
                    name: t("common.about", { label: t("onboarding.anthropicWorkspace") }),
                    text: t("onboarding.anthropicWorkspaceHelp"),
                  }}
                >
                  <Input
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    placeholder={t("settings.workspaceIdPlaceholder")}
                    autoComplete="off"
                  />
                </Field>
              )}
            </DialogBody>
          </Locked>
          <DialogFooter>
            <Button onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {mode === "rotate" ? t("settings.rotate") : t("settings.saveKey")}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

/**
 * Uso (ADR 0063): the plan accounts by computer and the API per agent for everyone (money only for
 * admins), then the API's spend by kind and the default budget (admins).
 */
/**
 * IA e uso › Resumo: the workspace's AI accounts, then its provider keys (on plans alone, once it has one). What bills per use
 * (the API per agent, its spend by kind, the default budget) shows only once the workspace uses the API
 * (`workspaceUsesApi`): on plans alone there is no budget to show.
 */
function UsageSection() {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const usesApi = useWorkspaceUsesApi(org.id);
  const allowed = can(org, "view_usage") && usesApi;
  const report = useUsageReport(org.id, allowed);
  // Calls, not money: every member sees them.
  const composio = useComposioUsage(org.id);
  return (
    <>
      <PlanUsageCards />
      {composio.data && showsComposioUsage(composio.data) && (
        <Card>
          <span className="small">{composioUsageText(t, i18n.language, composio.data)}</span>
        </Card>
      )}
      <KeysSection />
      {usesApi && <ApiCard />}
      {allowed && (
        <Card aria-labelledby="sec-usage">
          <CardHeader id="sec-usage" icon="chart" title={t("settings.usageTitle")} />
          {report.isLoading && <LoadingList count={4} avatar={false} trailing />}
          {report.isError && !report.data && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}
          {report.data && (
            <>
              <span className="small muted">
                {t("settings.usageTotal", {
                  amount: formatUsd(i18n.language, report.data.totalUsd),
                  since: formatShortDate(i18n.language, report.data.since),
                })}
              </span>
              <div>
                {report.data.byKind.map((k) => (
                  <div key={k.kind} className="connector-row">
                    <span className="connector-row__name">{t(`settings.kinds.${k.kind}`)}</span>
                    <span className="connector-row__granted tabular">
                      {t("settings.usageCalls", { count: k.calls })}
                    </span>
                    <span className="tabular">{formatUsd(i18n.language, k.costUsd)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
      {allowed && <DefaultBudgetCard />}
      <WhoPicksSection />
    </>
  );
}

/** Budget of every agent without its own; members only ever see percentages of it. */
function DefaultBudgetCard() {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const settings = useSettings(org.id);
  const update = useUpdateSettings(org.id);
  const toast = useToast();
  const editable = can(org, "configure");
  const saved = settings.data?.defaultAgentBudgetUsd;
  const [value, setValue] = useState("");
  useEffect(() => {
    if (saved !== undefined) setValue(new Intl.NumberFormat(i18n.language).format(saved));
  }, [saved, i18n.language]);
  const amount = parseAmount(value);
  const invalid = value.trim() !== "" && !(amount > 0);
  const dirty = saved !== undefined && amount > 0 && amount !== saved;
  return (
    <Card aria-labelledby="sec-default-budget">
      <CardHeader id="sec-default-budget" icon="wallet" title={t("settings.defaultBudgetTitle")} />
      <form
        className="row"
        style={{ gap: 12, alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          update.mutate(
            { defaultAgentBudgetUsd: amount },
            { onSuccess: () => toast.show(t("settings.defaultBudgetSaved")) },
          );
        }}
      >
        <Locked when={update.isPending}>
          <Field
            label={t("settings.defaultBudget")}
            id="set-default-budget"
            hint={{
              name: t("common.about", { label: t("settings.defaultBudget") }),
              text: t("settings.defaultBudgetHelp"),
            }}
            error={invalid ? t("agent.budgetInvalid") : undefined}
          >
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              readOnly={!editable}
              disabled={saved === undefined}
            />
          </Field>
        </Locked>
        {editable && (
          <Button type="submit" variant="primary" disabled={!dirty || update.isPending} loading={update.isPending}>
            {t("common.save")}
          </Button>
        )}
      </form>
    </Card>
  );
}
