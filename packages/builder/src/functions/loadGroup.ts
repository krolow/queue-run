import glob from "fast-glob";
import path from "path";
import getRuntimeVersion from "../util/getRuntime";
import loadFunction from "./loadFunction";

// Load a group of functions from the same directory (eg all queue handlers)
export default async function loadGroup({
  dirname,
  group,
  watch,
}: {
  dirname: string;
  group: string;
  watch: boolean;
}): Promise<Map<string, ReturnType<typeof loadFunction>>> {
  const filenames = glob.sync("[!_]*.{js,ts}", {
    cwd: path.resolve(dirname, "background", group),
    followSymbolicLinks: true,
    onlyFiles: true,
    absolute: true,
  });
  const { jscTarget } = await getRuntimeVersion(dirname);

  return filenames.reduce(
    (map, filename) =>
      map.set(
        path.basename(filename, path.extname(filename)),
        loadFunction({ filename, jscTarget, watch })
      ),
    new Map()
  );
}
