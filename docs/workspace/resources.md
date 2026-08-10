# リソースとマウントテーブル

## リソースモデル：フラット＋タグ

ワークスペース内の全リソースは**フラットな名前空間**で管理する。階層は作らない（決定 D7）。

```yaml
resource:
  name: frontend                 # ワークスペース内で一意
  kind: repo | shared | external-identity
  tags: [team:web, project:kanban, sensitivity:normal]
  backing: { type: git-bare, path: ... }   # 実体への参照（プラットフォーム内部情報）
```

- **kind**：`repo`（git bare リポジトリ）/ `shared`（共有ボリューム）/ `external-identity`（外部アカウント名義、[identity.md](identity.md)）
- **整理はタグで行う**（`key:value` 形式）。UI はタグでファセット表示・フィルタし、階層的な見せ方が必要なら UI 側で合成する。実装はフラットのまま
- タグは **ACL のセレクタ**にも使える（例：`tag:sensitivity=high` に部長ロールのみ read）。属性ベース（ABAC 的）の動的グループとして機能する
- したがって**タグの付与・変更は権限操作**である。自由にタグ付けできると権限昇格の経路になるため、ACL 変更と同じく承認・監査の対象とする

## ストレージ 3 層と昇格統制点

| 層 | 実体 | 権限 | 履歴 |
|---|---|---|---|
| ephemeral | Run サンドボックス内の scratch・worktree | サンドボックス内は自由 | なし（Run 終了で消滅） |
| shared-git | bare リポジトリ群 | ACL（リソース語彙） | git |
| shared-volume | 部署ドライブ的な置き場 | ACL（リソース語彙） | イベントログ＋スナップショット |

**統制点は層の境界＝昇格に置く**。ephemeral 内は自由に作業でき、shared へ出る瞬間（commit / merge / publish）にアイデンティティ・承認・監査が発動する。3 チョークポイント思想（[../permission/model.md](../permission/model.md)）の FS 版。

- 成果物として残るものは必ずバージョン管理された shared 層を通る
- shared-volume への書き込みは publish API 経由に絞る案が有力（バイナリでも来歴が自動で残る）。raw マウントを許すかは未決（O1）

## マウントテーブル

解決済みの Run 権限（`Template ∩ 起動者 ∩ カードスコープ`）を、Run サンドボックス内の具体的なマウントに翻訳する計画表。**権限モデルの実体化**であり、この設計がプラットフォームの要になる。翻訳先は Runner バックエンドに依存する（bwrap の bind 指定 / Seatbelt プロファイル / コンテナの volume。[../runtime/architecture.md](../runtime/architecture.md)）。

サンドボックス内レイアウトはプラットフォーム固定：

| マウント先 | 内容 | モード |
|---|---|---|
| `/work/repos/<name>` | rw：カードのブランチの **worktree** / ro：指定 ref の読み取り専用チェックアウト | 権限に従う |
| `/work/shared/<area>` | shared-volume の bind mount | 権限に従う |
| `/work/scratch` | ephemeral 領域 | 常に rw |

設計原則：

- **rw リポジトリはカードブランチの worktree をマウント**する。同一リポジトリへの並列 Run は worktree で隔離される（O2 の基本方針）
- **リソース内 glob の細粒度**：書き込み制限は受け側（コミット検証 / pre-receive）で確実に強制する。読み取り制限はディレクトリ単位のマスクマウントによるベストエフォート — 強い読み取り分離が必要なものはリポジトリ自体を分ける（O10）
- **external-identity と MCP はマウントされない**。サンドボックス内にはゲートウェイへのソケットだけを露出し、実クレデンシャルや外部エンドポイントはサンドボックスに入らない。外部ミラーとの同期もプラットフォーム側で行う
- マウントテーブルは Run ごとに**計算・記録・固定**する。イベントログに残るため「この Run が見えた範囲」の監査スナップショットになる
- **昇格の非対称性**：プロキシ経由の権限（MCP・external-identity）は Run 実行中に動的付与できる。FS 権限の変更は checkpoint コミット → 新テーブルで Run 再起動として反映する（マウントの動的変更はしない）

## 未決

- shared-volume の書き込み経路：publish API に絞るか raw マウントも許すか（O1）
- リポジトリ内読み取り制限のマスクマウント強化（O10）
- worktree 戦略の詳細：コンフリクト時のフロー、長期ブランチ（O2）
