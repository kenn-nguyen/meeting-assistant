import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import { useState } from "react";

import { type PermissionStatus } from "@hypr/plugin-permissions";
import { Button } from "@hypr/ui/components/ui/button";
import { cn } from "@hypr/utils";

import { usePermission } from "~/shared/hooks/usePermissions";

export function ApplePermissions() {
  const calendar = usePermission("calendar");

  return (
    <div className="flex flex-col gap-1">
      <AccessPermissionRow
        title="Apple Calendar"
        status={calendar.status}
        isPending={calendar.isPending}
        onOpen={calendar.open}
        onRequest={calendar.request}
        onCheckAgain={calendar.checkAgain}
        showActionButton={false}
      />
    </div>
  );
}

function ActionLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn([
        "underline transition-colors hover:text-neutral-900",
        disabled && "cursor-not-allowed opacity-50",
      ])}
    >
      {children}
    </button>
  );
}

export function AccessPermissionRow({
  title,
  status,
  isPending,
  onOpen,
  onRequest,
  onCheckAgain,
  showActionButton = true,
}: {
  title: string;
  status: PermissionStatus | undefined;
  isPending: boolean;
  onOpen: () => void;
  onRequest: () => void;
  onCheckAgain?: () => void;
  showActionButton?: boolean;
}) {
  const isAuthorized = status === "authorized";
  const isDenied = status === "denied";
  const isNeverRequested = status === "neverRequested" || !status;

  const handleButtonClick = () => {
    if (isAuthorized || isDenied) {
      onOpen();
    } else {
      onRequest();
    }
  };

  const description = isAuthorized
    ? `${title} access is enabled.`
    : isDenied
      ? `${title} access is off. Enable it in System Settings, then check again.`
      : `Allow Char to read your ${title.toLowerCase()} from this Mac.`;

  return (
    <div
      className={cn([
        "flex gap-4 py-2 text-sm",
        showActionButton
          ? "items-center justify-between"
          : "items-start justify-start",
      ])}
    >
      <div className="flex-1">
        <div
          className={cn([
            "mb-1 flex items-center gap-2",
            !isAuthorized && "text-red-500",
          ])}
        >
          {!isAuthorized && <AlertCircleIcon className="size-4" />}
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <p className="text-xs leading-5 text-neutral-600">{description}</p>
        {isDenied ? (
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpen}
              disabled={isPending}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <SettingsIcon className="size-3.5" />
              Open System Settings
            </Button>
            {onCheckAgain ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCheckAgain}
                disabled={isPending}
                className="h-7 gap-1.5 px-2 text-xs"
              >
                <RefreshCwIcon className="size-3.5" />
                Check again
              </Button>
            ) : null}
          </div>
        ) : null}
        {isNeverRequested ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={isPending}
            className="mt-2 text-xs text-neutral-500 underline transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open System Settings
          </button>
        ) : null}
      </div>
      {showActionButton && (
        <Button
          variant={isAuthorized ? "outline" : "default"}
          size="icon"
          onClick={handleButtonClick}
          disabled={isPending}
          className={cn([
            "size-8",
            isAuthorized && "bg-stone-100 text-stone-800 hover:bg-stone-200",
          ])}
          aria-label={
            isAuthorized
              ? `Open ${title.toLowerCase()} settings`
              : `Request ${title.toLowerCase()}`
          }
        >
          {isAuthorized ? (
            <CheckIcon className="size-5" />
          ) : isDenied ? (
            <SettingsIcon className="size-5" />
          ) : (
            <ArrowRightIcon className="size-5" />
          )}
        </Button>
      )}
    </div>
  );
}

export function AppleCalendarPermissionHelp({
  status,
  isPending,
  onOpen,
  onRequest,
  onCheckAgain,
  className,
}: {
  status: PermissionStatus | undefined;
  isPending: boolean;
  onOpen: () => void;
  onRequest: () => void;
  onCheckAgain?: () => void;
  className?: string;
}) {
  const isDenied = status === "denied";
  const isNeverRequested = status === "neverRequested" || !status;

  if (status === "authorized") {
    return null;
  }

  return (
    <div className={cn(["text-xs leading-5 text-neutral-600", className])}>
      {isDenied ? (
        <>
          Calendar access is off. Enable Char in System Settings, then{" "}
          {onCheckAgain ? (
            <ActionLink onClick={onCheckAgain} disabled={isPending}>
              check again
            </ActionLink>
          ) : (
            "check again"
          )}
          .{" "}
          <ActionLink onClick={onOpen} disabled={isPending}>
            Open System Settings
          </ActionLink>
        </>
      ) : isNeverRequested ? (
        <>
          Allow Char to read Apple Calendar from this Mac.{" "}
          <ActionLink onClick={onRequest} disabled={isPending}>
            Allow access
          </ActionLink>{" "}
          or{" "}
          <ActionLink onClick={onOpen} disabled={isPending}>
            open System Settings
          </ActionLink>
          .
        </>
      ) : null}
    </div>
  );
}

export function TroubleShootingLink({
  onRequest,
  onReset,
  onOpen,
  isPending,
  className,
}: {
  onRequest: () => void;
  onReset: () => void;
  onOpen: () => void;
  isPending: boolean;
  className?: string;
}) {
  const [showActions, setShowActions] = useState(false);
  return (
    <div className={cn(["text-xs text-neutral-600", className])}>
      {!showActions ? (
        <button
          type="button"
          onClick={() => setShowActions(true)}
          className="underline transition-colors hover:text-neutral-900"
        >
          Having trouble?
        </button>
      ) : (
        <div>
          You can{" "}
          <ActionLink onClick={onRequest} disabled={isPending}>
            Request,
          </ActionLink>{" "}
          <ActionLink onClick={onReset} disabled={isPending}>
            Reset
          </ActionLink>{" "}
          or{" "}
          <ActionLink onClick={onOpen} disabled={isPending}>
            Open
          </ActionLink>{" "}
          permission panel.{" "}
          <ActionLink onClick={() => setShowActions(false)}>
            <ArrowLeftIcon className="inline-block size-3 underline" />
            Back
          </ActionLink>
        </div>
      )}
    </div>
  );
}
