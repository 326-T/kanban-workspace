import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Resource } from "@kw/shared";
import { ensureHeadCommit, git } from "./git";

// リソース登録簿 v0（docs/workspace/resources.md）。
// フラット名前空間 + タグ。永続化は .kw/resources.json。

export class ResourceRegistry {
  private file: string;
  private resources = new Map<string, Resource>();

  constructor(baseDir: string) {
    this.file = join(baseDir, ".kw", "resources.json");
    mkdirSync(dirname(this.file), { recursive: true });
    this.load();
  }

  private load() {
    if (!existsSync(this.file)) return;
    const data = JSON.parse(readFileSync(this.file, "utf8")) as { resources?: Resource[] };
    for (const r of data.resources ?? []) this.resources.set(r.name, r);
  }

  private save() {
    writeFileSync(this.file, JSON.stringify({ resources: [...this.resources.values()] }, null, 2));
  }

  list(): Resource[] {
    return [...this.resources.values()];
  }

  get(name: string): Resource | undefined {
    return this.resources.get(name);
  }

  // repo リソースの登録。パスが git リポジトリでなければ init し、
  // 空の first commit を root に作る（HEAD が無いと worktree を切れない）。
  add(opts: { name: string; path: string; tags?: string[] }): Resource {
    const name = opts.name.trim();
    if (!/^[a-zA-Z0-9][\w-]*$/.test(name)) {
      throw new Error(`invalid resource name: ${name}`);
    }
    if (this.resources.has(name)) {
      throw new Error(`resource already exists: ${name}`);
    }
    const abs = resolve(opts.path.trim());
    mkdirSync(abs, { recursive: true });
    if (!existsSync(join(abs, ".git"))) {
      git(["init", abs]);
    }
    ensureHeadCommit(abs);

    const resource: Resource = {
      name,
      kind: "repo",
      path: abs,
      tags: opts.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.resources.set(name, resource);
    this.save();
    return resource;
  }
}
