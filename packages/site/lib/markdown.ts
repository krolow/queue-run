import fs from "fs/promises";
import path from "path";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import rehypeToc, { HtmlElementNode } from "rehype-toc";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const docsDir = path.join(__dirname, "../../../../../docs");

export default async function markdown(slug: string) {
  const filename = path.join(docsDir, slug + ".md");
  const markdown = await fs.readFile(filename, "utf-8");
  const output = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .use(rehypeSlug)
    .use(rehypeToc, { headings: ["h2"], customizeTOC })
    .process(markdown);

  const { message } = output;
  if (message.length) console.warn(message);

  let html = output.toString();
  let title;
  html = html.replace(/<h1(\s.*)?>(.*)<\/h1>/m, (a, b, match) => {
    title = match;
    return "";
  });
  return { html, title };
}

function customizeTOC(toc: HtmlElementNode) {
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
      ...toc.children,
    ],
  };
}
