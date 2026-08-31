import type { CSSProperties, ReactNode } from "react";
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  type MarkdownInline,
} from "@/lib/resume/markdown";
import { isWebHref } from "./link-utils";

function InlineNodes({
  nodes,
  linkColor,
  keyPrefix,
}: {
  nodes: MarkdownInline[];
  linkColor: string;
  keyPrefix: string;
}) {
  const render = (node: MarkdownInline, index: number): ReactNode => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.text;
    const children = (
      <InlineNodes
        nodes={node.children}
        linkColor={linkColor}
        keyPrefix={key}
      />
    );
    if (node.type === "strong") return <strong key={key}>{children}</strong>;
    if (node.type === "emphasis") return <em key={key}>{children}</em>;
    if (!node.href) return <span key={key}>{children}</span>;
    return (
      <a
        key={key}
        href={node.href}
        target={isWebHref(node.href) ? "_blank" : undefined}
        rel={isWebHref(node.href) ? "noreferrer" : undefined}
        style={{ color: linkColor, textDecoration: "underline" }}
      >
        {children}
      </a>
    );
  };
  return <>{nodes.map(render)}</>;
}

/** Renders safe inline Markdown plus existing automatic link detection. */
export function RichText({
  text,
  linkColor = "inherit",
}: {
  text: string;
  linkColor?: string;
}) {
  return (
    <InlineNodes
      nodes={parseInlineMarkdown(text)}
      linkColor={linkColor}
      keyPrefix="inline"
    />
  );
}

export interface MarkdownBlocksProps {
  text: string;
  linkColor?: string;
  paragraphGap: number;
  listIndent: number;
  listItemGap: number;
  headingGap: number;
  headingFontSize: number;
  subheadingFontSize: number;
  headingFontFamily?: string;
  headingColor?: string;
  style?: CSSProperties;
}

/**
 * Renders the bounded block Markdown AST with semantic elements. No HTML input
 * is parsed and unsafe explicit links are emitted as ordinary escaped text.
 */
export function MarkdownBlocks({
  text,
  linkColor = "inherit",
  paragraphGap,
  listIndent,
  listItemGap,
  headingGap,
  headingFontSize,
  subheadingFontSize,
  headingFontFamily,
  headingColor,
  style,
}: MarkdownBlocksProps) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div style={style}>
      {blocks.map((block, blockIndex) => {
        const marginTop = blockIndex === 0 ? 0 : paragraphGap;
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h3" : "h4";
          return (
            <Tag
              key={blockIndex}
              style={{
                margin: 0,
                paddingTop: marginTop,
                paddingBottom: headingGap,
                color: headingColor,
                fontFamily: headingFontFamily,
                fontSize:
                  block.level === 1 ? headingFontSize : subheadingFontSize,
                fontWeight: 700,
                lineHeight: "inherit",
              }}
            >
              <InlineNodes
                nodes={block.children}
                linkColor={linkColor}
                keyPrefix={`heading-${blockIndex}`}
              />
            </Tag>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={blockIndex}
              style={{
                margin: 0,
                paddingTop: marginTop,
                paddingLeft: listIndent,
                listStylePosition: "outside",
              }}
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  style={{ marginTop: itemIndex === 0 ? 0 : listItemGap }}
                >
                  <InlineNodes
                    nodes={item}
                    linkColor={linkColor}
                    keyPrefix={`list-${blockIndex}-${itemIndex}`}
                  />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={blockIndex} style={{ margin: 0, paddingTop: marginTop }}>
            <InlineNodes
              nodes={block.children}
              linkColor={linkColor}
              keyPrefix={`paragraph-${blockIndex}`}
            />
          </p>
        );
      })}
    </div>
  );
}
