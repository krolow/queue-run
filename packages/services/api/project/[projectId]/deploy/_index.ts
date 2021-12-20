export default async function (request, { params }) {
  console.log("Deploys index page for project %s", params.projectId);
  return { params };
}
