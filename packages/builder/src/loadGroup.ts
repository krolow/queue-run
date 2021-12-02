import glob from "fast-glob";
import path from "path";
import loadFunction from "./loadFunction";

// Load a group of functions from the same directory.
export default function loadGroup({
  dirname,
  envVars,
  group,
  watch,
}: {
  dirname: string;
  envVars: Record<string, string>;
  group: string;
  watch: boolean;
}): Map<string, ReturnType<typeof loadFunction>> {
  const filenames = listFilenames(path.resolve(dirname, "background", group));
  return filenames.reduce(
    (map, filename) =>
      map.set(
        path.basename(filename, path.extname(filename)),
        loadFunction({ envVars, filename, watch })
      ),
    new Map()
  );
}

function isValidFunctionName(filename: string) {
  const basename = path.basename(filename, path.extname(filename));
  return /^[a-zA-Z0-9_-]+$/.test(basename);
}

function listFilenames(dirname: string): string[] {
  const filenames = glob.sync("[!_]*.{js,ts}", {
    cwd: dirname,
    followSymbolicLinks: true,
    onlyFiles: true,
  });
  const invalid = filenames.filter(
    (filename) => !isValidFunctionName(filename)
  );
  if (invalid.length > 0) {
    const filenames = invalid.map((filename) => `'${filename}''`).join(", ");
    throw new Error(
      `Filename can only contain alphanumeric, hyphen, or underscore: ${filenames}`
    );
  }
  return filenames.map((filename) => path.resolve(dirname, filename));
}
