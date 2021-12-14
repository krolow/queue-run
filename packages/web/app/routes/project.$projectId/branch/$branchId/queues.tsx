import { Empty, List, Spin, Typography } from "antd";
import React, { useEffect } from "react";
import {
  LoaderFunction,
  MetaFunction,
  useFetcher,
  useLoaderData,
  useMatches,
} from "remix";
import invariant from "tiny-invariant";
import { sqs } from "../../../../aws";

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
  const queues = useLoaderData();

  return (
    <main className="space-y-4 my-4">
      <Queues {...{ branchId, projectId, queues }} />
    </main>
  );
}

export function Queues({
  branchId,
  projectId,
  queues: fromLoader,
}: {
  branchId: string;
  projectId: string;
  queues?: Queue[];
}) {
  const fetcher = useFetcher<Queue[]>();
  const queues = fromLoader ?? fetcher.data;
  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    fetcher.load(`/project/${projectId}/branch/${branchId}/queues`);
  }, []);

  if (!queues)
    return (
      <div className="text-center">
        <Spin size="large" />
      </div>
    );

  if (queues.length === 0)
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No queues">
        <Typography.Link>Learn about queues</Typography.Link>
      </Empty>
    );

  return (
    <List
      dataSource={queues}
      header={
        <h2 className="text-lg">
          Queues on branch <b>{branchId}</b>
        </h2>
      }
      loading={isLoading}
      renderItem={({ url, name }) => (
        <List.Item className="text-base">{name}</List.Item>
      )}
    />
  );
}
