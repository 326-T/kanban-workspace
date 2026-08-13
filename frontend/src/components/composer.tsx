"use client";

import { useState, type FormEvent } from "react";
import { SquareIcon } from "lucide-react";
import type { RunState } from "@/lib/api-types";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai/prompt-input";
import { Button } from "@/components/ui/button";

const placeholders: Record<RunState, string> = {
  waiting_input: "次の指示を入力（Enter で送信 / Shift+Enter で改行）",
  running: "作業中 — 送信すると次のターン境界で届きます",
  completed: "この Run は終了しています",
  failed: "この Run は終了しています",
};

export function Composer({
  state,
  onSend,
  onEnd,
}: {
  state: RunState;
  onSend: (text: string) => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const active = state === "running" || state === "waiting_input";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !active) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <div className="border-t p-4">
      <PromptInput onSubmit={submit} className="mx-auto max-w-3xl">
        <PromptInputTextarea
          placeholder={placeholders[state]}
          value={draft}
          disabled={!active}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!active}
          onClick={onEnd}
          title="Run を終了"
        >
          <SquareIcon />
        </Button>
        <PromptInputSubmit disabled={!active || !draft.trim()} />
      </PromptInput>
    </div>
  );
}
