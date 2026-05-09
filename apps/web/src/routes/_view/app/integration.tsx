import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { flowSearchSchema } from "@/functions/desktop-flow";

import { ConnectFlow } from "./-integrations-connect-flow";
import { DisconnectFlow } from "./-integrations-disconnect-flow";

const commonSearch = {
  integration_id: z.string().default("google-calendar"),
  connection_id: z.string().optional(),
  action: z.enum(["connect", "reconnect", "disconnect"]).default("connect"),
  return_to: z.string().optional(),
};

const validateSearch = flowSearchSchema(commonSearch);

export const INTEGRATION_DISPLAY: Record<
  string,
  { name: string; description: string; connectingHint: string }
> = {
  "google-calendar": {
    name: "Google Calendar",
    description: "Connect your Google Calendar to sync your meetings",
    connectingHint: "Follow the prompts to connect your Google account",
  },
  linear: {
    name: "Linear",
    description: "Connect Linear to sync your issues and tasks",
    connectingHint: "Follow the prompts to connect your Linear account",
  },
  github: {
    name: "GitHub",
    description: "Connect GitHub to sync your issues and pull requests",
    connectingHint: "Follow the prompts to connect your GitHub account",
  },
};

export function getIntegrationDisplay(integrationId: string) {
  return (
    INTEGRATION_DISPLAY[integrationId] ?? {
      name: integrationId,
      description: `Connect ${integrationId} to sync your data`,
      connectingHint: "Follow the prompts to complete the connection",
    }
  );
}

export const Route = createFileRoute("/_view/app/integration")({
  validateSearch,
  component: Component,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

function Component() {
  const search = Route.useSearch();

  if (search.action === "disconnect") {
    return <DisconnectFlow />;
  }

  return <ConnectFlow />;
}
