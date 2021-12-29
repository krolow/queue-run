import { AppProps } from "next/app";
import Head from "next/head";
import "../styles.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/github-dark.min.css"
        />
      </Head>
      <div className="content max-w-3xl mx-auto my-10">
        <nav className="flex flex-row gap-8 items-center mb-10">
          <a href="/" className="font-bold text-xl">
            🐇 QueueRun
          </a>
          <a href="https://github.com/assaf/queue-run"> GitHub</a>
        </nav>
        <Component {...pageProps} />
      </div>
    </>
  );
}
