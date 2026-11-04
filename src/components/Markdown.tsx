import {
  memo,
  useMemo,
  useRef,
  type HTMLAttributes,
} from "react";
import type { Element, ElementContent, Root, Text } from "hast";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Icon } from "./Icon";
import { Button } from "./UI";
import { useNotify } from "./notification-context";

interface StreamPiece {
  start: number;
  end: number;
  animated: boolean;
}

function visibleMarkdown(content: string, streaming: boolean) {
  if (!streaming) return content;

  const lines = content.match(/.*(?:\n|$)/g)?.filter(Boolean) ?? [];
  let offset = 0;
  let openFence: { character: string; size: number; offset: number } | null =
    null;
  let trailingBlockOffset = 0;
  let trailingLines: string[] = [];

  for (const line of lines) {
    const text = line.replace(/\n$/, "");
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(text);

    if (fence) {
      const marker = fence[1];

      if (!openFence) {
        openFence = {
          character: marker[0],
          size: marker.length,
          offset,
        };
      } else if (
        marker[0] === openFence.character &&
        marker.length >= openFence.size
      ) {
        openFence = null;
      }
    }

    if (!text.trim()) {
      trailingBlockOffset = offset + line.length;
      trailingLines = [];
    } else {
      trailingLines.push(text);
    }

    offset += line.length;
  }

  if (openFence) return content.slice(0, openFence.offset);

  if (
    trailingLines.length > 0 &&
    /^ {0,3}(?:`{1,2}|~{1,2})[^`~]*$/.test(trailingLines[0])
  ) {
    return content.slice(0, trailingBlockOffset);
  }

  const tableDivider = trailingLines.findIndex((line) =>
    /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
      line,
    ),
  );

  if (
    tableDivider > 0 ||
    /^\s*\|.*\|\s*$/.test(trailingLines[0] ?? "")
  ) {
    return content.slice(0, trailingBlockOffset);
  }

  return content;
}

function tailStart(content: string, words = 50) {
  const matches = [...content.matchAll(/\S+/g)];
  return matches.length > words
    ? (matches[matches.length - words].index ?? 0)
    : 0;
}

function streamPiecesPlugin(
  pieces: readonly StreamPiece[],
  source: string,
) {
  const animatedTail = tailStart(source);

  return () => (tree: Root) => {
    const visit = (parent: Root | Element, protectedContent = false) => {
      const next: ElementContent[] = [];

      for (const child of parent.children) {
        if (child.type === "element") {
          const blocked =
            protectedContent ||
            child.tagName === "pre" ||
            child.tagName === "code" ||
            child.tagName === "table";
          visit(child, blocked);
          next.push(child);
          continue;
        }

        if (child.type === "doctype") continue;

        if (
          protectedContent ||
          child.type !== "text" ||
          !child.value ||
          child.position?.start.offset === undefined ||
          child.position.end.offset === undefined
        ) {
          next.push(child);
          continue;
        }

        const start = child.position.start.offset;
        const end = child.position.end.offset;
        const lengthMatchesSource = end - start === child.value.length;

        if (!lengthMatchesSource) {
          next.push(child);
          continue;
        }

        const cuts = new Set([start, end]);
        for (const piece of pieces) {
          if (piece.start > start && piece.start < end) cuts.add(piece.start);
          if (piece.end > start && piece.end < end) cuts.add(piece.end);
        }

        const points = [...cuts].sort((a, b) => a - b);
        for (let index = 0; index < points.length - 1; index += 1) {
          const partStart = points[index];
          const partEnd = points[index + 1];
          const owner = pieces.find(
            (piece) => piece.start < partEnd && piece.end > partStart,
          );
          const animate =
            !!owner?.animated && partEnd > animatedTail;
          const text: Text = {
            type: "text",
            value: child.value.slice(partStart - start, partEnd - start),
          };

          next.push({
            type: "element",
            tagName: "span",
            properties: {
              className: animate
                ? ["stream-piece", "stream-piece-new"]
                : ["stream-piece"],
              "data-stream-key": `${partStart}-${partEnd}`,
            },
            children: [text],
          });
        }
      }

      parent.children = next;
    };

    visit(tree);
  };
}

const CodeBlock = memo(function CodeBlock({
  children,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const notify = useNotify();

  async function copy() {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      notify("Код скопирован");
    } catch {
      notify(
        "Нет доступа к буферу обмена. Выдели и скопируй код вручную.",
      );
    }
  }

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>Код</span>
        <Button className="button text" onClick={() => void copy()}>
          <Icon name="content_copy" />
          Копировать
        </Button>
      </div>
      <pre {...props} ref={ref}>
        {children}
      </pre>
    </div>
  );
});

const markdownComponents = {
  pre: ({ node: _node, ...props }: HTMLAttributes<HTMLPreElement> & {
    node?: Element;
  }) => <CodeBlock {...props} />,
  a: ({ node: _node, ...props }: HTMLAttributes<HTMLAnchorElement> & {
    node?: Element;
  }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ alt }: { alt?: string }) => (
    <span className="muted">[Изображение: {alt || "без описания"}]</span>
  ),
  table: ({ node: _node, ...props }: HTMLAttributes<HTMLTableElement> & {
    node?: Element;
  }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};

export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const stream = useRef<{ content: string; pieces: StreamPiece[] } | null>(
    null,
  );

  if (!stream.current || !content.startsWith(stream.current.content)) {
    stream.current = {
      content,
      pieces: content.length
        ? [{ start: 0, end: content.length, animated: false }]
        : [],
    };
  } else if (content.length > stream.current.content.length) {
    const start = stream.current.content.length;
    const addition = content.slice(start);
    const parts = addition.match(/\S+\s*|\s+/g) ?? [addition];
    let offset = start;

    for (const part of parts) {
      stream.current.pieces.push({
        start: offset,
        end: offset + part.length,
        animated: streaming && /\S/.test(part),
      });
      offset += part.length;
    }

    stream.current.content = content;
  }

  const visible = visibleMarkdown(content, streaming);
  const pieces = stream.current.pieces;
  const plugin = useMemo(
    () => streamPiecesPlugin(pieces, visible),
    [pieces, visible],
  );

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[plugin, rehypeHighlight]}
        components={markdownComponents}
      >
        {visible}
      </ReactMarkdown>
    </div>
  );
});
