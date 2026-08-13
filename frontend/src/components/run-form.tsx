"use client";

import { useState, type FormEvent } from "react";
import { PlayIcon } from "lucide-react";
import type { RunInfo } from "@/lib/api-types";
import { api } from "@/lib/api";
import { useResources } from "@/hooks/use-resources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Input と揃えたネイティブ select（radix Select を持ち込むほどではない）
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export function RunForm({ onCreated }: { onCreated?: (run: RunInfo) => void }) {
  const { resources, refresh: refreshResources } = useResources();
  const [prompt, setPrompt] = useState("");
  const [repo, setRepo] = useState(""); // "" = 未管理ディレクトリ
  const [dir, setDir] = useState("playground");
  const [autoApprove, setAutoApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun({
        prompt,
        autoApprove,
        ...(repo ? { repo } : { dir }),
      });
      setPrompt("");
      onCreated?.(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setError(null);
    try {
      const res = await api.addResource({ name: newName, path: newPath });
      await refreshResources();
      setRepo(res.name);
      setNewName("");
      setNewPath("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

          <select value={repo} onChange={(e) => setRepo(e.target.value)} className={selectClass}>
            <option value="">（未管理ディレクトリ）</option>
            {resources.map((r) => (
              <option key={r.name} value={r.name}>
                repo: {r.name}
              </option>
            ))}
          </select>

          {repo === "" ? (
            <Input
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="作業ディレクトリ"
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              run/&lt;runId&gt; ブランチの worktree 上で実行され、終了時に checkpoint コミットされます
            </p>
          )}

          <Label className="font-normal text-muted-foreground text-xs">
            <Checkbox checked={autoApprove} onCheckedChange={(v) => setAutoApprove(v === true)} />
            危険操作を自動承認する
          </Label>

          <Button type="submit" disabled={!prompt.trim() || busy}>
            <PlayIcon /> Run 起動
          </Button>

          <Collapsible>
            <CollapsibleTrigger className="text-muted-foreground text-xs hover:underline">
              + リポジトリを登録
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              <Input
                placeholder="名前（例: demo）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="パス（例: playground/demo-repo）"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={register}
                disabled={!newName.trim() || !newPath.trim()}
              >
                登録（未 init なら git init + 空 first commit）
              </Button>
            </CollapsibleContent>
          </Collapsible>

          {error && <p className={cn("text-destructive text-xs")}>{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
