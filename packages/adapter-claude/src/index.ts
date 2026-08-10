import { query } from "@anthropic-ai/claude-agent-sdk";
import { now, type AdapterIO, type EngineAdapter, type RunSpec, type Usage } from "@kw/shared";

// Claude Agent SDK を RunEvent ストリームに正規化するアダプタ（docs/runtime/engines.md）。
// streaming input モードを使う。SDK は入力ストリームを先読みで pull するため、
// 「result 受信 = ターン完了」までゲートしてから io.nextUserMessage() を呼ぶ。

function userMessage(text: string) {
  return {
    type: "user" as const,
    message: { role: "user" as const, content: text },
    parent_tool_use_id: null,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b?.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function toUsage(u: any): Usage | undefined {
  if (!u) return undefined;
  return { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

export const claudeAdapter: EngineAdapter = {
  name: "claude",

  async launch(spec: RunSpec, io: AdapterIO): Promise<void> {
    // ターン境界シグナル（result 受信で発火）
    let pendingTurns = 0;
    const turnWaiters: Array<() => void> = [];
    const signalTurn = () => {
      const w = turnWaiters.shift();
      if (w) w();
      else pendingTurns++;
    };
    const waitTurn = (): Promise<void> => {
      if (pendingTurns > 0) {
        pendingTurns--;
        return Promise.resolve();
      }
      return new Promise((res) => turnWaiters.push(res));
    };

    let inputEnded = false;
    let q: any;

    async function* input() {
      yield userMessage(spec.prompt);
      while (true) {
        await waitTurn(); // ターン完了までは入力プロンプトを出さない
        const next = await io.nextUserMessage();
        if (next === null) {
          inputEnded = true;
          // セッション終了。message ストリームが自然終了しないことがあるため明示的に畳む
          queueMicrotask(() => q?.close?.());
          return;
        }
        yield userMessage(next);
      }
    }

    q = query({
      prompt: input(),
      options: {
        cwd: spec.cwd,
        model: spec.model,
        systemPrompt: { type: "preset", preset: "claude_code" },
        // Run は隔離された実行。実行者ローカルの設定・CLAUDE.md は読み込まない
        settingSources: [],
        permissionMode: "default",
        canUseTool: async (toolName: string, toolInput: Record<string, unknown>, { requestId, title }: any) => {
          io.emit({ type: "permission_request", requestId, tool: toolName, input: toolInput, title, ts: now() });
          const allowed = await io.requestPermission(toolName, toolInput, title);
          io.emit({ type: "permission_decision", requestId, allowed, by: "launcher", ts: now() });
          return allowed
            ? { behavior: "allow" as const, updatedInput: toolInput }
            : { behavior: "deny" as const, message: "起動者が却下しました", interrupt: false };
        },
      },
    });

    let lastResult: { turns: number; usage?: Usage; costUsd?: number; summary: string } | undefined;

    try {
      for await (const msg of q as AsyncIterable<any>) {
        switch (msg.type) {
          case "assistant": {
            for (const block of msg.message?.content ?? []) {
              if (block.type === "text" && block.text?.trim()) {
                io.emit({ type: "assistant_message", text: block.text, ts: now() });
              } else if (block.type === "tool_use") {
                io.emit({ type: "tool_request", tool: block.name, input: block.input, ts: now() });
              }
            }
            break;
          }
          case "user": {
            for (const block of msg.message?.content ?? []) {
              if (block?.type === "tool_result") {
                io.emit({
                  type: "tool_result",
                  summary: truncate(blockText(block.content).trim(), 200),
                  isError: block.is_error === true,
                  ts: now(),
                });
              }
            }
            break;
          }
          case "result": {
            if (msg.subtype === "success") {
              lastResult = {
                turns: msg.num_turns,
                usage: toUsage(msg.usage),
                costUsd: msg.total_cost_usd,
                summary: msg.result ?? "",
              };
              io.emit({
                type: "turn_completed",
                turns: lastResult.turns,
                usage: lastResult.usage,
                costUsd: lastResult.costUsd,
                ts: now(),
              });
            } else {
              io.emit({ type: "failed", error: `${msg.subtype}: ${msg.result ?? ""}`, ts: now() });
            }
            signalTurn(); // 成否によらずターン境界。入力側のゲートを解除する
            break;
          }
        }
      }
    } catch (err) {
      // 入力終了後の close() に由来する abort は正常系
      if (!inputEnded) throw err;
    }

    if (lastResult) {
      io.emit({ type: "completed", ...lastResult, ts: now() });
    }
  },
};
