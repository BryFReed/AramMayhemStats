import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  children: string;
  className?: string;
}

export function RichMarkdown({ children, className = '' }: Props) {
  return (
    <div className={`text-sm leading-relaxed text-zinc-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold mt-5 mb-2 text-zinc-50 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-4 mb-2 text-zinc-50 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[0.95rem] font-semibold mt-4 mb-1.5 text-zinc-100 tracking-tight first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-3 mb-1 text-zinc-200 uppercase tracking-wide first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-2.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 ml-5 list-disc space-y-1.5 marker:text-zinc-600">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 ml-5 list-decimal space-y-1.5 marker:text-zinc-600">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-50">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
          code: ({ className: cn, children }) => {
            const isBlock = typeof cn === 'string' && cn.startsWith('language-');
            if (isBlock) {
              return <code className="font-mono text-xs">{children}</code>;
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-100 text-[0.85em] font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 p-3 rounded border border-zinc-800 bg-zinc-950 overflow-auto text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-zinc-700 pl-3 text-zinc-300 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-zinc-800" />,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) window.api.shell.openExternal(href);
              }}
              className="text-emerald-400 hover:underline cursor-pointer"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-zinc-700 px-2 py-1.5 text-left font-semibold text-zinc-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-zinc-900 px-2 py-1.5 align-top">{children}</td>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
