import type { TranscodeEncoding } from "buffer";
import Blob from "fetch-blob";
import * as multipart from "parse-multipart-data";
import { URLSearchParams } from "url";
import { Request, Response } from "./fetch";
export { Blob, File };

export default async function form<
  T extends {
    [key: string]: string | File | (string | File)[];
  }
>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type");
  const { mime, encoding } = parseContentType(contentType);
  const input = await request.buffer();

  if (mime === "multipart/form-data") {
    const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
    if (!boundary) throw new Error("multipart/form-data: missing boundary");

    const fields = multipart.parse(input, boundary);
    return combine(fields) as T;
  } else if (mime === "application/x-www-form-urlencoded") {
    const fields = new URLSearchParams(input.toString(encoding ?? "utf8"));
    return combine(
      Array.from(fields.keys())
        .map((name) => fields.getAll(name).map((data) => ({ name, data })))
        .flat()
    ) as T;
  } else throw new Response("Unsupported Media Type", { status: 415 });
}

class File extends Blob {
  public name: string;
  public lastModified = 0;

  constructor(
    blobParts: (ArrayBufferLike | ArrayBufferView | Blob | Buffer | string)[],
    options: { type?: string; name: string; lastModified?: number }
  ) {
    super(blobParts, options);
    this.name = String(options.name);
    const lastModified =
      options.lastModified === undefined
        ? Date.now()
        : Number(options.lastModified);
    if (!Number.isNaN(lastModified)) this.lastModified = lastModified;
  }

  get [Symbol.toStringTag]() {
    return "File";
  }
}

function combine(
  fields: Array<{
    contentType?: string;
    data: Buffer | string;
    filename?: string;
    name?: string;
  }>
): { [key: string]: string | File | (string | File)[] } {
  return fields.reduce((all, field, index) => {
    const name = field.name ?? index.toString();
    const value = formField(field);
    if (name in all) {
      const existing = all[name];
      if (Array.isArray(existing)) existing.push(value);
      else all[name] = [existing, value] as (string | File)[];
    } else all[name] = value;
    return all;
  }, {} as { [key: string]: string | File | (string | File)[] });
}

function parseContentType(contentType?: string | null): {
  mime: string | undefined;
  encoding: TranscodeEncoding | undefined;
} {
  const mime = contentType?.split(";")[0];
  const encoding = contentType?.match(/;\s*charset=([^;]+)/)?.[1] as
    | TranscodeEncoding
    | undefined;
  return { mime, encoding };
}

function formField({
  contentType,
  data,
  filename,
}: {
  contentType?: string;
  data: Buffer | string;
  filename?: string;
}): string | File {
  if (Buffer.isBuffer(data) && filename) {
    return new File([data], {
      type: contentType ?? "application/octet-stream",
      name: filename,
    });
  } else {
    const { encoding } = parseContentType(contentType);
    return data.toString(encoding ?? "utf8");
  }
}
