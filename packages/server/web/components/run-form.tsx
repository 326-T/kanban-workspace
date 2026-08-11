"use client";

import { useState, type FormEvent } from "react";
import { PlayIcon } from "lucide-react";
import type { RunInfo } from "@kw/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RunForm({ onCreated }: { onCreated?: (run: RunInfo) => void }) {
  const [prompt, setPrompt] = useState("");
  const [dir, setDir] = useState("playground");
  const [autoApprove, setAutoApprove] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const run = await api.createRun({ prompt, dir, autoApprove });
      setPrompt("");
      onCreated?.(run);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Textarea
            placeholder="エージェントへの指示…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-20"
          />
          <Input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="作業ディレクトリ"
          />
          <Label className="font-normal text-muted-foreground text-xs">
            <Checkbox
              checked={autoApprove}
              onCheckedChange={(v) => setAutoApprove(v === true)}
            />
            危険操作を自動承認する
          </Label>
          <Button type="submit" disabled={!prompt.trim() || busy}>
            <PlayIcon /> Run 起動
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
