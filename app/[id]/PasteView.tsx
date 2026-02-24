"use client";

import { useEffect, useState } from "react";
import type { Paste } from "@/lib/storage";

interface Props {
  paste: Paste;
}

const LANGUAGE_MAP: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  rust: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  html: "xml",
  css: "css",
  json: "json",
  yaml: "yaml",
  toml: "ini",
  markdown: "markdown",
  bash: "bash",
  sql: "sql",
  php: "php",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  r: "r",
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatExpiry(ms: number | null): string {
  if (!ms) return "Never";
  const diff = ms - Date.now();
  if (diff <= 0) return "Expired";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

function LineNumbers({ count }: { count: number }) {
  return (
    <div className="select-none text-right pr-4 pl-4 text-gray-600 text-xs leading-6 font-mono border-r border-gray-800 min-w-[3rem]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  );
}

export default function PasteView({ paste }: Props) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const lineCount = paste.content.split("\n").length;

  useEffect(() => {
    async function highlight() {
      const mapped = LANGUAGE_MAP[paste.language];
      if (!mapped) return;

      try {
        const hljs = (await import("highlight.js/lib/core")).default;
        const mod = await import(`highlight.js/lib/languages/${mapped}`);
        hljs.registerLanguage(mapped, mod.default);
        const result = hljs.highlight(paste.content, { language: mapped });
        setHighlightedHtml(result.value);
      } catch {
        // fallback to plain text
      }
    }
    highlight();
  }, [paste.content, paste.language]);

  async function copyContent() {
    await navigator.clipboard.writeText(paste.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{paste.title}</h1>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
            <span>Created {formatDate(paste.createdAt)}</span>
            <span>·</span>
            <span className="text-blue-400">{paste.language}</span>
            <span>·</span>
            <span>Expires: {formatExpiry(paste.expiresAt)}</span>
            <span>·</span>
            <span>{paste.content.length.toLocaleString()} chars · {lineCount} lines</span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={copyLink}
            className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            {linkCopied ? "✓ Copied!" : "🔗 Copy link"}
          </button>
          <button
            onClick={copyContent}
            className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
          <a
            href="/"
            className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors"
          >
            + New
          </a>
        </div>
      </div>

      {/* Code block */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex overflow-auto text-sm">
          {/* Line numbers */}
          <LineNumbers count={lineCount} />

          {/* Code */}
          <div className="flex-1 overflow-auto">
            {highlightedHtml ? (
              <pre className="p-0 m-0 bg-transparent">
                <code
                  className="block font-mono leading-6 pl-4 pr-4 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              </pre>
            ) : (
              <pre className="p-0 m-0 bg-transparent">
                <code className="block font-mono leading-6 pl-4 pr-4 text-gray-300 whitespace-pre">
                  {paste.content}
                </code>
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Raw link */}
      <div className="text-center">
        <a
          href={`/api/paste?id=${paste.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          View raw →
        </a>
      </div>
    </div>
  );
}
