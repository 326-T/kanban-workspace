import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import type { RunEvent } from "@kw/protocol";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type PermissionRequestEvent = Extract<RunEvent, { type: "permission_request" }>;

// 危険操作の承認カード。decision が undefined の間だけボタンを出す。
export function PermissionCard({
  event,
  decision,
  onDecide,
}: {
  event: PermissionRequestEvent;
  decision?: { allowed: boolean; by: string };
  onDecide: (requestId: string, allow: boolean) => void;
}) {
  const preview =
    typeof event.input === "string" ? event.input : JSON.stringify(event.input);

  return (
    <Alert className="max-w-3xl border-amber-500/50 bg-amber-500/5">
      <ShieldAlertIcon className="text-amber-500" />
      <AlertTitle>{event.title ?? `${event.tool} の実行許可`}</AlertTitle>
      <AlertDescription className="w-full min-w-0">
        <p className="w-full break-all font-mono text-xs">
          {event.tool}: {preview.slice(0, 300)}
          {preview.length > 300 ? "…" : ""}
        </p>
        {decision === undefined ? (
          <span className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => onDecide(event.requestId, true)}>
              <CheckIcon /> 許可
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDecide(event.requestId, false)}>
              <XIcon /> 却下
            </Button>
          </span>
        ) : (
          <span className="mt-1 text-xs">
            {decision.allowed ? "✓ 許可" : "✗ 却下"}（{decision.by}）
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
