import crypto from "crypto";
import fs from "fs/promises";

export type Bookmark = {
  id: string;
  title: string;
  url: string;
  created: string;
  updated: string;
};

export async function load(): Promise<{ [id: string]: Bookmark }> {
  try {
    return JSON.parse(await fs.readFile("./db.json", "utf-8"));
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
  const bookmarks = await load();
  const bookmark = { title, url, id, created, updated: created };
  bookmarks[id] = bookmark;
  await save(bookmarks);
  return bookmark;
}

export async function find(id: string): Promise<Bookmark | null> {
  const db = await load();
  return db[id];
}

export async function del(id: string): Promise<void> {
  const bookmarks = await load();
  delete bookmarks[id];
  await save(bookmarks);
}

export async function update({
  id,
  title,
  url,
}: {
  id: string;
  title: string;
  url: string;
}): Promise<Bookmark | null> {
  const bookmarks = await load();
  const bookmark = bookmarks[id];
  if (!bookmark) return null;
  bookmarks[id] = {
    title,
    url,
    id,
    created: bookmark.created,
    updated: new Date().toISOString(),
  };
  await save(bookmarks);
  return bookmarks[id];
}

export async function save(bookmarks: { [id: string]: Bookmark }) {
  await fs.writeFile("./db.json", JSON.stringify(bookmarks));
}

export async function authenticate(
  token
): Promise<{ id: string; name: string } | null> {
  return token === "secret" ? { id: "1", name: "Alice" } : null;
}
