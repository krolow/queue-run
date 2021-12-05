import glob from "fast-glob";
import path from "path";
import getRuntimeVersion from "../upload/util/getRuntime";
import loadFunction from "./loadFunction";

// Load a group of functions from the same directory (eg all queue handlers)
export default async function loadGroup({
  dirname,
  envVars,
  group,
  watch,
}: {
  dirname: string;
  envVars: Record<string, string>;
  group: string;
  watch: boolean;
}): Promise<Map<string, ReturnType<typeof loadFunction>>> {
  const filenames = glob.sync("[!_]*.{js,ts}", {
    cwd: path.resolve(dirname, "background", group),
    followSymbolicLinks: true,
    onlyFiles: true,
  });
  const { jscTarget } = await getRuntimeVersion(dirname);

  return filenames.reduce(
    (map, filename) =>
      map.set(
        path.basename(filename, path.extname(filename)),
        loadFunction({ envVars, filename, jscTarget, watch })
      ),
    new Map()
  );
}
