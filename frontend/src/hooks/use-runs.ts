import { useCallback, useEffect, useState } from "react";
import type { RunInfo } from "@/lib/api-types";
import { api } from "@/lib/api";

// Run 一覧のポーリング。状態遷移の即時性はイベント SSE 側が担い、
// 一覧はコスト・状態バッジの追従用に緩く更新する。

export function useRuns(intervalMs = 2000) {
  const [runs, setRuns] = useState<RunInfo[]>([]);

  const refresh = useCallback(() => {
    return api
      .listRuns()
      .then(setRuns)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { runs, refresh };
}
