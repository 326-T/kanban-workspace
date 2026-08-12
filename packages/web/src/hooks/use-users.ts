import { useCallback, useEffect, useState } from "react";
import type { User } from "@kw/shared";
import { api } from "@/lib/api";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);

  const refresh = useCallback(() => {
    return api
      .listUsers()
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, refresh };
}
