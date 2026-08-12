"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountSwitcher } from "@/components/account-switcher";
import { api } from "@/lib/api";
import { useRuns } from "@/hooks/use-runs";
import { useRunEvents } from "@/hooks/use-run-events";
import { Composer } from "@/components/composer";
import { EventTimeline } from "@/components/event-timeline";
import { RunForm } from "@/components/run-form";
import { RunList } from "@/components/run-list";
import { RunStateBadge } from "@/components/run-state-badge";

export function App() {
  const { runs, refresh } = useRuns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const events = useRunEvents(selectedId);
  const run = runs.find((r) => r.id === selectedId);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-r p-4">
        <header>
          <h1 className="font-semibold">kanban-workspace</h1>
          <p className="text-muted-foreground text-xs">Run kernel v0 — UI は API の投影（D10）</p>
        </header>
        <AccountSwitcher />
        <RunForm
          onCreated={(r) => {
            refresh();
            setSelectedId(r.id);
          }}
        />
        <RunList runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
          {run ? (
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">{run.id}</span>
              <RunStateBadge state={run.state} />
              {run.branch && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {run.repo} ⎇ {run.branch}
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                ${(run.costUsd ?? 0).toFixed(4)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Run 未選択</span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-amber-500">
            <TriangleAlertIcon className="size-3.5" />
            sandbox: none（開発モード・隔離なし。本番は Linux + bwrap）
          </span>
        </div>

        {run ? (
          <>
            <EventTimeline
              events={events}
              onDecide={(requestId, allow) =>
                api.decidePermission(run.id, requestId, allow).then(refresh)
              }
            />
            <Composer
              state={run.state}
              onSend={(t) => api.sendMessage(run.id, t).then(refresh)}
              onEnd={() => api.endRun(run.id).then(refresh)}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Run を起動するか、左のリストから選択してください
          </div>
        )}
      </main>
    </div>
  );
}
