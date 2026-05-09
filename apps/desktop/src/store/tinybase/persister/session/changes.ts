import {
  type ChangedTables,
  getChangedIds,
  SESSION_META_FILE,
  SESSION_NOTE_EXTENSION,
  SESSION_TRANSCRIPT_FILE,
  type TablesContent,
} from "~/store/tinybase/persister/shared";

export function parseSessionIdFromPath(path: string): string | null {
  const parts = path.split("/");
  const sessionsIndex = parts.indexOf("sessions");
  if (sessionsIndex === -1) {
    return null;
  }

  const filename = parts[parts.length - 1];
  const isSessionFile =
    filename === SESSION_META_FILE ||
    filename === SESSION_TRANSCRIPT_FILE ||
    filename?.endsWith(SESSION_NOTE_EXTENSION);

  if (isSessionFile && parts.length >= 2) {
    return parts[parts.length - 2] || null;
  }

  return null;
}

export type SessionChangeResult = {
  changedSessionIds: Set<string>;
  hasUnresolvedDeletions: boolean;
};

export function getChangedSessionIds(
  tables: TablesContent,
  changedTables: ChangedTables,
): SessionChangeResult | undefined {
  const changedHumanIds = Object.keys(changedTables.humans ?? {});
  const result = getChangedIds(tables, changedTables, [
    { table: "sessions", extractId: (id) => id },
    {
      table: "mapping_session_participant",
      extractId: (id, tables) =>
        tables.mapping_session_participant?.[id]?.session_id,
    },
    {
      table: "transcripts",
      extractId: (id, tables) => tables.transcripts?.[id]?.session_id,
    },
    {
      table: "enhanced_notes",
      extractId: (id, tables) => tables.enhanced_notes?.[id]?.session_id,
    },
  ]);

  if (changedHumanIds.length === 0) {
    if (!result) {
      return undefined;
    }

    return {
      changedSessionIds: result.changedIds,
      hasUnresolvedDeletions: result.hasUnresolvedDeletions,
    };
  }

  const changedIds = new Set(result?.changedIds);
  for (const mapping of Object.values(tables.mapping_session_participant ?? {})) {
    const humanId = mapping?.human_id;
    const sessionId = mapping?.session_id;
    if (
      typeof humanId === "string" &&
      typeof sessionId === "string" &&
      changedHumanIds.includes(humanId)
    ) {
      changedIds.add(sessionId);
    }
  }

  if (changedIds.size === 0 && !result?.hasUnresolvedDeletions) {
    return undefined;
  }

  return {
    changedSessionIds: changedIds,
    hasUnresolvedDeletions: result?.hasUnresolvedDeletions ?? false,
  };
}
