import fs from "fs";
import path from "path";
import loadFunction from "./loadFunction";

// Load a group of functions from the same directory.
export default function loadGroup(
  dirname: string,
  watch?: boolean
): Map<string, ReturnType<typeof loadFunction>> {
  const filenames = listFilenames(dirname);
  return filenames.reduce(
    (map, filename) =>
      map.set(
        path.basename(filename, path.extname(filename)),
        loadFunction(filename, watch)
      ),
    new Map()
  );
}

function listFilenames(dirname: string): string[] {
  if (!fs.existsSync(dirname)) return [];

  const filenames = fs.readdirSync(dirname);
  const onlyScripts = filenames.filter((filename) =>
    /^[^_.].*\.(js|ts)$/.test(filename)
  );

  const invalid = onlyScripts.filter(
    (filename) => !/^[a-zA-Z0-9_-]+.(js|ts)$/.test(path.basename(filename))
  );
  if (invalid.length > 0) {
    const filenames = invalid.map((filename) => `'${filename}''`).join(", ");
    throw new Error(
      `Filename can only contain alphanumeric, hyphen, or underscore: ${filenames}`
    );
  }
  return onlyScripts.map((filename) => path.join(dirname, filename));
}
