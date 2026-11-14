import type { Me } from "@agenteschat/client";
import { otherWorkspaces } from "@agenteschat/client/lib/deletion";
import { Button, LogoMark } from "@agenteschat/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@/components/AuthLayout";
import "@/components/auth.css";

/**
 * A workspace's address someone isn't in, in the sign-in's look (ADR 0184): the mark, the way in (an invitation from
 * someone there: asking to join takes a link, ADR 0068) and the way back to their other workspaces, or to the start
 * when they have none. `removedFrom`: the workspace they were just taken out of.
 */
export function NotMember({
  me,
  orgId,
  removedFrom,
  strip,
}: {
  me: Me;
  orgId: string;
  removedFrom: string | null;
  strip?: ReactNode;
}) {
  const { t } = useTranslation();
  const others = otherWorkspaces(me.organizations, orgId);
  return (
    <AuthShell languages={false}>
      {strip}
      <div className="auth__notice">
        <LogoMark size={48} />
        <h1>{removedFrom ? t("members.remove.goneTitle", { org: removedFrom }) : t("empty.noOrgTitle")}</h1>
        <p>{removedFrom ? t("members.remove.goneText") : t("empty.noOrgText")}</p>
        <Button asChild variant="primary" size="lg">
          <Link to="/">{others.length ? t("empty.noOrgBack") : t("empty.goHome")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
