import type { TranscodeEncoding } from "buffer";
import multipart from "parse-multipart-data";
import { URLSearchParams } from "url";
import { Request, Response } from "./fetch";

export default async function form(request: Request): Promise<{
  [key: string]: FormField;
}> {
  const contentType = request.headers.get("content-type");
  const { mime, encoding } = parseContentType(contentType);
  const input = await request.buffer();

  if (mime === "multipart/form-data") {
    const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
    if (!boundary) throw new Error("multipart/form-data: missing boundary");

    const fields = multipart.parse(input, boundary);
    return Object.fromEntries(
      fields.map(({ name, ...field }) => [name, formField(field)])
    );
  } else if (mime === "application/x-www-form-urlencoded") {
    const fields = new URLSearchParams(input.toString(encoding ?? "utf8"));
    return Object.fromEntries(Array.from(fields.entries()));
  } else throw new Response("Unsupported Media Type", { status: 415 });
}

export type FormField =
  | string
  | (Buffer & { filename?: string; contentType?: string });

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
  data,
  filename,
  contentType,
}: {
  data: Buffer | string;
  filename?: string;
  contentType?: string;
}): FormField {
  if (filename && Buffer.isBuffer(data)) {
    const field: FormField = data;
    field.filename = filename;
    field.contentType = contentType;
    return field;
  } else {
    const { encoding } = parseContentType(contentType);
    return data.toString(encoding ?? "utf8");
  }
}
