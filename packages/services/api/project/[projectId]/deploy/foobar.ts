export default async function (_, { params }) {
  console.log("Deploys foobar page for project %s", params.projectId);
  return { params };
}
