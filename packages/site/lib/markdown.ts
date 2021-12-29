import rehypeShiki from "@leafac/rehype-shiki";
import fs from "fs/promises";
import path from "path";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import rehypeToc, { HtmlElementNode } from "rehype-toc";
import rehypeUrls from "rehype-urls";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import * as Shiki from "shiki";
import { getHighlighter, Theme } from "shiki";
import { unified } from "unified";

const docsDir = path.join(__dirname, "../../../../../docs");
const theme: Theme = "dark-plus";

export default async function markdown(slug: string) {
  const filename = path.join(docsDir, slug + ".md");
  const markdown = await fs.readFile(filename, "utf-8");
  const highlighter: Shiki.Highlighter = await getHighlighter({ theme });
  const output = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .use(rehypeSlug)
    .use(rehypeShiki, { highlighter, throwOnUnsupportedLanguage: true })
    .use(rehypeToc, { nav: false, headings: ["h2"], customizeTOC })
    .use(rehypeUrls, removeMDXExtension)
    .process(markdown);

  const { messages } = output;
  if (messages.length) console.warn(messages);

  let html = output.toString();
  let title;
  html = html.replace(/<h1(\s.*)?>(.*)<\/h1>/m, (a, b, match) => {
    title = match;
    return "";
  });
  return { html, title };
}

function customizeTOC(toc: HtmlElementNode) {
  if (toc.children.length === 0) return null;
  return {
    type: "element",
    tagName: "details",
    properties: { className: "toc" },
    children: [
      {
        type: "element",
        tagName: "summary",
        children: [
          {
            type: "text",
            value: "Table of Contents",
          },
        ],
      },
      toc,
    ],
  };
}

function removeMDXExtension(url: URL) {
  url.pathname = url.pathname?.replace(/\.md$/, "");
  return url;
}
