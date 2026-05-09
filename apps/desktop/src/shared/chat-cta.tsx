import { useShell } from "~/contexts/shell";

export function ChatCTA({
  label = "Ask about this session",
  iconOnly = false,
}: {
  label?: string;
  iconOnly?: boolean;
}) {
  const { chat } = useShell();
  const isChatOpen = chat.mode === "RightPanelOpen";

  const handleClick = () => {
    if (isChatOpen) {
      chat.sendEvent({ type: "TOGGLE" });
      return;
    }

    chat.sendEvent({ type: "OPEN_RIGHT_PANEL" });
  };

  if (isChatOpen) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={
        iconOnly
          ? "flex size-10 items-center justify-center rounded-full border border-[#DDD6CC] bg-[#F7F4EF] text-[#3F3A33] shadow-[0_4px_12px_rgba(32,28,24,0.08)] transition-colors hover:bg-[#EFEAE2]"
          : "flex items-center gap-2 rounded-full border-2 border-stone-600 bg-stone-800 px-4 py-2 text-sm text-white shadow-[0_4px_14px_rgba(87,83,78,0.4)] transition-colors hover:bg-stone-700"
      }
    >
      <img
        src="/assets/char-chat-bubble.svg"
        alt=""
        className={
          iconOnly
            ? "size-5 shrink-0 object-contain opacity-85"
            : "size-4 shrink-0 object-contain invert"
        }
      />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
