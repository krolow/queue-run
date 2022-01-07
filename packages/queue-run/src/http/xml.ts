import xmlbuilder, { CreateOptions, XMLToStringOptions } from "xmlbuilder";
import { Response } from "./fetch.js";

export default function xml(
  xml: string | { [key: string]: any },
  options: CreateOptions & XMLToStringOptions & { mimeType?: string } = {
    mimeType: "application/xml",
    encoding: "utf-8",
    headless: false,
    pretty: false,
    version: "1.0",
  }
) {
  const body = xmlbuilder
    .create(xml, { ...options, separateArrayItems: true })
    .end(options);
  const contentType = `${options.mimeType ?? "application/xml"}; charset=${
    options.encoding ?? "utf-8"
  }`;
  return new Response(body, {
    headers: { "Content-Type": contentType },
    status: 200,
  });
}
