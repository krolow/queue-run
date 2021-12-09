import { DeleteOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, List, Popconfirm, Spin, Typography } from "antd";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import React from "react";
import {
  ActionFunction,
  Form,
  json,
  LoaderFunction,
  MetaFunction,
  useActionData,
  useFetcher,
  useFetchers,
  useLoaderData,
  useMatches,
  useTransition,
} from "remix";
import invariant from "tiny-invariant";
import { dynamoDB } from "../../../aws";
import createBearerToken from "../../../createBearerToken";

type ClientToken = {
  createdAt: string;
  id: string;
  name: string;
  lastAccessedAt?: string;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { projectId } = params;
  invariant(projectId);

  const { Items: items } = await dynamoDB.executeStatement({
    Statement:
      'SELECT * FROM "client_tokens"."project_id-created_at-index" WHERE project_id = ? ORDER BY created_at DESC',
    Parameters: [{ S: projectId }],
  });
  if (!items) return [];

  return items.map(
    (item) =>
      ({
        createdAt: new Date(+item.created_at.N!).toISOString(),
        id: item.id.S,
        name: item.name?.S ?? new Date(+item.created_at.N!).toISOString(),
        lastAccessedAt:
          item.last_accessed_at?.N &&
          new Date(+item.last_accessed_at.N).toISOString(),
      } as ClientToken)
  );
};

export const meta: MetaFunction = ({ params }) => {
  return {
    title: `${params.projectId} | access tokens`,
  };
};

export const action: ActionFunction = async ({ params, request }) => {
  if (request.method !== "POST") return json("", 405);

  const { projectId } = params;
  invariant(projectId);

  const { tokenId, bearerToken } = createBearerToken();

  await dynamoDB.executeStatement({
    Statement:
      "INSERT INTO client_tokens VALUE { 'id': ?, 'project_id': ?, 'created_at': ? }",
    Parameters: [
      { S: tokenId },
      { S: projectId },
      { N: Date.now().toString() },
    ],
  });
  return { tokenId, bearerToken };
};

export default function Index() {
  const { projectId } = useMatches()[1].params;
  invariant(projectId);

  const clientTokens = useLoaderData<ClientToken[]>();

  return (
    <main className="space-y-4 my-4">
      {clientTokens.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tokens">
          <CreateNewTokenButton />
        </Empty>
      ) : (
        <>
          <div className="flex flex-row-reverse">
            <CreateNewTokenButton />
          </div>
          <ClientTokens clientTokens={clientTokens} projectId={projectId} />
        </>
      )}
      <BearerTokenInstructions />
    </main>
  );
}

function ClientTokens({
  clientTokens,
  projectId,
}: {
  clientTokens: ClientToken[];
  projectId: string;
}) {
  const fetchers = useFetchers();
  const isLoading = fetchers.some((fetcher) => fetcher.state !== "idle");

  return (
    <List
      dataSource={clientTokens}
      renderItem={({ id, name, lastAccessedAt }) => (
        <List.Item
          actions={[
            lastAccessedAt ? (
              <span>
                Last used {formatDistanceToNowStrict(parseISO(lastAccessedAt))}{" "}
                ago
              </span>
            ) : null,
            <DeleteTokenButton {...{ tokenId: id, name, projectId }} />,
          ]}
        >
          <EditableTokenName
            {...{ tokenId: id, projectId, name, lastAccessedAt }}
          />
        </List.Item>
      )}
      loading={isLoading}
    />
  );
}

function EditableTokenName({
  name,
  projectId,
  tokenId,
}: {
  name: string;
  projectId: string;
  tokenId: string;
}) {
  const fetcher = useFetcher();
  const isRenaming = fetcher.submission?.method === "PUT";

  return (
    <Typography.Text
      className="text-base"
      editable={
        isRenaming
          ? undefined
          : {
              onChange: (name) => {
                fetcher.submit(
                  { name },
                  {
                    method: "put",
                    action: `/project/${projectId}/tokens/${tokenId}`,
                  }
                );
              },
              tooltip: "Give this token a name",
            }
      }
    >
      {isRenaming ? (
        <>
          <Spin size="small" /> Saving …
        </>
      ) : (
        name
      )}
    </Typography.Text>
  );
}

function DeleteTokenButton({
  name,
  projectId,
  tokenId,
}: {
  name: string;
  projectId: string;
  tokenId: string;
}) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.submission?.method === "DELETE";
  return (
    <Popconfirm
      title={`Delete the token ${name}?`}
      onConfirm={() =>
        fetcher.submit(null, {
          method: "delete",
          action: `/project/${projectId}/tokens/${tokenId}`,
        })
      }
      okText="Delete"
      cancelText="Keep"
    >
      <Button
        type="link"
        danger
        icon={<DeleteOutlined />}
        loading={isDeleting}
      />
    </Popconfirm>
  );
}

function CreateNewTokenButton() {
  const transition = useTransition();
  return (
    <Form method="post">
      <Button
        htmlType="submit"
        loading={!!transition.submission}
        type={"primary"}
      >
        {transition.submission
          ? "Creating access token …"
          : "Create New Access Token"}
      </Button>
    </Form>
  );
}

function BearerTokenInstructions() {
  const clientTokens = useLoaderData<ClientToken[]>();
  const actionData = useActionData<{ bearerToken: string; tokenId: string }>();
  const show =
    actionData && clientTokens.some(({ id }) => id === actionData.tokenId);

  if (show) {
    return (
      <Alert
        message="New access token created"
        description={
          <Typography.Paragraph>
            <p>
              This is your new access token. Save it now. You will not have
              access to this token after you reload the page.
            </p>
            <pre>
              <Typography.Text copyable>
                {actionData.bearerToken}
              </Typography.Text>
            </pre>
          </Typography.Paragraph>
        }
        type="success"
        showIcon
      />
    );
  } else return <Instructions />;
}

function Instructions() {
  return (
    <Alert
      description={
        <Typography.Paragraph>
          <p>
            Client applications need to use either client access tokens or user
            tokens (see here). Use this page to manage client access tokens.
          </p>
          <p>
            If you have more than one client application, consider creating a
            client token for each application. Give the token a name so you can
            tell which client is using it.
          </p>
        </Typography.Paragraph>
      }
      type="info"
    ></Alert>
  );
}
