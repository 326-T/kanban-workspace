import type { RunInfo } from "@kw/shared";
import { cn } from "@/lib/utils";
import { RunStateBadge } from "@/components/run-state-badge";

export function RunList({
  runs,
  selectedId,
  onSelect,
}: {
  runs: RunInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return <p className="px-1 text-muted-foreground text-xs">まだ Run がありません</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r.id)}
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
            r.id === selectedId && "border-ring bg-accent/30"
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{r.id}</span>
            <RunStateBadge state={r.state} />
          </span>
          <span className="truncate text-muted-foreground text-xs">{r.prompt}</span>
          <span className="text-[11px] text-muted-foreground/70">
            {r.engine} · ${(r.costUsd ?? 0).toFixed(4)}
            {r.autoApprove ? " · 自動承認" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
