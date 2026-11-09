import { Bell, CalendarDays, Database, Settings2, Timer } from "lucide-react";
import { SettingsLayout } from "../components/settings/SettingsLayout.tsx";
import type {
  DayPlanResponse,
  GoogleConnectorStatusResponse,
  NotificationPreferences,
  NotificationStatusResponse,
  PlanningPreferences,
  Project,
} from "@suite/contracts";
import type { ApplicationPreferencesState } from "../application-preferences.tsx";
import { ApplicationPreferencesSettings } from "../components/settings/ApplicationPreferencesSettings.tsx";
import { DataExportRestore } from "../components/settings/DataExportRestore.tsx";
import { CaptureLinkPreference } from "../components/tasks/CaptureLinkPreference.tsx";
import { SignedInDevices } from "../components/settings/SignedInDevices.tsx";
import { GooglePlanning } from "../google-planning.tsx";
import { NotificationSettings } from "../notification-settings.tsx";
import { FocusSettings, type FocusSettingsProps } from "../focus-settings.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  ViewSection,
  ViewSectionBody,
  ViewSectionHeader,
} from "../components/shell/ViewSection.tsx";
import { ViewIntro } from "../components/shell/ViewIntro.tsx";
import { SectionHeading } from "../components/ui/section-heading.tsx";
import {
  liveSyncStatusDescription,
  liveSyncStatusLabel,
  type LiveSyncStatus,
} from "../live-sync/status.ts";

export interface SettingsPageProps {
  readonly google: GoogleConnectorStatusResponse | undefined;
  readonly planningPreferences: PlanningPreferences | undefined;
  readonly dayPlan: DayPlanResponse | undefined;
  readonly notificationPreferences: NotificationPreferences | undefined;
  readonly notificationStatus: NotificationStatusResponse | undefined;
  readonly syncStatus: "online" | "offline" | "syncing" | undefined;
  /** ADR 0045 live sync state of this device. */
  readonly liveStatus?: LiveSyncStatus | undefined;
  readonly clientId: string | null;
  readonly plannerFreshness: string | undefined;
  readonly busy: boolean;
  readonly onAuthorizeGoogle: (() => Promise<string>) | undefined;
  readonly onSyncGoogle: ((full?: boolean) => Promise<void>) | undefined;
  readonly onDisconnectGoogle: (() => Promise<void>) | undefined;
  readonly onSavePlanningPreferences:
    ((preferences: PlanningPreferences) => Promise<void>) | undefined;
  readonly onSaveNotificationPreferences:
    ((preferences: NotificationPreferences) => Promise<void>) | undefined;
  readonly onTestNotification: (() => Promise<void>) | undefined;
  readonly onSyncNow: () => Promise<void>;
  readonly onExportDiagnostics: () => Promise<void>;
  /** ADR 0029: focus, idle and break preferences. */
  readonly focus?: Omit<FocusSettingsProps, "busy" | "online"> | undefined;
  readonly focusBusy?: boolean | undefined;
  /** ADR 0030 application preferences and shortcuts. */
  readonly applicationPreferences?: ApplicationPreferencesState | undefined;
  readonly projects?: readonly Project[] | undefined;
  /** ADR 0034 data export and restore; absent while signed out. */
  readonly csrfToken?: string | undefined;
  readonly onRestored?: (() => Promise<void>) | undefined;
  /** ADR 0048 trusted devices; absent while signed out. */
  readonly onSignOut?: (() => Promise<void>) | undefined;
}

export const SettingsPage = ({
  google,
  planningPreferences,
  dayPlan,
  notificationPreferences,
  notificationStatus,
  syncStatus,
  liveStatus,
  clientId,
  plannerFreshness,
  busy,
  onAuthorizeGoogle,
  onSyncGoogle,
  onDisconnectGoogle,
  onSavePlanningPreferences,
  onSaveNotificationPreferences,
  onTestNotification,
  onSyncNow,
  onExportDiagnostics,
  focus,
  focusBusy = false,
  applicationPreferences,
  projects = [],
  csrfToken,
  onRestored,
  onSignOut,
}: SettingsPageProps) => {
  return (
    <div className="settings-page page-stack">
      <ViewIntro description="Preferences, reminders, your data and sync." />
      <SettingsLayout
        groups={[
          {
            id: "general",
            label: "General",
            icon: Settings2,
            content: (
              <>
                {applicationPreferences !== undefined && (
                  <ApplicationPreferencesSettings
                    preferences={applicationPreferences.snapshot.preferences}
                    revision={applicationPreferences.snapshot.revision}
                    projects={projects}
                    busy={busy}
                    online={
                      syncStatus === "online" && applicationPreferences.loaded
                    }
                    error={applicationPreferences.error}
                    onSave={applicationPreferences.save}
                  />
                )}
                {csrfToken !== undefined && (
                  <ViewSection aria-labelledby="capture-links-title">
                    <ViewSectionHeader>
                      <SectionHeading
                        id="capture-links-title"
                        title="Captured links"
                        eyebrow="Capture"
                      />
                    </ViewSectionHeader>
                    <ViewSectionBody>
                      <CaptureLinkPreference csrfToken={csrfToken} />
                    </ViewSectionBody>
                  </ViewSection>
                )}
              </>
            ),
          },
          {
            id: "planning",
            label: "Planning",
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
                      mode="preferences"
                      status={google}
                      preferences={planningPreferences}
                      dayPlan={dayPlan}
                      busy={busy}
                      onAuthorize={onAuthorizeGoogle}
                      onSynchronize={onSyncGoogle}
                      onDisconnect={onDisconnectGoogle}
                      onSavePreferences={onSavePlanningPreferences}
                    />
                  )}
              </>
            ),
          },
          {
            id: "focus",
            label: "Focus & tracking",
            icon: Timer,
            content: (
              <>
                {focus === undefined ? null : (
                  <FocusSettings
                    {...focus}
                    busy={busy || focusBusy}
                    online={syncStatus === "online"}
                  />
                )}
              </>
            ),
          },
          {
            id: "reminders",
            label: "Reminders",
            icon: Bell,
            content: (
              <>
                {notificationPreferences !== undefined &&
                  notificationStatus !== undefined &&
                  onSaveNotificationPreferences !== undefined &&
                  onTestNotification !== undefined && (
                    <NotificationSettings
                      preferences={notificationPreferences}
                      status={notificationStatus}
                      busy={busy}
                      online={syncStatus === "online"}
                      onSave={onSaveNotificationPreferences}
                      onTest={onTestNotification}
                    />
                  )}
              </>
            ),
          },
          {
            id: "data",
            label: "Data & sync",
            icon: Database,
            content: (
              <>
                {csrfToken !== undefined && onRestored !== undefined && (
                  <DataExportRestore
                    csrfToken={csrfToken}
                    online={syncStatus === "online"}
                    onRestored={onRestored}
                  />
                )}
                {csrfToken !== undefined && onSignOut !== undefined && (
                  <SignedInDevices
                    csrfToken={csrfToken}
                    online={syncStatus === "online"}
                    onSignOutThisDevice={onSignOut}
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onSyncNow()}
                >
                  Sync now
                </Button>
                <ViewSection aria-labelledby="settings-health-title">
                  <ViewSectionHeader>
                    <SectionHeading
                      as="h3"
                      id="settings-health-title"
                      title="Client and service health"
                    />
                  </ViewSectionHeader>
                  <ViewSectionBody className="grid gap-3">
                    <dl className="settings-health">
                      <div>
                        <dt>Task sync</dt>
                        <dd>{syncStatus ?? "offline"}</dd>
                      </div>
                      {liveStatus !== undefined && (
                        <div>
                          <dt>Live updates</dt>
                          <dd>
                            {liveSyncStatusLabel(liveStatus)}.{" "}
                            {liveSyncStatusDescription(liveStatus)}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Client</dt>
                        <dd>{clientId ?? "Not registered"}</dd>
                      </div>
                      <div>
                        <dt>Calendar freshness</dt>
                        <dd>{plannerFreshness ?? "unavailable"}</dd>
                      </div>
                    </dl>
                    <p className="hint">
                      Assistant tokens are scoped and revoked one by one.
                      Calendar secrets are never sent to this page.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onExportDiagnostics()}
                    >
                      Export redacted sync diagnostics
                    </Button>
                  </ViewSectionBody>
                </ViewSection>
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
