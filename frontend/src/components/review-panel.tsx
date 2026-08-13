"use client";

import { useEffect, useState } from "react";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { CheckIcon, GitMergeIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { DiffResponse, RunInfo } from "@/lib/api-types";
import { api } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// 成果物レビュー関門（D4）。run ブランチの差分を見て、承認ならベースへマージする。
// マージコミットの名義は承認した人間になる（D5: author = 実行主体）。

const statusLabel: Record<string, string> = { A: "追加", M: "変更", D: "削除", R: "リネーム" };

const langOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "text";

export default function ReviewPanel({ run, onReviewed }: { run: RunInfo; onReviewed: () => void }) {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDiff(null);
    setError(null);
    api
      .getDiff(run.id)
      .then(setDiff)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [run.id]);

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.review(run.id, approve, comment);
      setComment("");
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reviewed = run.reviewState != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
        <GitMergeIcon className="size-3.5 text-muted-foreground" />
        {diff ? (
          <span className="font-mono">
            {diff.base} ← {diff.branch}
          </span>
        ) : (
          <span className="text-muted-foreground">差分を読み込み中…</span>
        )}
        {diff?.files.map((f) => (
          <Badge key={f.path} variant="outline" className="font-mono text-[10px]">
            {statusLabel[f.status[0] ?? "M"] ?? f.status} {f.path}
            <span className="text-emerald-500">+{f.additions}</span>
            <span className="text-red-500">-{f.deletions}</span>
          </Badge>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && (
          <Alert variant="destructive" className="mb-3 border-destructive/50">
            <XIcon />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {diff?.files.length === 0 && (
          <p className="text-muted-foreground text-sm">この Run による変更はありません。</p>
        )}

        <div className="flex flex-col gap-4">
          {diff?.files.map((f) => (
            <div key={f.path} className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/30 px-3 py-1.5 font-mono text-xs">{f.path}</div>
              <div className="overflow-x-auto text-xs">
                <DiffView
                  data={{
                    oldFile: { fileName: f.path, fileLang: langOf(f.path), content: "" },
                    newFile: { fileName: f.path, fileLang: langOf(f.path), content: "" },
                    hunks: [f.hunks],
                  }}
                  diffViewMode={DiffModeEnum.Unified}
                  diffViewTheme="dark"
                  diffViewHighlight
                  diffViewWrap
                  diffViewFontSize={12}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t p-4">
        {reviewed ? (
          <Alert
            className={cn(
              "max-w-3xl",
              run.reviewState === "approved"
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-amber-500/50 bg-amber-500/5",
            )}
          >
            {run.reviewState === "approved" ? (
              <CheckIcon className="text-emerald-500" />
            ) : (
              <RotateCcwIcon className="text-amber-500" />
            )}
            <AlertTitle>{run.reviewState === "approved" ? "承認済み（マージ済み）" : "差し戻し済み"}</AlertTitle>
            <AlertDescription>
              {run.reviewState === "approved"
                ? "ベースブランチへマージされ、worktree は片付けられました。"
                : "run ブランチは残っています。修正して再度 Run を起動してください。"}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <Textarea
              placeholder="レビューコメント（任意。差し戻し時は理由を書く）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-16"
            />
            <div className="flex gap-2">
              <Button onClick={() => decide(true)} disabled={busy || !diff}>
                <CheckIcon /> 承認してマージ
              </Button>
              <Button variant="destructive" onClick={() => decide(false)} disabled={busy || !diff}>
                <RotateCcwIcon /> 差し戻す
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
