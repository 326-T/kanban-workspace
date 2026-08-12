import { useEffect, useState } from "react";
import type { RunEvent } from "@kw/shared";
import { api } from "@/lib/api";

// 選択中 Run のイベントストリーム購読。
// サーバは Last-Event-ID による途中再開に対応しているため、
// EventSource の自動再接続で重複しない。

export function useRunEvents(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    if (!runId) return;
    const es = new EventSource(api.eventsUrl(runId));
    es.onmessage = (m) => setEvents((prev) => [...prev, JSON.parse(m.data) as RunEvent]);
    return () => es.close();
  }, [runId]);

  return events;
}
