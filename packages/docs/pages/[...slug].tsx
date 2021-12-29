import Head from "next/head";
import * as React from "react";
import { renderToString } from "react-dom/server";

export default function Page({ html, title }) {
  return (
    <article className="prose">
      <Head>
        <title>{title}</title>
      </Head>
      <h1 className="border-b-gray-100 border-b-2 pb-4">{title}</h1>
      <section dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps({ params }) {
  const slug = params.slug.join("/");
  const { default: mdx, title } = await import(`../content/${slug}.mdx`);
  const html = renderToString(mdx());
  return { props: { html, title } };
}
