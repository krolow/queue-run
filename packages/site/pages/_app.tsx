import { AppProps } from "next/app";
import Head from "next/head";
import "../styles.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link
          href="https://fonts.googleapis.com/css?family=Inter"
          rel="stylesheet"
          type="text/css"
        />
        <link
          href="https://fonts.googleapis.com/css?family=Fira+Code"
          rel="stylesheet"
          type="text/css"
        />
        <title>🐇 QueueRun</title>
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
