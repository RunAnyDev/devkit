import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Check, Copy, Download, FileUp, Trash2 } from 'lucide-react';

const DEFAULT_MARKDOWN = `# Markdown Viewer

Write Markdown on the left and preview it live on the right.

## GitHub Flavored Markdown

- [x] Tables
- [x] Task lists
- [x] Strikethrough

| Tool | Support |
| --- | --- |
| Markdown | Yes |
| Mermaid | Yes |

\`\`\`mermaid
graph TD
  A[Markdown] --> B[ReactMarkdown]
  B --> C{Code block?}
  C -->|mermaid| D[Mermaid SVG]
  C -->|other| E[Code block]
\`\`\`
`;

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
});

const MermaidDiagram = ({ code }) => {
    const reactId = useId();
    const diagramId = useMemo(
        () => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        [reactId]
    );
    const [svg, setSvg] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const renderDiagram = async () => {
            try {
                const result = await mermaid.render(diagramId, code);
                if (!cancelled) {
                    setSvg(result.svg);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setSvg('');
                    setError(e?.message || 'Unable to render Mermaid diagram');
                }
            }
        };

        renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [code, diagramId]);

    if (error) {
        return (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-300">
                <div className="mb-2 font-bold text-red-200">Mermaid render error</div>
                <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                Rendering Mermaid diagram...
            </div>
        );
    }

    return (
        <div
            className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

const MarkdownViewer = () => {
    const fileInputRef = useRef(null);
    const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
    const [copied, setCopied] = useState(false);
    const [fileName, setFileName] = useState('markdown-preview.md');

    const handleCopy = async () => {
        if (!markdown) return;
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleClear = () => {
        setMarkdown('');
        setCopied(false);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        setMarkdown(text);
        setFileName(file.name || 'markdown-preview.md');
        event.target.value = '';
    };

    const handleExport = () => {
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const exportName = fileName.toLowerCase().endsWith('.md') || fileName.toLowerCase().endsWith('.markdown')
            ? fileName
            : `${fileName}.md`;

        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div>
                    <h2 className="text-sm font-bold text-slate-200">Markdown Viewer</h2>
                    <p className="text-xs text-slate-500">Live Markdown preview with GFM and Mermaid support</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".md,.markdown,text/markdown,text/plain"
                        className="hidden"
                        onChange={handleFileUpload}
                    />
                    <button
                        onClick={handleImportClick}
                        className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-slate-300 transition-all hover:bg-slate-700"
                    >
                        <FileUp size={18} />
                        Import
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-slate-300 transition-all hover:bg-slate-700"
                    >
                        <Download size={18} />
                        Export .md
                    </button>
                    <button
                        onClick={handleClear}
                        className="p-2 text-slate-400 transition-colors hover:text-red-400"
                        title="Clear all"
                    >
                        <Trash2 size={20} />
                    </button>
                    <button
                        onClick={handleCopy}
                        disabled={!markdown}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                            copied
                                ? 'border border-green-500/50 bg-green-500/20 text-green-400'
                                : 'bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
                        }`}
                    >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                        {copied ? 'Copied' : 'Copy Markdown'}
                    </button>
                </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
                <div className="flex min-h-[320px] flex-col gap-2 overflow-hidden md:min-h-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Editor</label>
                    <textarea
                        className="h-full flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-sm text-slate-300 outline-none transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                        value={markdown}
                        onChange={(event) => setMarkdown(event.target.value)}
                        placeholder="Paste Markdown here..."
                    />
                </div>

                <div className="flex min-h-[320px] flex-col gap-2 overflow-hidden md:min-h-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Preview</label>
                    <div className="markdown-preview h-full flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-slate-300 scrollbar-thin">
                        {markdown.trim() ? (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    a: ({ children, ...props }) => (
                                        <a className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:text-blue-300" target="_blank" rel="noreferrer" {...props}>
                                            {children}
                                        </a>
                                    ),
                                    blockquote: ({ children }) => (
                                        <blockquote className="border-l-4 border-blue-500/50 bg-slate-950/50 py-2 pl-4 text-slate-400">
                                            {children}
                                        </blockquote>
                                    ),
                                    code: ({ className, children, ...props }) => {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const code = String(children).replace(/\n$/, '');
                                        const isBlock = Boolean(className) || String(children).includes('\n');

                                        if (isBlock && match?.[1]?.toLowerCase() === 'mermaid') {
                                            return <MermaidDiagram code={code} />;
                                        }

                                        if (!isBlock) {
                                            return (
                                                <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-sm text-blue-300" {...props}>
                                                    {children}
                                                </code>
                                            );
                                        }

                                        return (
                                            <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                                                <code className={className} {...props}>{children}</code>
                                            </pre>
                                        );
                                    },
                                    h1: ({ children }) => <h1 className="mb-4 border-b border-slate-800 pb-3 text-3xl font-bold text-white">{children}</h1>,
                                    h2: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-bold text-slate-100">{children}</h2>,
                                    h3: ({ children }) => <h3 className="mb-2 mt-5 text-xl font-semibold text-slate-100">{children}</h3>,
                                    hr: () => <hr className="my-6 border-slate-800" />,
                                    li: ({ children }) => <li className="my-1 pl-1">{children}</li>,
                                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
                                    p: ({ children }) => <p className="my-3 leading-7 text-slate-300">{children}</p>,
                                    table: ({ children }) => (
                                        <div className="my-4 overflow-x-auto rounded-lg border border-slate-800">
                                            <table className="w-full border-collapse text-left text-sm">{children}</table>
                                        </div>
                                    ),
                                    tbody: ({ children }) => <tbody className="divide-y divide-slate-800">{children}</tbody>,
                                    td: ({ children }) => <td className="px-4 py-2 text-slate-300">{children}</td>,
                                    th: ({ children }) => <th className="bg-slate-950 px-4 py-2 font-bold text-slate-200">{children}</th>,
                                    thead: ({ children }) => <thead className="border-b border-slate-800">{children}</thead>,
                                    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
                                }}
                            >
                                {markdown}
                            </ReactMarkdown>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                Markdown preview will appear here...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarkdownViewer;
