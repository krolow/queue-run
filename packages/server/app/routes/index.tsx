import { DynamoDB } from "@aws-sdk/client-dynamodb";
import type { LoaderFunction } from "remix";
import { json, Link, useLoaderData } from "remix";

type Project = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

// Loaders provide data to components and are only ever called on the server, so
// you can connect to a database or run any server side code you want right next
// to the component that renders it.
// https://remix.run/api/conventions#loader
export const loader: LoaderFunction = async () => {
  const [accessKeyId, secretAccessKey] = process.env.AWS_MAIN!.split(":");
  const dynamoDb = new DynamoDB({
    credentials: { accessKeyId, secretAccessKey },
    region: process.env.AWS_REGION,
  });

  const projects = (
    await dynamoDb.scan({
      TableName: "projects",
      IndexName: "by_account",
      FilterExpression: "#account_id = :account_id",
      ExpressionAttributeValues: { ":account_id": { S: "122210178198" } },
      ExpressionAttributeNames: { "#account_id": "account_id" },
    })
  ).Items?.map(
    (Item) =>
      ({
        id: Item.id.S,
        createdAt: new Date(+Item.created_at.N!),
        updatedAt: new Date(+Item.updated_at.N!),
      } as Project)
  );

  return json(projects);
};

// https://remix.run/guides/routing#index-routes
export default function Index() {
  const projects = useLoaderData<Project[]>();

  return (
    <div className="remix__page">
      <main>
        <ul>
          {projects.map((project) => (
            <li key={project.id} className="remix__page__resource">
              <Link to={project.id} prefetch="intent">
                {project.id}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
