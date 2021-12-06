import type { LinksFunction, MetaFunction } from "remix";
import {
  Link,
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
} from "remix";
import tailwindStyles from "./styles/tailwind.full.css";

// https://remix.run/api/app#links
export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: tailwindStyles }];
};

// https://remix.run/api/conventions#default-export
// https://remix.run/api/conventions#route-filenames
export default function App() {
  return (
    <Document>
      <Layout>
        <Outlet />
      </Layout>
    </Document>
  );
}

// https://remix.run/api/conventions#meta
export const meta: MetaFunction = () => {
  return {
    title: "queue.run",
    description:
      "👋 Background functions for JAMstack apps (queues, pub/sub, cron, etc)",
  };
};

// https://remix.run/docs/en/v1/api/conventions#errorboundary
export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);
  return (
    <Document title="Error!">
      <Layout>
        <div>
          <h1>There was an error</h1>
          <p>{error.message}</p>
          <hr />
          <p>
            Hey, developer, you should replace this with what you want your
            users to see.
          </p>
        </div>
      </Layout>
    </Document>
  );
}

// https://remix.run/docs/en/v1/api/conventions#catchboundary
export function CatchBoundary() {
  const caught = useCatch();

  let message;
  switch (caught.status) {
    case 403:
      message = (
        <p>
          Oops! Looks like you tried to visit a page that you do not have access
          to.
        </p>
      );
      break;
    case 404:
      message = (
        <p>Oops! Looks like you tried to visit a page that does not exist.</p>
      );
      break;

    default:
      throw new Error(caught.data || caught.statusText);
  }

  return (
    <Document title={`${caught.status} ${caught.statusText}`}>
      <Layout>
        <h1>
          {caught.status}: {caught.statusText}
        </h1>
        {message}
      </Layout>
    </Document>
  );
}

function Document({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {title ? <title>{title}</title> : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        {process.env.NODE_ENV === "development" && <LiveReload />}
      </body>
    </html>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container p-10 font-body max-w-4xl mx-auto">
      <header className="flex flex-row flex-nowrap justify-between">
        <Link to="/" className="font-bold text-2xl">
          <h1>Queue.run</h1>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-row gap-2">
          <a href="https://github.com/assaf/queue-run">GitHub</a>
        </nav>
      </header>
      <div className="my-10">{children}</div>
      <footer className="my-10"></footer>
    </div>
  );
}
