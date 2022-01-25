import type { TranscodeEncoding } from "node:buffer";
import { URLSearchParams } from "node:url";
import invariant from "tiny-invariant";
import { File } from "./fetch.js";

/**
 * Handle HTML forms: multipart/form-data and application/x-www-form-urlencoded,
 *
 * Form data is name/value pairs. If a name appears multiple times in the form,
 * the value is an array.
 *
 * Regular forms only support strings. Multipart forms can contain files as well.
 *
 * @param request The HTTP request
 * @returns Form data
 */
export default async function form<
  T extends {
    [key: string]: string | File | (string | File)[];
  }
>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type");
  const { mime, encoding } = parseContentType(contentType);
  const input = Buffer.from(await request.arrayBuffer());

  if (mime === "multipart/form-data") {
    const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
    if (!boundary) throw new Error("multipart/form-data: missing boundary");

    const fields = parseMultipart(input, boundary);
    return combine(fields) as T;
  } else if (mime === "application/x-www-form-urlencoded") {
    const fields = new URLSearchParams(input.toString(encoding ?? "utf-8"));
    return combine(
      Array.from(fields.keys())
        .map((name) => fields.getAll(name).map((data) => ({ name, data })))
        .flat()
    ) as T;
  } else throw new Response("Unsupported Media Type", { status: 415 });
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
    return new File([data], filename, {
      type: contentType ?? "application/octet-stream",
    });
  } else {
    const { encoding } = parseContentType(contentType);
    return data.toString(encoding ?? "utf-8");
  }
}

/** Originally: https://raw.githubusercontent.com/nachomazzara/parse-multipart-data/master/src/multipart.ts */

type Part = {
  header: string;
  info: string;
  part: number[];
};

type Input = {
  filename?: string;
  name?: string;
  type: string;
  data: Buffer;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
function parseMultipart(
  multipartBodyBuffer: Buffer,
  boundary: string
): Input[] {
  let lastline = "";
  let header = "";
  let info = "";
  let state = 0;
  let buffer: number[] = [];
  const allParts: Input[] = [];

  for (let i = 0; i < multipartBodyBuffer.length; i++) {
    const oneByte: number = multipartBodyBuffer[i]!;
    const prevByte: number | null = i > 0 ? multipartBodyBuffer[i - 1]! : null;
    const newLineDetected: boolean =
      oneByte === 0x0a && prevByte === 0x0d ? true : false;
    const newLineChar: boolean =
      oneByte === 0x0a || oneByte === 0x0d ? true : false;

    if (!newLineChar) lastline += String.fromCharCode(oneByte);

    if (0 === state && newLineDetected) {
      if ("--" + boundary === lastline) {
        state = 1;
      }
      lastline = "";
    } else if (1 === state && newLineDetected) {
      header = lastline;
      state = 2;
      if (header.indexOf("filename") === -1) {
        state = 3;
      }
      lastline = "";
    } else if (2 === state && newLineDetected) {
      info = lastline;
      state = 3;
      lastline = "";
    } else if (3 === state && newLineDetected) {
      state = 4;
      buffer = [];
      lastline = "";
    } else if (4 === state) {
      if (lastline.length > boundary.length + 4) lastline = ""; // mem save
      if ("--" + boundary === lastline) {
        const j = buffer.length - lastline.length;
        const part = buffer.slice(0, j - 1);
        const p: Part = { header: header, info: info, part: part };

        allParts.push(processPart(p));
        buffer = [];
        lastline = "";
        state = 5;
        header = "";
        info = "";
      } else {
        buffer.push(oneByte);
      }
      if (newLineDetected) lastline = "";
    } else if (5 === state && newLineDetected) state = 1;
  }
  return allParts;
}

function processPart(part: Part): Input {
  // will transform this object:
  // { header: 'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"',
  // info: 'Content-Type: text/plain',
  // part: 'AAAABBBB' }
  // into this one:
  // { filename: 'A.txt', type: 'text/plain', data: <Buffer 41 41 41 41 42 42 42 42> }
  const obj = function (str: string) {
    const k = str.split("=");
    invariant(k[0] && k[1], "Invalid header");
    const a = k[0].trim();

    const b = JSON.parse(k[1].trim());
    const o = {};
    Object.defineProperty(o, a, {
      value: b,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return o;
  };
  const header = part.header.split(";");

  const filenameData = header[2];
  let input = {};
  if (filenameData) {
    input = obj(filenameData);
    const contentType = part.info.split(":")[1]?.trim();
    invariant(contentType, "Missing content type");
    Object.defineProperty(input, "type", {
      value: contentType,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  const value = header[1]?.split("=")[1];
  invariant(value, "Invalid header");
  Object.defineProperty(input, "name", {
    value: value.replace(/"/g, ""),
    writable: true,
    enumerable: true,
    configurable: true,
  });

  Object.defineProperty(input, "data", {
    value: Buffer.from(part.part),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return input as Input;
}
