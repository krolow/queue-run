import Head from "next/head";
import * as React from "react";
import markdown from "../lib/markdown";

export default function Page({ html }) {
  return (
    <article className="prose">
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
  const { html } = await markdown("index");
  return { props: { html } };
}
