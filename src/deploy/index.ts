import { fullBuild } from "../build";
import { buildDir } from "./constants";
import publishLambda from "./publishLambda";
import { getLambdaName } from "./util";

(async () => {
  const projectId = "goose-dump";
  const lambdaName = getLambdaName(projectId);

  await fullBuild();
  await publishLambda({ dirname: buildDir, lambdaName });
})();
