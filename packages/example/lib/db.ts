import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

export type Bookmark = {
  created: string;
  id: string;
  screenshot?: string;
  title: string;
  updated: string;
  url: string;
};

const filename = path.join(os.tmpdir(), "bookmarks.json");

export async function findAll(): Promise<{ [id: string]: Bookmark }> {
  try {
    return JSON.parse(await fs.readFile(filename, "utf-8"));
  } catch (e) {
    return {};
  }
}

export async function create({
  title,
  url,
}: {
  title: string;
  url: string;
}): Promise<Bookmark> {
  const id = crypto.randomBytes(4).toString("hex");
  const created = new Date().toISOString();
  const bookmarks = await findAll();
  const bookmark = { title, url, id, created, updated: created };
  bookmarks[id] = bookmark;
  await save(bookmarks);
  return bookmark;
}

export async function findOne(id: string): Promise<Bookmark | null> {
  const db = await findAll();
  return db[id];
}

export async function deleteOne(id: string): Promise<void> {
  const bookmarks = await findAll();
  delete bookmarks[id];
  await save(bookmarks);
}

export async function updateOne({
  id,
  screenshot,
  title,
  url,
}: {
  id: string;
  screenshot?: string;
  title?: string;
  url?: string;
}): Promise<Bookmark | null> {
  const bookmarks = await findAll();
  const bookmark = bookmarks[id];
  if (!bookmark) return null;
  bookmarks[id] = {
    ...bookmark,
    id,
    screenshot,
    ...(title && { title }),
    ...(url && { url }),
    updated: new Date().toISOString(),
  };
  await save(bookmarks);
  return bookmarks[id];
}

export async function save(bookmarks: { [id: string]: Bookmark }) {
  await fs.writeFile(filename, JSON.stringify(bookmarks));
}

export async function authenticate(
  token: string
): Promise<{ id: string; name: string } | null> {
  return token === "secret" ? { id: "1", name: "Alice" } : null;
}
