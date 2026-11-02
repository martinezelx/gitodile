import React from "react";
import type { DiffRange } from "./diffDetails";

/** Decorate the already-tokenized full line, so a changed word inside a
 * string/comment retains its syntax colour. Raw text (including tabs) stays
 * untouched for copying and assistive technology; glyphs are CSS-only. */
export function decorateDiffLine(content: React.ReactNode, ranges: readonly DiffRange[] | undefined): React.ReactNode {
  if (!ranges?.length) return content;
  let offset = 0;
  let whitespaceGlyphs = 0;
  const decorateWhitespace = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of text.matchAll(/[ \t]/g)) {
      // Row virtualization alone cannot bound the DOM inside one huge line.
      // Keep the remainder as source text, with its normal changed tint.
      if (whitespaceGlyphs >= 64) break;
      if (match.index > cursor) parts.push(text.slice(cursor, match.index));
      parts.push(<span className="diff-changed-whitespace" data-whitespace={match[0] === "\t" ? "→" : "·"} key={match.index}>{match[0]}</span>);
      whitespaceGlyphs += 1;
      cursor = match.index + 1;
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };
  const decorate = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, (node) => {
    if (typeof node === "string") {
      const start = offset;
      offset += node.length;
      const parts: React.ReactNode[] = [];
      let cursor = 0;
      for (const range of ranges) {
        const from = Math.max(0, range.start - start);
        const to = Math.min(node.length, range.end - start);
        if (to <= from) continue;
        if (from > cursor) parts.push(node.slice(cursor, from));
        parts.push(<span className="diff-inline-change" key={from}>{decorateWhitespace(node.slice(from, to))}</span>);
        cursor = to;
      }
      if (cursor < node.length) parts.push(node.slice(cursor));
      return parts;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      return React.cloneElement(node, undefined, decorate(node.props.children));
    }
    return node;
  });
  return decorate(content);
}
