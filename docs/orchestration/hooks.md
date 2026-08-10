# イベントフックと HITL

## HITL の 2 形態

1. **対話型（同期）**：カードを開くとチャットビュー。エージェントの質問への応答・危険操作の承認を行う。権限があれば起動者以外も応答できる（共有インボックス、[board/model.md](../board/model.md)）
2. **フック型（非同期）**：状態遷移イベントに反応して、次のエージェント起動や人間へのアクション要求を自動で行う

## フックの定義

フック = **イベント × 条件 × アクション**。MVP は宣言的な YAML で Template またはボードに定義する。

```yaml
hooks:
  - on: run.completed
    if: { card.label: "実装" }
    do:
      - create_card:
          title: "レビュー: {{card.title}}"
          column: InReview
          assign_role: 課長        # 組織木から解決
  - on: run.failed
    do:
      - request_action:
          to_role: 課長
          message: "{{card.title}} が失敗しました。対応方針を判断してください"
  - on: approval.denied
    do:
      - notify: { to: "{{run.launcher}}" }
```

**イベント**：`run.completed / run.failed / card.moved / approval.requested / approval.granted / approval.denied` など。すべて Postgres のイベントログから発火する。

**アクション**：`create_card / launch(template) / request_action(role|user) / notify`。宛先にロールを指定でき、組織木から実際の人へ解決される（「上長に報告」の一般形）。

## 原則：隠れたフローを作らない

フックの効果は**必ずボード上のカードまたはカード上のイベントとして現れる**。エージェント連鎖（A 完了 → B 起動）も、B のカードが生成・遷移する形で全員から見える。ワークフローエンジン（BPM）への発展は意図的に抑制し、「状態は全部ボードにある」原則を守る。

- カード間の依存（このカードが Done になったら着手可能）は第一級の関係としてボードに表示する
- 複雑な条件分岐が必要になったら、それはフックではなく「判断するエージェント」のカードにする

## カスタムスクリプト（将来）

宣言的フックで足りないロジックは deno sandbox 上のユーザ定義スクリプトとして実行する（権限ゼロ + 明示的許可）。MVP では実装しない。
