import React from "react";
import { LoaderFunction, MetaFunction, useMatches } from "remix";
import invariant from "tiny-invariant";
import { sqs } from "../../../../aws";
import { Queues } from "./queues";

type Queue = {
  url: string;
  name: string;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { branchId, projectId } = params;
  invariant(branchId && projectId);

  const { QueueUrls: queueURLs } = await sqs.listQueues({
    QueueNamePrefix: `${projectId}-${branchId}__`,
  });
  if (!queueURLs) return [];

  return queueURLs.map(
    (queueURL) =>
      ({
        url: queueURL,
        name: queueURL.split("/").pop()?.replace(/.*?__/, ""),
      } as Queue)
  );
};

export const meta: MetaFunction = ({ params }) => {
  return {
    title: `${params.projectId} | queues`,
  };
};

export default function Index() {
  const { branchId, projectId } = useMatches()[1].params;
  invariant(branchId && projectId);

  return (
    <main className="space-y-4 my-4">
      <Queues {...{ branchId, projectId }} />
    </main>
  );
}
