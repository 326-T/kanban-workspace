// AI Elements の CodeBlock の簡易版（同一 API）。
// 本家は shiki によるシンタックスハイライト付き。必要になったら
// https://registry.ai-sdk.dev/code-block.json を取り込んで差し替える。

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
};

export const CodeBlock = ({ code, language, className, ...props }: CodeBlockProps) => (
  <div
    className={cn("w-full overflow-x-auto rounded-md p-3", className)}
    data-language={language}
    {...props}
  >
    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  </div>
);
