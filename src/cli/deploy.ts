import { Lambda } from "@aws-sdk/client-lambda";
import filesize from "filesize";
import fs from "fs";
import glob from "glob";
import JSZip from "jszip";

const lambda = new Lambda({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function deploy() {
  try {
    const zip = new JSZip();
    addFolder(zip, "dist");
    addFolder(zip, "node_modules");
    const buffer = await zip.generateAsync({ type: "uint8array" });
    console.debug("Generated ZIP file %s", filesize(buffer.length));

    const response = await lambda.updateFunctionCode({
      FunctionName: "my-function",
      Publish: true,
      ZipFile: buffer,
    });

    /*
    const response = await lambda.createFunction({
      Code: { ZipFile: buffer },
      FunctionName: "my-function",
      Handler: "dist/lambda/index.handler",
      PackageType: "Zip",
      Role: "arn:aws:iam::122210178198:role/service-role/role-test",
      Runtime: "nodejs14.x",
      TracingConfig: { Mode: "Active" },
    });
    */
    console.log(response);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

function addFolder(zip: JSZip, folder: string) {
  console.debug("Adding folder %s to zip", folder);
  const filenames = glob.sync(`${folder}/**/*`);
  for (const filename of filenames) {
    if (fs.lstatSync(filename).isDirectory()) continue;
    const buffer = fs.readFileSync(filename);
    zip.file(filename, buffer, { compression: "DEFLATE" });
  }
}

deploy();
