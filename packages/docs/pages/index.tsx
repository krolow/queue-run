import Head from "next/head";
import * as React from "react";
import { renderToString } from "react-dom/server";
import index from "../content/index.mdx";

export default function Page({ html }) {
  return (
    <article>
      <Head>
        <title>QueueRun</title>
      </Head>
      <nav className="my-10">
        <section dangerouslySetInnerHTML={{ __html: html }} />
      </nav>
    </article>
  );
}

export async function getStaticProps() {
  const html = renderToString(index());
  return { props: { html } };
}
