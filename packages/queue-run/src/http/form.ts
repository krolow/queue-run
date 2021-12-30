import type { TranscodeEncoding } from "buffer";
import multipart from "parse-multipart-data";
import { URLSearchParams } from "url";
import { Request, Response } from "./fetch";

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

export class Blob {
  private _buffer: Buffer;
  public size: number;
  public type: string;

  constructor(buffer: Buffer, type: string) {
    this._buffer = buffer;
    this.size = buffer.byteLength;
    this.type = type;
  }

  stream() {
    throw new Error("Not implemented");
  }

  buffer(): Buffer {
    return this._buffer;
  }

  arrayBuffer(): ArrayBuffer {
    return this._buffer;
  }

  text(): string {
    return this._buffer.toString();
  }

  slice(start?: number, end?: number, contentType?: string): Blob {
    return new Blob(this._buffer.slice(start, end), contentType ?? this.type);
  }
}

export class File extends Blob {
  public name: string;

  constructor(buffer: Buffer, type: string, name: string) {
    super(buffer, type);
    this.name = name;
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
  mime?: string;
  encoding?: TranscodeEncoding;
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
    return new File(data, contentType ?? "application/octet-stream", filename);
  } else {
    const { encoding } = parseContentType(contentType);
    return data.toString(encoding ?? "utf8");
  }
}
