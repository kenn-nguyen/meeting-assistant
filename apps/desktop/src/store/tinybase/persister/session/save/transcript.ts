import { sep } from "@tauri-apps/api/path";

import type { TranscriptJson, TranscriptWithData } from "@hypr/plugin-fs-sync";

import { buildRenderTranscriptRequestFromStore } from "~/stt/render-transcript";
import {
  buildSessionPath,
  iterateTableRows,
  SESSION_TRANSCRIPT_FILE,
  SESSION_TRANSCRIPT_MARKDOWN_FILE,
  type TablesContent,
  type TranscriptMarkdownWriteItem,
  type WriteOperation,
} from "~/store/tinybase/persister/shared";
import type { Store } from "~/store/tinybase/store/main";

type BuildContext = {
  tables: TablesContent;
  dataDir: string;
  changedSessionIds?: Set<string>;
};

export function buildTranscriptSaveOps(
  store: Store,
  tables: TablesContent,
  dataDir: string,
  changedSessionIds?: Set<string>,
): WriteOperation[] {
  const ctx: BuildContext = { tables, dataDir, changedSessionIds };

  const transcriptsBySession = groupTranscriptsBySession(ctx);
  const sessionsToProcess = filterByChangedSessions(
    transcriptsBySession,
    changedSessionIds,
  );

  return buildOperations(store, ctx, sessionsToProcess);
}

function groupTranscriptsBySession(
  ctx: BuildContext,
): Map<string, TranscriptWithData[]> {
  const { tables } = ctx;
  const grouped = new Map<string, TranscriptWithData[]>();

  for (const transcript of iterateTableRows(tables, "transcripts")) {
    if (!transcript.session_id) continue;

    const data: TranscriptWithData = {
      id: transcript.id,
      user_id: transcript.user_id ?? "",
      created_at: transcript.created_at ?? "",
      session_id: transcript.session_id,
      started_at: transcript.started_at ?? 0,
      memo_md: transcript.memo_md ?? "",
      ended_at: transcript.ended_at,
      words: transcript.words ? JSON.parse(transcript.words) : [],
      speaker_hints: transcript.speaker_hints
        ? JSON.parse(transcript.speaker_hints)
        : [],
    };

    const list = grouped.get(transcript.session_id) ?? [];
    list.push(data);
    grouped.set(transcript.session_id, list);
  }

  return grouped;
}

function filterByChangedSessions(
  transcriptsBySession: Map<string, TranscriptWithData[]>,
  changedSessionIds?: Set<string>,
): Array<[string, TranscriptWithData[]]> {
  const entries = [...transcriptsBySession];
  if (!changedSessionIds) return entries;
  return entries.filter(([id]) => changedSessionIds.has(id));
}

function buildOperations(
  store: Store,
  ctx: BuildContext,
  sessions: Array<[string, TranscriptWithData[]]>,
): WriteOperation[] {
  const { tables, dataDir } = ctx;
  const operations: WriteOperation[] = [];
  const markdownItems: TranscriptMarkdownWriteItem[] = [];

  for (const [sessionId, transcripts] of sessions) {
    const session = tables.sessions?.[sessionId];
    const sessionDir = buildSessionPath(
      dataDir,
      sessionId,
      session?.folder_id ?? "",
    );

    const content: TranscriptJson = { transcripts };
    operations.push({
      type: "write-json" as const,
      path: [sessionDir, SESSION_TRANSCRIPT_FILE].join(sep()),
      content,
    });

    const transcriptIds = transcripts.map((transcript) => transcript.id);
    const request = buildRenderTranscriptRequestFromStore(store, transcriptIds);
    if (request) {
      markdownItems.push({
        sessionId,
        request,
        path: [sessionDir, SESSION_TRANSCRIPT_MARKDOWN_FILE].join(sep()),
      });
    }
  }

  if (markdownItems.length > 0) {
    operations.push({
      type: "write-transcript-markdown-batch",
      items: markdownItems,
    });
  }

  return operations;
}
