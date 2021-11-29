import { fullBuild } from "../build";
import activateLambda from "./activateLambda";
import { buildDir } from "./constants";

(async (branch: string) => {
  const projectId = "goose-dump";
  const alias = `${projectId}-${branch}`;

  await fullBuild();
  await activateLambda({ dirname: buildDir, alias, lambdaName: projectId });
})("prod");
