import { useEffect } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { commands as calendarCommands } from "@hypr/plugin-calendar";
import { commands as openerCommands } from "@hypr/plugin-opener2";
import { sonnerToast } from "@hypr/ui/components/ui/toast";

import type { CalendarProvider } from "./components/shared";

import { getScheme } from "~/shared/utils";

export type LocalCalendarConnection = {
  connection_id: string;
  integration_id: string;
  last_error_description?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

export function localIntegrationId(providerId: string) {
  switch (providerId) {
    case "google":
      return "google-calendar";
    case "outlook":
      return "outlook";
    default:
      return undefined;
  }
}

export function providerIdFromOAuthProvider(provider: string) {
  return provider === "google" || provider === "outlook" ? provider : null;
}

export async function calendarOAuthRedirectUri(providerId: string) {
  const scheme = await getScheme();
  const url = new URL(`${scheme}://calendar/oauth/callback`);
  url.searchParams.set("provider", providerId);
  return url.toString();
}

function scheduleLocalCalendarConnectionRefresh() {
  for (const delay of [1000, 3000, 7000, 15000]) {
    window.setTimeout(() => {
      window.dispatchEvent(new Event("local-calendar-oauth-updated"));
    }, delay);
  }
}

function calendarConnectionErrorMessage(providerId: string, error: string) {
  const providerName =
    providerId === "google"
      ? "Google Calendar"
      : providerId === "outlook"
        ? "Outlook Calendar"
        : providerId === "apple"
          ? "Apple Calendar"
          : "Calendar";

  if (error.includes("missing OAuth client id")) {
    return `${providerName} OAuth is not configured in this build. Add the OAuth client id and rebuild the app.`;
  }

  if (error.includes("not supported for provider Apple")) {
    return "Apple Calendar connects through macOS Calendar permission, not OAuth.";
  }

  return `Failed to connect ${providerName}: ${error}`;
}

export async function connectLocalCalendarProvider(providerId: string) {
  try {
    const result = await calendarCommands.beginLoopbackOauth(
      providerId as "google" | "outlook",
    );
    if (result.status === "error") {
      const message = calendarConnectionErrorMessage(providerId, result.error);
      sonnerToast.error(message);
      console.error(
        "[calendar-oauth] Failed to begin local OAuth:",
        result.error,
      );
      return false;
    }
    const openResult = await openerCommands.openUrl(result.data.auth_url, null);
    if (openResult.status === "error") {
      const message = `Failed to open calendar sign-in: ${openResult.error}`;
      sonnerToast.error(message);
      console.error(
        "[calendar-oauth] Failed to open OAuth URL:",
        openResult.error,
      );
      return false;
    }
    scheduleLocalCalendarConnectionRefresh();
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = calendarConnectionErrorMessage(providerId, detail);
    sonnerToast.error(message);
    console.error("[calendar-oauth] Failed to connect calendar:", error);
    return false;
  }
}

export function useLocalCalendarConnections(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["local-calendar-connections"],
    queryFn: async () => {
      let accounts;
      try {
        accounts = await calendarCommands.listOauthAccounts();
      } catch (error) {
        console.error(
          "[calendar-oauth] Failed to load local calendar accounts",
          error,
        );
        throw error;
      }

      return accounts.map((account): LocalCalendarConnection => {
        const integrationId =
          localIntegrationId(account.provider) ?? account.provider;
        return {
          connection_id: account.connection_id,
          integration_id: integrationId,
          last_error_description: account.last_error_description,
          status:
            account.status === "reconnect_required"
              ? "reconnect_required"
              : "connected",
          updated_at: account.updated_at,
        };
      });
    },
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: ["local-calendar-connections"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["integration-status"],
      });
    };
    window.addEventListener("local-calendar-oauth-updated", refresh);
    return () =>
      window.removeEventListener("local-calendar-oauth-updated", refresh);
  }, [enabled, queryClient]);

  return query;
}

export function useLocalProviderConnections(config: CalendarProvider) {
  const query = useLocalCalendarConnections(!!localIntegrationId(config.id));
  const connections =
    query.data?.filter(
      (connection) => connection.integration_id === localIntegrationId(config.id),
    ) ?? [];

  return {
    ...query,
    data: connections,
  };
}
