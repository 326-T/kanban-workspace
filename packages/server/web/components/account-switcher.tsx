"use client";

import { useState } from "react";
import { UserIcon } from "lucide-react";
import { api, getActingUser, setActingUser } from "@/lib/api";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

// D13: 認証なしのアカウントスイッチャ。「誰として行動するか」を切り替える。
// 承認ルーティング（B6）のデモを一人で回すための仕掛けでもある。

const selectClass =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

const ROLES = ["メンバー", "課長", "部長"];

export function AccountSwitcher() {
  const { users, refresh } = useUsers();
  const [acting, setActing] = useState(getActingUser());
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("メンバー");
  const [error, setError] = useState<string | null>(null);

  const switchTo = (name: string) => {
    setActingUser(name);
    setActing(name);
  };

  const addUser = async () => {
    setError(null);
    try {
      const u = await api.addUser({ name: newName, role: newRole });
      await refresh();
      switchTo(u.name);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const actingRole = users.find((u) => u.name === acting)?.role;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <UserIcon className="size-3.5" />
        アカウント{actingRole ? `（${actingRole}）` : ""}
      </div>
      <select value={acting} onChange={(e) => switchTo(e.target.value)} className={selectClass}>
        {!users.some((u) => u.name === acting) && <option value={acting}>{acting}</option>}
        {users.map((u) => (
          <option key={u.name} value={u.name}>
            {u.name}（{u.role}）
          </option>
        ))}
      </select>
      <Collapsible>
        <CollapsibleTrigger className="text-muted-foreground text-xs hover:underline">
          + ユーザを追加
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-2">
          <Input
            placeholder="名前（例: tanaka）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8"
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={selectClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={addUser} disabled={!newName.trim()}>
            追加して切替
          </Button>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
