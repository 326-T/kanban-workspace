"use client";

// AI Elements の PromptInput の簡易版（同一のコンポーネント分割）。
// 本家はモデル選択・添付・音声入力まで含むが、必要になった時点で
// https://registry.ai-sdk.dev/prompt-input.json から取り込む。

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SendIcon } from "lucide-react";
import type { ComponentProps, KeyboardEventHandler } from "react";

export type PromptInputProps = ComponentProps<"form">;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
  <form
    className={cn("flex w-full items-end gap-2 rounded-xl border bg-card p-2", className)}
    {...props}
  />
);

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;

export const PromptInputTextarea = ({
  className,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // Enter で送信、Shift+Enter で改行。IME 変換確定の Enter は送信しない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
    onKeyDown?.(e);
  };

  return (
    <Textarea
      className={cn(
        "max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      onKeyDown={handleKeyDown}
      rows={1}
      {...props}
    />
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof Button>;

export const PromptInputSubmit = ({ children, ...props }: PromptInputSubmitProps) => (
  <Button size="icon" type="submit" {...props}>
    {children ?? <SendIcon className="size-4" />}
  </Button>
);
