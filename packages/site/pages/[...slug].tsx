import fs from "fs/promises";
import Head from "next/head";
import path from "path";
import * as React from "react";
import markdown from "../lib/markdown";

const docsDir = path.join(__dirname, "../../../../../docs");

export default function Page({ html, title }) {
  return (
    <article className="prose">
      <Head>
        <title>{title} — QueueRun</title>
      </Head>
      <h1 className="pb-2 border-b-2 border-gray-100 mb-8">{title}</h1>
      <section dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

export async function getStaticPaths() {
  const filenames = await fs.readdir(docsDir);
  const paths = filenames
    .map((filename) => filename.replace(/\.md$/, ""))
    .filter((path) => path !== "index")
    .map((path) => `/${path}`);
  return { paths: paths, fallback: true };
}

export async function getStaticProps({ params }) {
  const slug = params.slug.join("/");
  const { html, title } = await markdown(slug);
  return { props: { html, title } };
}
