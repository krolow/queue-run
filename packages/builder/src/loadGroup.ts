import glob from "glob";
import path from "path";
import loadFunction from "./loadFunction";

// Load a group of functions from the same directory.
export default function loadGroup({
  dirname,
  group,
  watch,
}: {
  dirname: string;
  group: string;
  watch?: boolean;
}): Map<string, ReturnType<typeof loadFunction>> {
  const filenames = listFilenames(path.resolve(dirname, "background", group));
  return filenames.reduce(
    (map, filename) =>
      map.set(
        path.basename(filename, path.extname(filename)),
        loadFunction(filename, watch)
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
    follow: true,
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
