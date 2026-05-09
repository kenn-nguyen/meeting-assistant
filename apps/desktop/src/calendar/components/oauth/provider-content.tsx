import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { commands as calendarCommands } from "@hypr/plugin-calendar";

import {
  OAuthCalendarSelection,
  useOAuthCalendarSelection,
} from "./calendar-selection";
import { ReconnectRequiredIndicator } from "./status";

import type { CalendarProvider } from "~/calendar/components/shared";
import {
  connectLocalCalendarProvider,
  type LocalCalendarConnection,
  useLocalProviderConnections,
} from "~/calendar/local-oauth";

export function OAuthProviderContent({
  config,
}: {
  config: CalendarProvider;
  returnTo?: string;
}) {
  const { data: providerConnections, isError, error } =
    useLocalProviderConnections(config);

  const handleAddAccount = useCallback(
    () => connectLocalCalendarProvider(config.id),
    [config.id],
  );

  if (providerConnections.length > 0) {
    const reconnectRequired = providerConnections.filter(
      (c) => c.status === "reconnect_required",
    );

    return (
      <div className="flex flex-col gap-3 pb-2">
        {reconnectRequired.map((connection) => (
          <ReconnectRequiredContent
            key={connection.connection_id}
            config={config}
            onReconnect={() => connectLocalCalendarProvider(config.id)}
            connectionId={connection.connection_id}
            errorDescription={connection.last_error_description ?? null}
          />
        ))}

        <ConnectedContent
          config={config}
          connections={providerConnections}
        />
      </div>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : undefined;

    return (
      <div className="pt-1 pb-2">
        <span className="text-xs text-red-600" title={errorMessage}>
          Failed to load local calendar accounts
        </span>
      </div>
    );
  }

  return (
    <div className="pt-1 pb-2">
      <button
        onClick={handleAddAccount}
        className="cursor-pointer text-xs text-neutral-600 underline transition-colors hover:text-neutral-900"
      >
        Connect {config.displayName} Calendar
      </button>
    </div>
  );
}

function ReconnectRequiredContent({
  config,
  onReconnect,
  connectionId,
  errorDescription,
}: {
  config: CalendarProvider;
  onReconnect: () => void;
  connectionId: string;
  errorDescription: string | null;
}) {
  const queryClient = useQueryClient();
  const handleDisconnect = useCallback(async () => {
    const result = await calendarCommands.disconnectOauthAccount(
      config.id as "google" | "outlook",
      connectionId,
    );
    if (result.status === "ok") {
      await queryClient.invalidateQueries({
        queryKey: ["local-calendar-connections"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["integration-status"],
      });
    }
  }, [config.id, connectionId, queryClient]);

  return (
    <div className="flex flex-col gap-2 pb-2">
      <div className="flex items-center gap-2 text-xs text-amber-700">
        <ReconnectRequiredIndicator />
        <span>Reconnect required for {config.displayName} Calendar</span>
      </div>

      {errorDescription && (
        <p className="text-xs text-neutral-600">{errorDescription}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onReconnect}
          className="cursor-pointer text-xs text-neutral-600 underline transition-colors hover:text-neutral-900"
        >
          Reconnect
        </button>
        <span className="text-xs text-neutral-400">or</span>
        <button
          onClick={handleDisconnect}
          className="cursor-pointer text-xs text-red-500 underline transition-colors hover:text-red-700"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function ConnectedContent({
  config,
  connections,
}: {
  config: CalendarProvider;
  connections: LocalCalendarConnection[];
}) {
  const queryClient = useQueryClient();
  const {
    groups,
    connectionSourceMap,
    handleRefresh,
    handleToggle,
    isLoading,
  } = useOAuthCalendarSelection(config);

  const groupsWithMenus = useMemo(
    () =>
      groups.map((group) => {
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
              action: () => void connectLocalCalendarProvider(config.id),
            },
            {
              id: `disconnect-${connection.connection_id}`,
              text: "Disconnect",
              action: () => {
                void calendarCommands
                  .disconnectOauthAccount(
                    config.id as "google" | "outlook",
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
      }),
    [config.id, connectionSourceMap, connections, groups, queryClient],
  );

  return (
    <OAuthCalendarSelection
      groups={groupsWithMenus}
      onToggle={handleToggle}
      onRefresh={handleRefresh}
      isLoading={isLoading}
    />
  );
}
