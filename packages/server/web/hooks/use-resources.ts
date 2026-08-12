import { useCallback, useEffect, useState } from "react";
import type { Resource } from "@kw/shared";
import { api } from "@/lib/api";

export function useResources() {
  const [resources, setResources] = useState<Resource[]>([]);

  const refresh = useCallback(() => {
    return api
      .listResources()
      .then(setResources)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resources, refresh };
}
