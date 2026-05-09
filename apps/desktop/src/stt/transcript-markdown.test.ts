import { describe, expect, test } from "vitest";

import {
  renderTranscriptMarkdown,
  serializeTranscriptMarkdown,
} from "./transcript-markdown";

import type { RenderedTranscriptSegment } from "@hypr/plugin-transcription";

describe("renderTranscriptMarkdown", () => {
  test("renders transcript sidecar with reference frontmatter", () => {
    const result = renderTranscriptMarkdown("session-1", [
      segment("segment-1", "Speaker 1", "Hello there."),
      segment("segment-2", "You", "Thanks for joining."),
    ]);

    expect(result).toEqual({
      frontmatter: {
        kind: "transcript",
        session_id: "session-1",
        source: "transcript.json",
      },
      content:
        "# Transcript\n\n" +
        "**Speaker 1:** Hello there.\n\n" +
        "**You:** Thanks for joining.",
    });
  });

  test("returns null when there is no visible transcript text", () => {
    expect(renderTranscriptMarkdown("session-1", [])).toBeNull();
    expect(
      renderTranscriptMarkdown("session-1", [
        segment("empty", "Speaker 1", "  "),
      ]),
    ).toBeNull();
  });

  test("serializes transcript markdown with reference frontmatter", () => {
    const document = renderTranscriptMarkdown("session-1", [
      segment("segment-1", "Speaker 1", "Hello there."),
    ]);

    expect(document).not.toBeNull();
    expect(serializeTranscriptMarkdown(document!)).toBe(
      "---\n" +
        "kind: transcript\n" +
        "session_id: session-1\n" +
        "source: transcript.json\n" +
        "---\n\n" +
        "# Transcript\n\n" +
        "**Speaker 1:** Hello there.",
    );
  });
});

function segment(
  id: string,
  speaker_label: string,
  text: string,
): RenderedTranscriptSegment {
  return {
    id,
    speaker_label,
    text,
    start_ms: 0,
    end_ms: 100,
    key: {
      channel: "DirectMic",
      speaker_index: null,
      speaker_human_id: null,
    },
    words: [],
  };
}
