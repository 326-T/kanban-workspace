import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RunState } from "@kw/shared";

const config: Record<RunState, { label: string; className: string }> = {
  running: { label: "実行中", className: "bg-blue-600 text-white" },
  waiting_input: { label: "入力待ち", className: "bg-amber-500 text-black" },
  completed: { label: "完了", className: "bg-emerald-600 text-white" },
  failed: { label: "失敗", className: "bg-red-600 text-white" },
};

export function RunStateBadge({ state, className }: { state: RunState; className?: string }) {
  const c = config[state];
  return <Badge className={cn(c.className, className)}>{c.label}</Badge>;
}
