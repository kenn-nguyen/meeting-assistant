import type { ParsedDocument } from "@hypr/plugin-fs-sync";
import type { RenderedTranscriptSegment } from "@hypr/plugin-transcription";

import { renderTranscriptSegments } from "~/stt/render-transcript";
import { SESSION_TRANSCRIPT_FILE } from "~/store/tinybase/persister/shared/paths";
import type { TranscriptMarkdownWriteItem } from "~/store/tinybase/persister/shared/types";

export async function buildTranscriptMarkdownDocuments(
  items: TranscriptMarkdownWriteItem[],
): Promise<Array<[ParsedDocument, string]>> {
  const documents: Array<[ParsedDocument, string]> = [];

  for (const item of items) {
    try {
      const segments = await renderTranscriptSegments(item.request);
      const document = renderTranscriptMarkdown(item.sessionId, segments);
      if (document) {
        documents.push([document, item.path]);
      }
    } catch (error) {
      console.error(
        `[TranscriptMarkdown] Failed to render ${item.sessionId}:`,
        error,
      );
    }
  }

  return documents;
}

export function renderTranscriptMarkdown(
  sessionId: string,
  segments: RenderedTranscriptSegment[],
): ParsedDocument | null {
  const paragraphs = segments
    .map(renderSegmentParagraph)
    .filter((paragraph): paragraph is string => paragraph !== null);

  if (paragraphs.length === 0) {
    return null;
  }

  return {
    frontmatter: {
      kind: "transcript",
      session_id: sessionId,
      source: SESSION_TRANSCRIPT_FILE,
    },
    content: ["# Transcript", "", ...paragraphs].join("\n\n"),
  };
}

export function serializeTranscriptMarkdown(document: ParsedDocument): string {
  const frontmatter = Object.entries(document.frontmatter);

  if (frontmatter.length === 0) {
    return document.content;
  }

  const yaml = frontmatter
    .map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`)
    .join("\n");

  return `---\n${yaml}\n---\n\n${document.content}`;
}

function renderSegmentParagraph(
  segment: RenderedTranscriptSegment,
): string | null {
  const text = normalizeSegmentText(
    segment.text || segment.words.map((word) => word.text).join(" "),
  );
  if (!text) {
    return null;
  }

  return `**${escapeMarkdownInline(segment.speaker_label)}:** ${text}`;
}

function normalizeSegmentText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:%])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function escapeMarkdownInline(value: string): string {
  return value.replace(/([\\`*_])/g, "\\$1");
}

function serializeFrontmatterValue(value: unknown): string {
  if (typeof value === "string") {
    return /^[A-Za-z0-9._/-]+$/.test(value) ? value : JSON.stringify(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}
