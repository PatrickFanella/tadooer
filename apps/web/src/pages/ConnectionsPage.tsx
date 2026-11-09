import { SettingsDisclosure } from "../components/settings/SettingsDisclosure.tsx";
import { Bot, CalendarDays, Download, GitPullRequest } from "lucide-react";
import { SettingsLayout } from "../components/settings/SettingsLayout.tsx";
import { useState } from "react";
import type {
  BaikalStatusResponse,
  DayPlanResponse,
  GoogleConnectorStatusResponse,
  PlanningPreferences,
} from "@suite/contracts";
import { GooglePlanning } from "../google-planning.tsx";
import { CalendarMigration } from "../calendar-migration.tsx";
import { IssueConnections } from "../components/IssueConnections.tsx";
import { AssistantAccess } from "../components/AssistantAccess.tsx";
import { SuperProductivityImport } from "../components/SuperProductivityImport.tsx";
import { ImportedPluginData } from "../components/ImportedPluginData.tsx";
import { CalendarSubscriptions } from "../components/CalendarSubscriptions.tsx";
import { CalendarBridge } from "../components/CalendarBridge.tsx";
import { Alert, AlertDescription } from "../components/ui/alert.tsx";
import {
  ViewSection,
  ViewSectionBody,
  ViewSectionHeader,
} from "../components/shell/ViewSection.tsx";
import { EmptyState } from "../components/ui/empty-state.tsx";
import { ViewIntro } from "../components/shell/ViewIntro.tsx";
import { SectionHeading } from "../components/ui/section-heading.tsx";

export interface ConnectionsPageProps {
  readonly calendarMessage?: string | null;
  readonly baikal: BaikalStatusResponse;
  readonly google: GoogleConnectorStatusResponse | undefined;
  readonly planningPreferences: PlanningPreferences | undefined;
  readonly dayPlan: DayPlanResponse | undefined;
  readonly csrfToken: string;
  readonly getIssueCsrfToken: () => Promise<string>;
  readonly onIssueTaskChange: () => Promise<void>;
  readonly onTaskImport: () => Promise<void>;
  readonly busy: boolean;
  readonly onAuthorizeGoogle: (() => Promise<string>) | undefined;
  readonly onSyncGoogle: ((full?: boolean) => Promise<void>) | undefined;
  readonly onDisconnectGoogle: (() => Promise<void>) | undefined;
  readonly onAuthorizeGoogleWrite?: () => Promise<string>;
  readonly onWithdrawGoogleWrite?: () => Promise<void>;
  readonly onSavePlanningPreferences:
    ((preferences: PlanningPreferences) => Promise<void>) | undefined;
}

export const ConnectionsPage = ({
  calendarMessage,
  baikal,
  google,
  planningPreferences,
  dayPlan,
  csrfToken,
  getIssueCsrfToken,
  onTaskImport,
  onIssueTaskChange,
  busy,
  onAuthorizeGoogle,
  onSyncGoogle,
  onDisconnectGoogle,
  onAuthorizeGoogleWrite,
  onWithdrawGoogleWrite,
  onSavePlanningPreferences,
}: ConnectionsPageProps) => {
  // Reloads the imported plugin data list after an import (ADR 0026).
  const [imports, setImports] = useState(0);
  return (
    <div className="connections-page settings-page page-stack">
      <ViewIntro description="Calendars, imports and assistant access." />
      {calendarMessage && (
        <Alert variant="info" role="status" aria-live="polite">
          <AlertDescription>{calendarMessage}</AlertDescription>
        </Alert>
      )}
      <SettingsLayout
        searchLabel="Search connections"
        groups={[
          {
            id: "calendars",
            label: "Calendars",
            icon: CalendarDays,
            content: (
              <>
                {google !== undefined &&
                  planningPreferences !== undefined &&
                  dayPlan !== undefined &&
                  onAuthorizeGoogle !== undefined &&
                  onSyncGoogle !== undefined &&
                  onDisconnectGoogle !== undefined &&
                  onSavePlanningPreferences !== undefined && (
                    <GooglePlanning
                      mode="connection"
                      status={google}
                      preferences={planningPreferences}
                      dayPlan={dayPlan}
                      busy={busy}
                      onAuthorize={onAuthorizeGoogle}
                      onSynchronize={onSyncGoogle}
                      onDisconnect={onDisconnectGoogle}
                      onSavePreferences={onSavePlanningPreferences}
                      {...(onAuthorizeGoogleWrite === undefined ||
                      onWithdrawGoogleWrite === undefined
                        ? {}
                        : {
                            onAuthorizeWrite: onAuthorizeGoogleWrite,
                            onWithdrawWrite: onWithdrawGoogleWrite,
                          })}
                    />
                  )}
                {/* ADR 0044: needs a connected Google account and Baikal. */}
                {google?.connected === true && baikal.connected && (
                  <CalendarBridge
                    csrfToken={csrfToken}
                    google={google}
                    baikalCalendars={baikal.calendars}
                  />
                )}
                <SettingsDisclosure title="Calendar subscriptions">
                  <CalendarSubscriptions csrfToken={csrfToken} />
                </SettingsDisclosure>
                <ViewSection aria-labelledby="connections-calendars-title">
                  <ViewSectionHeader>
                    <SectionHeading
                      as="h3"
                      id="connections-calendars-title"
                      title="Discovered calendars"
                    />
                  </ViewSectionHeader>
                  <ViewSectionBody className="grid gap-3">
                    {baikal.calendars.length === 0 ? (
                      <EmptyState title="Baikal returned no calendars." />
                    ) : (
                      <ul className="calendars">
                        {baikal.calendars.map((calendar) => (
                          <li key={calendar.href}>
                            <strong>{calendar.displayName}</strong>
                            <span>
                              {[
                                calendar.supportsEvents ? "Events" : null,
                                calendar.supportsTodos ? "Todos" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
                                "No supported component reported"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <SettingsDisclosure title="Import and publish calendars">
                      {" "}
                      <CalendarMigration
                        calendars={baikal.calendars}
                        csrfToken={csrfToken}
                      />
                    </SettingsDisclosure>
                    <p className="boundary-note">
                      Tadooer reads a bounded window of each calendar. It
                      changes only the time blocks it created, and only when
                      they have not changed elsewhere. Calendar and focus
                      changes need a connection and are never queued.
                    </p>
                  </ViewSectionBody>
                </ViewSection>
              </>
            ),
          },
          {
            id: "issues",
            label: "Issue trackers",
            icon: GitPullRequest,
            content: (
              <>
                <IssueConnections
                  getCsrfToken={getIssueCsrfToken}
                  onTaskChange={onIssueTaskChange}
                />
              </>
            ),
          },
          {
            id: "assistant",
            label: "Assistant",
            icon: Bot,
            content: (
              <>
                <AssistantAccess csrfToken={csrfToken} />
              </>
            ),
          },
          {
            id: "imports",
            label: "Imports",
            icon: Download,
            content: (
              <>
                <SuperProductivityImport
                  csrfToken={csrfToken}
                  onApplied={async () => {
                    setImports((count) => count + 1);
                    await onTaskImport();
                  }}
                />
                <ImportedPluginData
                  csrfToken={csrfToken}
                  refreshKey={imports}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
