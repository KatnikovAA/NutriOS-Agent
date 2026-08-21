import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  children: string;
};

function ExternalLink({ href, ...props }: ComponentProps<"a">) {
  const external = /^(?:https?:)?\/\//i.test(href ?? "");

  return (
    <a
      {...props}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary"
    />
  );
}

export function MarkdownContent({ children }: MarkdownContentProps) {
  return (
    <div className="mt-5 min-w-0 text-sm leading-7 text-foreground/90">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node: _node, ...props }) => (
            <h1 {...props} className="mb-3 mt-7 text-xl font-semibold leading-tight tracking-tight first:mt-0" />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 {...props} className="mb-2 mt-6 border-b pb-2 text-lg font-semibold leading-tight tracking-tight first:mt-0" />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 {...props} className="mb-2 mt-5 text-base font-semibold leading-snug first:mt-0" />
          ),
          h4: ({ node: _node, ...props }) => (
            <h4 {...props} className="mb-1.5 mt-4 text-sm font-semibold first:mt-0" />
          ),
          p: ({ node: _node, ...props }) => <p {...props} className="my-3 first:mt-0 last:mb-0" />,
          ul: ({ node: _node, ...props }) => (
            <ul {...props} className="my-3 list-disc space-y-1.5 pl-5 marker:text-primary" />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol {...props} className="my-3 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-primary" />
          ),
          li: ({ node: _node, ...props }) => <li {...props} className="pl-1 [&>p]:my-0" />,
          strong: ({ node: _node, ...props }) => <strong {...props} className="font-semibold text-foreground" />,
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              {...props}
              className="my-4 rounded-r-lg border-l-2 border-primary/45 bg-primary/5 py-2 pl-4 pr-3 text-muted-foreground [&>p]:my-0"
            />
          ),
          a: ({ node: _node, ...props }) => <ExternalLink {...props} />,
          img: ({ node: _node, src: _src, alt }) => (
            <span className="my-2 block rounded-md border bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
              Изображение не загружено{alt ? `: ${alt}` : ""}
            </span>
          ),
          hr: ({ node: _node, ...props }) => <hr {...props} className="my-6 border-border" />,
          pre: ({ node: _node, ...props }) => (
            <pre {...props} className="my-4 overflow-x-auto rounded-lg border bg-muted/70 p-3 text-xs leading-6" />
          ),
          code: ({ node: _node, ...props }) => (
            <code
              {...props}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground [pre_&]:bg-transparent [pre_&]:p-0"
            />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-lg border">
              <table {...props} className="w-full border-collapse text-left text-xs" />
            </div>
          ),
          thead: ({ node: _node, ...props }) => <thead {...props} className="bg-muted/80 text-foreground" />,
          tr: ({ node: _node, ...props }) => <tr {...props} className="border-b last:border-b-0" />,
          th: ({ node: _node, ...props }) => <th {...props} className="px-3 py-2 font-semibold" />,
          td: ({ node: _node, ...props }) => <td {...props} className="px-3 py-2 align-top" />,
          input: ({ node: _node, ...props }) => (
            <input {...props} disabled className="mr-1.5 size-3.5 accent-primary" />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
