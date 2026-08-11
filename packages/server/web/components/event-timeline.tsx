"use client";

import { useMemo } from "react";
import { CheckCircleIcon, MessageSquareIcon, XCircleIcon } from "lucide-react";
import type { RunEvent } from "@kw/shared";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { Message, MessageContent } from "@/components/ai/message";
import { Response } from "@/components/ai/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai/tool";
import { PermissionCard, type PermissionRequestEvent } from "@/components/permission-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ToolRequestEvent = Extract<RunEvent, { type: "tool_request" }>;
type ToolResultEvent = Extract<RunEvent, { type: "tool_result" }>;

// tool_request と直後の tool_result を 1 つの Tool 表示に束ねる。
// （RunEvent v0 には相関 ID がないため、エンジンの逐次実行性を前提に隣接ペアリング）
type Item =
  | { kind: "event"; event: RunEvent }
  | { kind: "tool"; request: ToolRequestEvent; result?: ToolResultEvent };

function buildItems(events: RunEvent[]): Item[] {
  const items: Item[] = [];
  let openTool: Extract<Item, { kind: "tool" }> | null = null;

  for (const e of events) {
    if (e.type === "tool_request") {
      openTool = { kind: "tool", request: e };
      items.push(openTool);
    } else if (e.type === "tool_result") {
      if (openTool && !openTool.result) {
        openTool.result = e;
        openTool = null;
      } else {
        items.push({ kind: "event", event: e });
      }
    } else if (e.type === "permission_decision") {
      // 表示は PermissionCard 側に集約する
    } else {
      items.push({ kind: "event", event: e });
    }
  }
  return items;
}

export function EventTimeline({
  events,
  onDecide,
}: {
  events: RunEvent[];
  onDecide: (requestId: string, allow: boolean) => void;
}) {
  const items = useMemo(() => buildItems(events), [events]);

  const decisions = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const e of events) {
      if (e.type === "permission_decision") m.set(e.requestId, e.allowed);
    }
    return m;
  }, [events]);

  const hasOpenPermission = useMemo(
    () =>
      events.some((e) => e.type === "permission_request" && !decisions.has(e.requestId)),
    [events, decisions]
  );

  const toolState = (item: Extract<Item, { kind: "tool" }>, isLast: boolean): ToolState => {
    if (item.result) return item.result.isError ? "error" : "completed";
    if (isLast && hasOpenPermission) return "approval-requested";
    return "running";
  };

  return (
    <Conversation>
      <ConversationContent className="mx-auto w-full max-w-3xl gap-3">
        {items.length === 0 && (
          <ConversationEmptyState
            icon={<MessageSquareIcon className="size-6" />}
            title="イベントはまだありません"
            description="エージェントの動きがここに流れます"
          />
        )}
        {items.map((item, i) => {
          if (item.kind === "tool") {
            return (
              <Tool key={i}>
                <ToolHeader
                  title={item.request.tool}
                  state={toolState(item, i === items.length - 1)}
                />
                <ToolContent>
                  <ToolInput input={item.request.input} />
                  <ToolOutput
                    output={item.result && !item.result.isError ? item.result.summary : undefined}
                    errorText={item.result?.isError ? item.result.summary : undefined}
                  />
                </ToolContent>
              </Tool>
            );
          }

          const e = item.event;
          switch (e.type) {
            case "run_started":
              return (
                <p key={i} className="text-muted-foreground text-xs">
                  ● run 開始 — engine={e.engine} / cwd={e.cwd} / sandbox={e.sandbox}
                </p>
              );
            case "assistant_message":
              return (
                <Message key={i} from="assistant">
                  <MessageContent>
                    <Response>{e.text}</Response>
                  </MessageContent>
                </Message>
              );
            case "permission_request": {
              const req = e as PermissionRequestEvent;
              return (
                <PermissionCard
                  key={i}
                  event={req}
                  decision={decisions.get(req.requestId)}
                  onDecide={onDecide}
                />
              );
            }
            case "turn_completed":
              return (
                <p key={i} className="text-muted-foreground text-xs">
                  — turn 完了 · ${e.costUsd?.toFixed(4) ?? "?"}
                </p>
              );
            case "completed":
              return (
                <Alert key={i} className="max-w-3xl border-emerald-500/50 bg-emerald-500/5">
                  <CheckCircleIcon className="text-emerald-500" />
                  <AlertTitle>完了</AlertTitle>
                  <AlertDescription>
                    turns={e.turns} · in {e.usage?.inputTokens ?? "?"} / out{" "}
                    {e.usage?.outputTokens ?? "?"} tokens · ${e.costUsd?.toFixed(4) ?? "?"}
                  </AlertDescription>
                </Alert>
              );
            case "failed":
              return (
                <Alert key={i} variant="destructive" className="max-w-3xl border-destructive/50">
                  <XCircleIcon />
                  <AlertTitle>失敗</AlertTitle>
                  <AlertDescription>{e.error}</AlertDescription>
                </Alert>
              );
            default:
              return null;
          }
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
