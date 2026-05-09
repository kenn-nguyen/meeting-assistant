import { downloadDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Download, Loader2Icon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { commands as fsSyncCommands } from "@hypr/plugin-fs-sync";
import { commands as openerCommands } from "@hypr/plugin-opener2";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@hypr/ui/components/ui/tooltip";
import { sonnerToast } from "@hypr/ui/components/ui/toast";
import { cn } from "@hypr/utils";

import { DuringSessionAccessory } from "./during-session";
import { ExpandToggle } from "./expand-toggle";
import { PostSessionAccessory } from "./post-session";

import { useShell } from "~/contexts/shell";
import {
  buildRenderTranscriptRequestFromStore,
  renderTranscriptSegments,
} from "~/stt/render-transcript";
import {
  renderTranscriptMarkdown,
  serializeTranscriptMarkdown,
} from "~/stt/transcript-markdown";
import { sanitizeFilename } from "~/store/tinybase/persister/shared/paths";
import * as main from "~/store/tinybase/store/main";
import { getLiveCaptureUiMode } from "~/store/zustand/listener/general-shared";
import { useListener } from "~/stt/contexts";

export type BottomAccessoryState = {
  mode: "live" | "playback" | "transcript_only" | "finalizing";
  expanded: boolean;
} | null;

const TRANSCRIPT_PANEL_DEFAULT_HEIGHT = 300;
const TRANSCRIPT_PANEL_MIN_HEIGHT = 120;
const TRANSCRIPT_PANEL_MAX_FALLBACK = 720;
const TRANSCRIPT_PANEL_MAX_VIEWPORT_RATIO = 0.65;

function getTranscriptPanelMaxHeight() {
  if (typeof window === "undefined") {
    return TRANSCRIPT_PANEL_MAX_FALLBACK;
  }

  return Math.max(
    TRANSCRIPT_PANEL_MIN_HEIGHT,
    Math.floor(window.innerHeight * TRANSCRIPT_PANEL_MAX_VIEWPORT_RATIO),
  );
}

function clampTranscriptPanelHeight(height: number) {
  return Math.min(
    Math.max(height, TRANSCRIPT_PANEL_MIN_HEIGHT),
    getTranscriptPanelMaxHeight(),
  );
}

function TranscriptMarkdownActions({ sessionId }: { sessionId: string }) {
  const store = main.UI.useStore(main.STORE_ID);
  const transcriptIds =
    main.UI.useSliceRowIds(
      main.INDEXES.transcriptBySession,
      sessionId,
      main.STORE_ID,
    ) ?? [];
  const sessionTitle = main.UI.useCell(
    "sessions",
    sessionId,
    "title",
    main.STORE_ID,
  ) as string | undefined;
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const buildMarkdownDocument = useCallback(async () => {
    if (!store || transcriptIds.length === 0) {
      throw new Error("No transcript available");
    }

    const request = buildRenderTranscriptRequestFromStore(store, transcriptIds);
    if (!request) {
      throw new Error("No transcript available");
    }

    const segments = await renderTranscriptSegments(request);
    const document = renderTranscriptMarkdown(sessionId, segments);
    if (!document) {
      throw new Error("No transcript available");
    }

    return document;
  }, [sessionId, store, transcriptIds]);

  const handleCopy = useCallback(async () => {
    if (isCopying) {
      return;
    }

    setIsCopying(true);

    try {
      const document = await buildMarkdownDocument();
      await invoke("plugin:clipboard-manager|write_text", {
        text: serializeTranscriptMarkdown(document),
      });
      sonnerToast.success("Transcript copied");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sonnerToast.error(message || "Failed to copy transcript");
      console.error("[TranscriptCopy] Failed to copy transcript:", error);
    } finally {
      setIsCopying(false);
    }
  }, [buildMarkdownDocument, isCopying]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      const document = await buildMarkdownDocument();

      const downloadsPath = await downloadDir();
      const title = sanitizeFilename(
        (sessionTitle ?? "Untitled").trim() || "Untitled",
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = await join(
        downloadsPath,
        `${title}_transcript_${timestamp}.md`,
      );
      const result = await fsSyncCommands.writeDocumentBatch([
        [document, path],
      ]);
      if (result.status === "error") {
        throw new Error(result.error);
      }

      sonnerToast.success("Transcript downloaded");
      void openerCommands.revealItemInDir(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sonnerToast.error(message || "Failed to download transcript");
      console.error(
        "[TranscriptDownload] Failed to download transcript:",
        error,
      );
    } finally {
      setIsDownloading(false);
    }
  }, [buildMarkdownDocument, isDownloading, sessionTitle]);

  return (
    <div className="flex items-center gap-0.5">
      <TranscriptMarkdownIconButton
        label="Copy transcript"
        tooltip="Copy transcript"
        disabled={isCopying}
        onClick={handleCopy}
        icon={
          isCopying ? (
            <Loader2Icon size={12} className="animate-spin" />
          ) : (
            <Copy size={12} />
          )
        }
      />
      <TranscriptMarkdownIconButton
        label="Download transcript"
        tooltip="Download transcript"
        disabled={isDownloading}
        onClick={handleDownload}
        icon={
          isDownloading ? (
            <Loader2Icon size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )
        }
      />
    </div>
  );
}

function TranscriptMarkdownIconButton({
  label,
  tooltip,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn([
            "flex h-5 w-5 items-center justify-center rounded-none",
            "bg-transparent text-neutral-400",
            "transition-colors hover:bg-transparent hover:text-neutral-700",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-300",
            "disabled:cursor-not-allowed disabled:text-neutral-300",
          ])}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function useResizableTranscriptPanel() {
  const [height, setHeight] = useState(TRANSCRIPT_PANEL_DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const suppressToggleRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startResize = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    const startY = event.clientY;
    const startHeight = height;
    let didDrag = false;

    target.setPointerCapture?.(event.pointerId);
    setIsResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = startY - moveEvent.clientY;

      if (Math.abs(delta) > 3) {
        didDrag = true;
        suppressToggleRef.current = true;
      }

      if (didDrag) {
        moveEvent.preventDefault();
        setHeight(clampTranscriptPanelHeight(startHeight + delta));
      }
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      cleanupRef.current = null;
      setIsResizing(false);

      window.setTimeout(() => {
        suppressToggleRef.current = false;
      }, 0);
    };

    cleanupRef.current?.();
    cleanupRef.current = stopResize;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [height]);

  const consumeSuppressedToggle = useCallback(() => {
    if (!suppressToggleRef.current) {
      return false;
    }

    suppressToggleRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  return {
    height,
    isResizing,
    startResize,
    consumeSuppressedToggle,
  };
}

export function useSessionBottomAccessory({
  sessionId,
  sessionMode,
  audioUrl,
  hasTranscript,
}: {
  sessionId: string;
  sessionMode: string;
  audioUrl: string | null | undefined;
  hasTranscript: boolean;
}): {
  bottomAccessory: ReactNode;
  bottomBorderHandle: ReactNode;
  bottomAccessoryState: BottomAccessoryState;
} {
  const [isExpanded, setIsExpanded] = useState(false);
  const transcriptPanel = useResizableTranscriptPanel();
  const isLive = sessionMode === "active";
  const isFinalizing = sessionMode === "finalizing";
  const isBatching = sessionMode === "running_batch";
  const isInactive = sessionMode === "inactive" || isBatching;
  const hasAudio = Boolean(audioUrl) && isInactive;
  const live = useListener((state) => state.live);
  const { chat } = useShell();
  const liveCaptureMode = getLiveCaptureUiMode(live);
  const canExpandLiveTranscript = isLive && liveCaptureMode === "live";
  const effectiveExpanded =
    isLive && !canExpandLiveTranscript ? false : isExpanded;
  const isChatVisible = chat.mode === "RightPanelOpen";

  const prevLive = useRef(isLive);
  useEffect(() => {
    if (prevLive.current && !isLive) {
      setIsExpanded(false);
    }
    prevLive.current = isLive;
  }, [isLive]);

  useEffect(() => {
    if (isLive && !canExpandLiveTranscript && isExpanded) {
      setIsExpanded(false);
    }
  }, [isLive, canExpandLiveTranscript, isExpanded]);

  const showPostSession =
    isInactive && (isBatching || hasAudio || hasTranscript);

  useHotkeys(
    "esc",
    () => {
      setIsExpanded(false);
    },
    {
      enabled: showPostSession && isExpanded && !isChatVisible,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [showPostSession, isExpanded, isChatVisible],
  );

  const mode: NonNullable<BottomAccessoryState>["mode"] | null = isLive
    ? "live"
    : isFinalizing
      ? "finalizing"
      : showPostSession
        ? hasAudio
          ? "playback"
          : "transcript_only"
        : null;

  const bottomAccessoryState: BottomAccessoryState = useMemo(
    () => (mode ? { mode, expanded: effectiveExpanded } : null),
    [effectiveExpanded, mode],
  );

  const handleToggle = useCallback(() => {
    if (transcriptPanel.consumeSuppressedToggle()) {
      return;
    }

    setIsExpanded((v) => !v);
  }, [transcriptPanel]);

  if (isLive || isFinalizing) {
    return {
      bottomAccessory: (
        <DuringSessionAccessory
          sessionId={sessionId}
          isFinalizing={isFinalizing}
          isExpanded={effectiveExpanded}
          transcriptHeight={transcriptPanel.height}
        />
      ),
      bottomBorderHandle:
        canExpandLiveTranscript && !isFinalizing ? (
          <ExpandToggle
            isExpanded={effectiveExpanded}
            onToggle={handleToggle}
            onResizeStart={transcriptPanel.startResize}
            isResizing={transcriptPanel.isResizing}
            label="Live"
            collapsedClassName="bg-neutral-50"
          />
        ) : null,
      bottomAccessoryState,
    };
  }

  if (showPostSession) {
    const hasAccessoryContent = isExpanded || isBatching;
    return {
      bottomAccessory: hasAccessoryContent ? (
        <PostSessionAccessory
          sessionId={sessionId}
          hasAudio={hasAudio}
          hasTranscript={hasTranscript}
          isTranscriptExpanded={isExpanded}
          transcriptHeight={transcriptPanel.height}
        />
      ) : null,
      bottomBorderHandle: (
        <ExpandToggle
          isExpanded={isExpanded}
          onToggle={handleToggle}
          onResizeStart={transcriptPanel.startResize}
          isResizing={transcriptPanel.isResizing}
          label="Transcript"
          showExpandedCloseIcon
          collapsedClassName="bg-neutral-50"
          trailingAccessory={
            hasTranscript ? (
              <TranscriptMarkdownActions sessionId={sessionId} />
            ) : null
          }
        />
      ),
      bottomAccessoryState,
    };
  }

  return {
    bottomAccessory: null,
    bottomBorderHandle: null,
    bottomAccessoryState,
  };
}
