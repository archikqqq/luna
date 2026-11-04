import { useRef, type HTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Icon } from "./Icon";
import { Button } from "./ui";
import { useNotify } from "./Notifications";

function CodeBlock({
  children,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const notify = useNotify();

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        ref.current?.textContent ?? "",
      );
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
        <Button
          className="button text"
          onClick={() => void copy()}
        >
          <Icon name="content_copy" />
          Копировать
        </Button>
      </div>
      <pre {...props} ref={ref}>
        {children}
      </pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ node: _node, ...props }) => (
            <CodeBlock {...props} />
          ),
          a: ({ node: _node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          img: ({ alt }) => (
            <span className="muted">
              [Изображение: {alt || "без описания"}]
            </span>
          ),
          table: ({ node: _node, ...props }) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
