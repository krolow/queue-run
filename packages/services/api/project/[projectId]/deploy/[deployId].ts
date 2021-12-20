export default async function (_, { params }) {
  console.log(
    "Deploy page for project %s, deploy",
    params.projectId,
    params.deployId
  );
  return { params };
}
