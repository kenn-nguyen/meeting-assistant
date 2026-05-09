import { describe, expect, test, vi } from "vitest";

import { buildTranscriptSaveOps } from "./transcript";

import { createTestMainStore } from "~/store/tinybase/persister/testing/mocks";

vi.mock("@tauri-apps/api/path", () => ({
  sep: () => "/",
}));

describe("buildTranscriptSaveOps", () => {
  test("writes transcript json and schedules transcript markdown sidecar", () => {
    const store = createTestMainStore();
    store.setRow("sessions", "session-1", {
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      title: "Test Session",
      folder_id: "work/meetings",
      event_json: "",
      raw_md: "",
    });
    store.setRow("transcripts", "transcript-1", {
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      session_id: "session-1",
      started_at: 0,
      ended_at: 1_000,
      words: JSON.stringify([
        word("w1", "Hello", 0, 200, 0),
        word("w2", "world", 250, 500, 0),
      ]),
      speaker_hints: "[]",
      memo_md: "",
    });

    const ops = buildTranscriptSaveOps(store, store.getTables(), "/data");

    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      type: "write-json",
      path: "/data/sessions/work/meetings/session-1/transcript.json",
    });
    expect(ops[1]).toMatchObject({
      type: "write-transcript-markdown-batch",
      items: [
        {
          sessionId: "session-1",
          path: "/data/sessions/work/meetings/session-1/transcript.md",
        },
      ],
    });
  });
});

function word(
  id: string,
  text: string,
  start_ms: number,
  end_ms: number,
  channel: number,
) {
  return {
    id,
    text,
    start_ms,
    end_ms,
    channel,
  };
}
