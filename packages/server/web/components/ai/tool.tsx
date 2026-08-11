"use client";

// Vercel AI Elements の Tool をベンダリングし、AI SDK の ToolUIPart 型を
// kanban-workspace の RunEvent プロトコル向けの ToolState に置き換えたもの。

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "./code-block";

export type ToolState = "running" | "approval-requested" | "completed" | "error" | "denied";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("not-prose w-full rounded-md border", className)} {...props} />
);

const labels: Record<ToolState, string> = {
  running: "実行中",
  "approval-requested": "承認待ち",
  completed: "完了",
  error: "エラー",
  denied: "却下",
};

const icons: Record<ToolState, ReactNode> = {
  running: <ClockIcon className="size-4 animate-pulse" />,
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  completed: <CheckCircleIcon className="size-4 text-green-600" />,
  error: <XCircleIcon className="size-4 text-red-600" />,
  denied: <XCircleIcon className="size-4 text-orange-600" />,
};

const getStatusBadge = (status: ToolState) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {icons[status]}
    {labels[status]}
  </Badge>
);

export type ToolHeaderProps = {
  title: string;
  state: ToolState;
  className?: string;
};

export const ToolHeader = ({ className, title, state, ...props }: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn("group flex w-full items-center justify-between gap-4 p-3", className)}
    {...props}
  >
    <div className="flex items-center gap-2">
      <WrenchIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">{title}</span>
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden p-4 pt-0", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: string;
  errorText?: string;
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  return (
    <div className={cn("space-y-2 p-4 pt-0", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground"
        )}
      >
        <CodeBlock code={errorText ?? output ?? ""} />
      </div>
    </div>
  );
};
