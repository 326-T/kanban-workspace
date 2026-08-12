import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { User } from "@kw/shared";

// ユーザ登録簿 v0（D13: PoC は認証なし・申告制）。
// role は職位ロール（メンバー / 課長 / 部長）。組織木・ACL への拡張は B6。

const ROLES = ["メンバー", "課長", "部長"];

export class UserRegistry {
  private file: string;
  private users = new Map<string, User>();

  constructor(baseDir: string) {
    this.file = join(baseDir, ".kw", "users.json");
    mkdirSync(dirname(this.file), { recursive: true });
    this.load();
    if (this.users.size === 0) {
      // 初回シード。オーナーは最上位ロールにしておく
      this.users.set("owner", { name: "owner", role: "部長", createdAt: new Date().toISOString() });
      this.save();
    }
  }

  private load() {
    if (!existsSync(this.file)) return;
    const data = JSON.parse(readFileSync(this.file, "utf8")) as { users?: User[] };
    for (const u of data.users ?? []) this.users.set(u.name, u);
  }

  private save() {
    writeFileSync(this.file, JSON.stringify({ users: [...this.users.values()] }, null, 2));
  }

  list(): User[] {
    return [...this.users.values()];
  }

  add(opts: { name: string; role?: string }): User {
    const name = opts.name.trim();
    if (!/^[\w.-]{1,32}$/.test(name)) throw new Error(`invalid user name: ${name}`);
    if (this.users.has(name)) throw new Error(`user already exists: ${name}`);
    const role = opts.role?.trim() || "メンバー";
    if (!ROLES.includes(role)) throw new Error(`invalid role: ${role}（${ROLES.join(" / ")}）`);
    const user: User = { name, role, createdAt: new Date().toISOString() };
    this.users.set(name, user);
    this.save();
    return user;
  }
}
