export default async function () {
  return "Welcome";
}

export const config = {
  type: "text",
};

export { authenticate } from "#api/bookmarks/_middleware.js";
