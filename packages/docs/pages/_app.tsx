import { AppProps } from "next/app";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          {`
            .content a {
              color: #0070f3;
            }
            .content h1 { 
              margin: 2rem 0;
              font-size: 1.5rem;
              font-weight: 600;
              padding-bottom: 0.5rem;
              border-bottom: 1px solid #eaecef;
            }
            .content h2 { 
              margin: 1.5rem 0;
              font-size: 1.25rem;
              font-weight: 600;
            }
            .content p { margin: 0.5rem; }
            .content ol {
              list-style: decimal;
              margin-left: 2rem;
            }
            .content ul {
              list-style: disc;
              margin-left: 2rem;
            }
            .content li {
              margin: 1rem 0;
            }
            .content pre {
              margin: 1.5rem 0;
              padding: 1rem;
              background: #f0f0f0;
              border-radius: 5px;
            }
          `}
        </style>
      </Head>
      <div className="content max-w-3xl mx-auto my-10">
        <nav className="flex flex-row gap-8 items-center">
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
