import ow from "ow";
import deploy from "./deploy";
export { default as deploy } from "./deploy";

const projectId = process.argv[2];

ow(
  projectId,
  ow.string.nonEmpty
    .matches(/^[a-z]{4,}-[a-z]{4,}$/)
    .message("Missing project ID")
);

deploy({ projectId });
