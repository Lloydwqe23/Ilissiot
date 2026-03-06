import type { ReactNode } from "react";

type FormatMessageOptions = {
  onMentionClick?: (username: string) => void;
};

/**
 * Parses chat markup and returns formatted React elements.
 *
 * Supported syntax (WhatsApp-style):
 *   *bold*           → <strong>
 *   _italic_         → <em>
 *   __underline__    → <u>
 *   ~strikethrough~  → <s>
 *   `code`           → <code>
 *   ```block```      → <pre><code>
 *   [Text](url)      → <a>
 *   ||spoiler||      → <span class="spoiler">
 *   > blockquote     → <blockquote>  (at line start)
 *
 * Plain URLs are auto-linked.
 */

// ── Regex patterns ───────────────────────────────────────────
// Order matters: longer / more specific patterns first.
const CODE_BLOCK = /```([\s\S]*?)```/;
const INLINE_CODE = /`([^`\n]+)`/;
const HYPERLINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const SPOILER = /\|\|(.+?)\|\|/;
const UNDERLINE = /__(.+?)__/;
const BOLD = /\*(.+?)\*/;
const ITALIC = /(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/;
const STRIKE = /~(.+?)~/;
const MENTION = /(?<![\w.])@([a-z0-9_]{3,32})/;
const URL_RE = /(https?:\/\/[^\s<>"']+)/;

// Combined pattern source — order determines priority
const COMBINED_SOURCE = [
  CODE_BLOCK.source,     // group 1
  INLINE_CODE.source,    // group 2
  HYPERLINK.source,      // groups 3,4
  SPOILER.source,        // group 5
  UNDERLINE.source,      // group 6
  BOLD.source,           // group 7
  ITALIC.source,         // group 8
  STRIKE.source,         // group 9
  MENTION.source,        // group 10
  URL_RE.source,         // group 11
].join("|");

let keyCounter = 0;
function k() {
  return `fmt-${++keyCounter}`;
}

/**
 * Recursively format inline text (everything except code-block and blockquote).
 */
function formatInline(text: string, options?: FormatMessageOptions): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  // Create a NEW regex instance each call to avoid shared lastIndex corruption
  // when this function recurses.
  const re = new RegExp(COMBINED_SOURCE, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [full, codeBlock, inlineCode, linkText, linkUrl, spoiler, underline, bold, italic, strike, mention, url] = match;

    if (codeBlock !== undefined) {
      nodes.push(
        <pre key={k()} className="my-1 p-2 rounded-md bg-muted/50 overflow-x-auto text-sm font-mono whitespace-pre-wrap">
          <code>{codeBlock.trim()}</code>
        </pre>,
      );
    } else if (inlineCode !== undefined) {
      nodes.push(
        <code key={k()} className="px-1 py-0.5 rounded bg-muted/60 text-[13px] font-mono">
          {inlineCode}
        </code>,
      );
    } else if (linkText !== undefined && linkUrl !== undefined) {
      nodes.push(
        <a
          key={k()}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {linkText}
        </a>,
      );
    } else if (spoiler !== undefined) {
      nodes.push(
        <span key={k()} className="spoiler-text" onClick={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).classList.add("revealed");
        }}>
          {formatInline(spoiler, options)}
        </span>,
      );
    } else if (underline !== undefined) {
      nodes.push(<u key={k()}>{formatInline(underline, options)}</u>);
    } else if (bold !== undefined) {
      nodes.push(<strong key={k()}>{formatInline(bold, options)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={k()}>{formatInline(italic, options)}</em>);
    } else if (strike !== undefined) {
      nodes.push(<s key={k()}>{formatInline(strike, options)}</s>);
    } else if (mention !== undefined) {
      nodes.push(
        options?.onMentionClick ? (
          <button
            key={k()}
            type="button"
            className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              options.onMentionClick?.(mention);
            }}
          >
            @{mention}
          </button>
        ) : (
          <span
            key={k()}
            className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded"
          >
            @{mention}
          </span>
        ),
      );
    } else if (url !== undefined) {
      nodes.push(
        <a
          key={k()}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );
    }

    lastIndex = match.index + full.length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Top-level formatter — handles block-level elements first (blockquotes),
 * then delegates to `formatInline` for everything else.
 */
export function formatMessageContent(text: string, options?: FormatMessageOptions): ReactNode[] {
  // Reset key counter for each message
  keyCounter = 0;

  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let quoteBuffer: string[] = [];

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    const content = quoteBuffer.join("\n");
    result.push(
      <blockquote
        key={k()}
        className="border-l-[3px] border-primary/60 pl-3 my-1 text-muted-foreground italic"
      >
        {formatInline(content, options)}
      </blockquote>,
    );
    quoteBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(">")) {
      // Strip the leading > and optional space
      quoteBuffer.push(line.replace(/^>\s?/, ""));
    } else {
      flushQuote();
      if (result.length > 0 || i > 0) {
        // Add line break between non-quote lines
        if (i > 0 && !(lines[i - 1].startsWith(">"))) {
          result.push(<br key={k()} />);
        }
      }
      result.push(...formatInline(line, options));
    }
  }
  flushQuote();

  return result;
}

/**
 * Strip all formatting markers from text, returning plain text for previews.
 */
export function stripFormatting(text: string): string {
  return text
    // code blocks
    .replace(/```([\s\S]*?)```/g, "$1")
    // inline code
    .replace(/`([^`\n]+)`/g, "$1")
    // hyperlinks [text](url) → text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    // spoilers
    .replace(/\|\|(.+?)\|\|/g, "$1")
    // underline (before bold/italic since __ is longer)
    .replace(/__(.+?)__/g, "$1")
    // bold
    .replace(/\*(.+?)\*/g, "$1")
    // italic
    .replace(/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, "$1")
    // strikethrough
    .replace(/~(.+?)~/g, "$1")
    // blockquote markers
    .replace(/^>\s?/gm, "");
}
