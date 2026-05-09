import { platform } from "@tauri-apps/plugin-os";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { commands as calendarCommands } from "@hypr/plugin-calendar";

import { OnboardingButton } from "./shared";

import { useAppleCalendarSelection } from "~/calendar/components/apple/calendar-selection";
import { AppleCalendarPermissionHelp } from "~/calendar/components/apple/permission";
import {
  type CalendarGroup,
  CalendarSelection,
} from "~/calendar/components/calendar-selection";
import { SyncProvider, useSync } from "~/calendar/components/context";
import { useOAuthCalendarSelection } from "~/calendar/components/oauth/calendar-selection";
import { ReconnectRequiredIndicator } from "~/calendar/components/oauth/status";
import { PROVIDERS } from "~/calendar/components/shared";
import { useEnabledCalendars } from "~/calendar/hooks";
import {
  connectLocalCalendarProvider,
  localIntegrationId,
  type LocalCalendarConnection,
  useLocalCalendarConnections,
} from "~/calendar/local-oauth";
import { useMountEffect } from "~/shared/hooks/useMountEffect";
import { usePermission } from "~/shared/hooks/usePermissions";

const GOOGLE_PROVIDER = PROVIDERS.find((provider) => provider.id === "google");
const OUTLOOK_PROVIDER = PROVIDERS.find(
  (provider) => provider.id === "outlook",
);

function getCalendarSelectionKey(groups: CalendarGroup[]) {
  return groups.length === 0
    ? "empty"
    : groups
        .map((group) => `${group.sourceName}:${group.calendars.length}`)
        .join("|");
}

function AppleCalendarList() {
  const { scheduleSync } = useSync();
  const { groups, handleRefresh, handleToggle, isLoading } =
    useAppleCalendarSelection();

  useMountEffect(() => {
    scheduleSync();
  });

  return (
    <CalendarSelection
      key={getCalendarSelectionKey(groups)}
      groups={groups}
      onToggle={handleToggle}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      disableHoverTone
      className="rounded-xl border border-white/45 bg-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_-20px_rgba(87,83,78,0.35)] backdrop-blur-md backdrop-saturate-150"
    />
  );
}

function AppleCalendarProvider({
  isAuthorized,
  isPending,
  status,
  onOpen,
  onRequest,
  onTroubleshoot,
}: {
  isAuthorized: boolean;
  isPending: boolean;
  status: ReturnType<typeof usePermission>["status"];
  onOpen: () => void;
  onRequest: () => void;
  onTroubleshoot: () => void;
}) {
  const isDenied = status === "denied";

  return (
    <div className="flex flex-col gap-3">
      {isAuthorized ? (
        <AppleCalendarList />
      ) : (
        <OnboardingButton
          onClick={() => {
            onTroubleshoot();
            if (isDenied) {
              onOpen();
            } else {
              onRequest();
            }
          }}
          disabled={isPending}
          className="flex h-full w-full items-center justify-center gap-3 border border-neutral-200 bg-white px-12 text-stone-800 shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)] transition-all duration-150 hover:bg-stone-100"
        >
          <img
            src="/assets/apple-calendar.png"
            alt=""
            aria-hidden="true"
            className="size-6 rounded-[4px] object-cover"
          />
          Apple
        </OnboardingButton>
      )}
    </div>
  );
}

function GoogleCalendarConnectedContent({
  providerConnections,
}: {
  providerConnections: LocalCalendarConnection[];
}) {
  const queryClient = useQueryClient();
  const { scheduleSync } = useSync();
  const {
    groups,
    connectionSourceMap,
    handleRefresh,
    handleToggle,
    isLoading,
  } = useOAuthCalendarSelection(GOOGLE_PROVIDER!);
  const reconnectRequiredConnections = useMemo(
    () =>
      providerConnections.filter(
        (connection) => connection.status === "reconnect_required",
      ),
    [providerConnections],
  );
  const groupsWithMenus = useMemo(
    () =>
      addIntegrationMenus({
        groups,
        connections: providerConnections,
        connectionSourceMap,
        provider: GOOGLE_PROVIDER!,
        queryClient,
      }),
    [connectionSourceMap, groups, providerConnections, queryClient],
  );

  useMountEffect(() => {
    scheduleSync();
  });

  return (
    <div className="flex flex-col gap-3">
      {reconnectRequiredConnections.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <span className="pt-1">
            <ReconnectRequiredIndicator />
          </span>
          <p>
            Some Google Calendar accounts need attention. Open the account menu
            to reconnect or disconnect them.
          </p>
        </div>
      )}

      <CalendarSelection
        key={getCalendarSelectionKey(groupsWithMenus)}
        groups={groupsWithMenus}
        onToggle={handleToggle}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        disableHoverTone
        className="rounded-xl border border-white/45 bg-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_-20px_rgba(87,83,78,0.35)] backdrop-blur-md backdrop-saturate-150"
      />

      <OnboardingButton
        type="button"
        onClick={() => void connectLocalCalendarProvider("google")}
        className="flex items-center gap-3 border border-neutral-200 bg-white text-stone-800 shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)] hover:bg-stone-50"
      >
        {GOOGLE_PROVIDER?.icon}
        Add another account
      </OnboardingButton>
    </div>
  );
}

function addIntegrationMenus({
  groups,
  connections,
  connectionSourceMap,
  provider,
  queryClient,
}: {
  groups: CalendarGroup[];
  connections: LocalCalendarConnection[];
  connectionSourceMap: Map<string, string>;
  provider: (typeof PROVIDERS)[number];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  return groups.map((group) => {
    const connection = connections.find(
      (item) =>
        item.connection_id === group.id ||
        connectionSourceMap.get(item.connection_id) === group.sourceName,
    );

    if (!connection) return group;

    return {
      ...group,
      menuItems: [
        {
          id: `reconnect-${connection.connection_id}`,
          text: "Reconnect",
          action: () => void connectLocalCalendarProvider(provider.id),
        },
        {
          id: `disconnect-${connection.connection_id}`,
          text: "Disconnect",
          action: () => {
            void calendarCommands
              .disconnectOauthAccount(
                provider.id as "google" | "outlook",
                connection.connection_id,
              )
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: ["local-calendar-connections"],
                }),
              )
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: ["integration-status"],
                }),
              );
          },
        },
      ],
    };
  });
}

function OutlookCalendarConnectedContent({
  providerConnections,
}: {
  providerConnections: LocalCalendarConnection[];
}) {
  const queryClient = useQueryClient();
  const { scheduleSync } = useSync();
  const {
    groups,
    connectionSourceMap,
    handleRefresh,
    handleToggle,
    isLoading,
  } = useOAuthCalendarSelection(OUTLOOK_PROVIDER!);
  const reconnectRequiredConnections = useMemo(
    () =>
      providerConnections.filter(
        (connection) => connection.status === "reconnect_required",
      ),
    [providerConnections],
  );
  const groupsWithMenus = useMemo(
    () =>
      addIntegrationMenus({
        groups,
        connections: providerConnections,
        connectionSourceMap,
        provider: OUTLOOK_PROVIDER!,
        queryClient,
      }),
    [connectionSourceMap, groups, providerConnections, queryClient],
  );

  useMountEffect(() => {
    scheduleSync();
  });

  return (
    <div className="flex flex-col gap-3">
      {reconnectRequiredConnections.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <span className="pt-1">
            <ReconnectRequiredIndicator />
          </span>
          <p>
            Some Outlook accounts need attention. Open the account menu to
            reconnect or disconnect them.
          </p>
        </div>
      )}

      <CalendarSelection
        key={getCalendarSelectionKey(groupsWithMenus)}
        groups={groupsWithMenus}
        onToggle={handleToggle}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        disableHoverTone
        className="rounded-xl border border-white/45 bg-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_-20px_rgba(87,83,78,0.35)] backdrop-blur-md backdrop-saturate-150"
      />

      <OnboardingButton
        type="button"
        onClick={() => void connectLocalCalendarProvider("outlook")}
        className="flex items-center gap-3 border border-neutral-200 bg-white text-stone-800 shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)] hover:bg-stone-50"
      >
        {OUTLOOK_PROVIDER?.icon}
        Add another account
      </OnboardingButton>
    </div>
  );
}

function OutlookCalendarProvider() {
  const { data: connections, isPending, isError } =
    useLocalCalendarConnections();
  const providerConnections = useMemo(
    () =>
      connections?.filter(
        (connection) =>
          connection.integration_id === localIntegrationId("outlook"),
      ) ?? [],
    [connections],
  );

  const handleConnect = useCallback(() => {
    void connectLocalCalendarProvider("outlook");
  }, []);

  if (!OUTLOOK_PROVIDER) {
    return null;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600">Failed to load Outlook Calendar</p>
    );
  }

  if (providerConnections.length > 0) {
    return (
      <OutlookCalendarConnectedContent
        providerConnections={providerConnections}
      />
    );
  }

  return (
    <OnboardingButton
      onClick={handleConnect}
      disabled={isPending}
      className="gho flex items-center gap-3 border border-neutral-200 bg-white text-stone-800 shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)] hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
    >
      {OUTLOOK_PROVIDER.icon}
      Connect Outlook
    </OnboardingButton>
  );
}

function GoogleCalendarProvider() {
  const { data: connections, isPending, isError } =
    useLocalCalendarConnections();
  const providerConnections = useMemo(
    () =>
      connections?.filter(
        (connection) =>
          connection.integration_id === localIntegrationId("google"),
      ) ?? [],
    [connections],
  );

  const handleConnect = useCallback(() => {
    void connectLocalCalendarProvider("google");
  }, []);

  if (!GOOGLE_PROVIDER) {
    return null;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600">Failed to load Google Calendar</p>
    );
  }

  if (providerConnections.length > 0) {
    return (
      <GoogleCalendarConnectedContent
        providerConnections={providerConnections}
      />
    );
  }

  return (
    <div className="flex h-full items-center gap-3">
      <OnboardingButton
        onClick={handleConnect}
        disabled={isPending}
        className="flex items-center gap-3 border border-neutral-200 bg-white text-stone-800 shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)] hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
      >
        {GOOGLE_PROVIDER.icon}
        Connect Google Calendar
      </OnboardingButton>
    </div>
  );
}

function CalendarSectionContent({ onContinue }: { onContinue: () => void }) {
  const isMacos = platform() === "macos";
  const calendar = usePermission("calendar");
  const isAuthorized = calendar.status === "authorized";
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const enabledCalendars = useEnabledCalendars();
  const hasConnectedCalendar = enabledCalendars.length > 0;

  const hasAnyConnected = hasConnectedCalendar || isAuthorized;

  return (
    <div className="flex flex-col gap-4">
      {hasAnyConnected ? (
        <div className="flex flex-col gap-4">
          {isMacos && (
            <AppleCalendarProvider
              isAuthorized={isAuthorized}
              isPending={calendar.isPending}
              status={calendar.status}
              onOpen={calendar.open}
              onRequest={calendar.request}
              onTroubleshoot={() => setShowTroubleshooting(true)}
            />
          )}
          <GoogleCalendarProvider />
          <OutlookCalendarProvider />
        </div>
      ) : (
        // for the case when the user has no connected calendars yet we show the calendars in a row
        <div className="flex flex-row items-stretch gap-4">
          {isMacos && (
            <AppleCalendarProvider
              isAuthorized={isAuthorized}
              isPending={calendar.isPending}
              status={calendar.status}
              onOpen={calendar.open}
              onRequest={calendar.request}
              onTroubleshoot={() => setShowTroubleshooting(true)}
            />
          )}

          <GoogleCalendarProvider />
          <OutlookCalendarProvider />
        </div>
      )}

      {showTroubleshooting && !isAuthorized && (
        <AppleCalendarPermissionHelp
          status={calendar.status}
          onRequest={calendar.request}
          onOpen={calendar.open}
          onCheckAgain={calendar.checkAgain}
          isPending={calendar.isPending}
          className="text-sm text-neutral-500"
        />
      )}

      {hasConnectedCalendar && (
        <OnboardingButton onClick={onContinue}>Continue</OnboardingButton>
      )}
    </div>
  );
}

export function CalendarSection({
  onContinue,
  onSignIn: _onSignIn,
}: {
  onContinue: () => void;
  onSignIn: () => void;
}) {
  return (
    <SyncProvider>
      <CalendarSectionContent onContinue={onContinue} />
    </SyncProvider>
  );
}
