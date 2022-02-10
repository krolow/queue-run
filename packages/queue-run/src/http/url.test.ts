/* eslint-disable sonarjs/no-duplicate-string */
import url from "./url.js";

describe("no base URL", () => {
  beforeAll(() => {
    url.rootDir = "src/http";
  });

  it("should return absolute URL as is", () =>
    expect(url("https://example.com/no/base")).toEqual(
      "https://example.com/no/base"
    ));

  it("should return root path URL as is", () =>
    expect(url("/foo/bar")).toEqual("/foo/bar"));

  it("should return relative path URL as is", () =>
    expect(url("foo/bar")).toEqual("/foo/bar"));

  it("should return relative self URL", () =>
    expect(url.self()()).toEqual("/url.test"));

  afterAll(() => {
    url.rootDir = "";
  });
});

describe("with base URL", () => {
  beforeAll(() => {
    url.baseURL = "https://example.org/start/";
    url.rootDir = "src/http";
  });

  it("should return absolute URL as is", () =>
    expect(url("https://example.com/with/base")).toEqual(
      "https://example.com/with/base"
    ));

  it("should return absolute URL for root path", () =>
    expect(url("/foo/bar")).toEqual("https://example.org/foo/bar"));

  it("should return absolute URL for relative path", () =>
    expect(url("foo/bar")).toEqual("https://example.org/start/foo/bar"));

  it("should return absolute self URL", () =>
    expect(url.self()()).toEqual("https://example.org/start/url.test"));

  afterAll(() => {
    url.baseURL = undefined;
    url.rootDir = "";
  });
});

describe("url.self", () => {
  it("should return URL relative to root dir (empty)", () => {
    url.rootDir = "";
    expect(url.self()()).toEqual("/src/http/url.test");
  });

  it("should return URL relative to root dir (slash)", () => {
    url.rootDir = "/";
    expect(url.self()()).toEqual("/src/http/url.test");
  });

  it("should return URL relative to root dir (one level)", () => {
    url.rootDir = "src";
    expect(url.self()()).toEqual("/http/url.test");
  });

  it("should return URL relative to root dir (two levels)", () => {
    url.rootDir = "src/http";
    expect(url.self()()).toEqual("/url.test");
  });
  it("should fail if path outside root dir (relative)", () => {
    url.rootDir = "api";
    expect(() => url.self()()).toThrow(/path is outside of root directory/);
  });

  it("should fail if path outside root dir (absolute)", () => {
    url.rootDir = process.cwd() + "/api";
    expect(() => url.self()()).toThrow(/path is outside of root directory/);
  });

  afterAll(() => {
    url.rootDir = "";
  });
});

describe("path parameters", () => {
  it("should expand :name parameters", () =>
    expect(url("/path/:id", { id: "abc" })).toEqual("/path/abc"));

  it("should expand [name] parameters", () =>
    expect(url("/path/[id]", { id: "abc" })).toEqual("/path/abc"));

  it("should expand numeric value", () =>
    expect(url("/path/:id", { id: 123 })).toEqual("/path/123"));

  it("should fail if :name parameter is variadic", () =>
    expect(() => url("/path/:id", { id: [123, 456] })).toThrow(
      /Expected .* to not repeat/
    ));

  it("should expand :name* parameters", () =>
    expect(url("/post/:slug*", { slug: ["abc", "def"] })).toEqual(
      "/post/abc/def"
    ));

  it("should expand [...name] parameters", () =>
    expect(url("/post/[...slug]", { slug: ["abc", "def"] })).toEqual(
      "/post/abc/def"
    ));

  it("should expand variadic parameter with numeric value", () =>
    expect(url("/post/:slug*", { slug: [123, "def"] })).toEqual(
      "/post/123/def"
    ));

  it("should expand variadic parameter with single value", () =>
    expect(url("/post/[...slug]", { slug: 123 })).toEqual("/post/123"));

  it("should expand multiple parameters", () =>
    expect(
      url("/report/[year]-[month].[format]", {
        year: 2022,
        month: "02",
        format: "xml",
      })
    ).toEqual("/report/2022-02.xml"));

  it("should throw error if parameter value missing", () =>
    expect(() =>
      url("/report/[year]-[month].[format]", {
        year: 2022,
        format: "xml",
      })
    ).toThrow(/Expected .* to be a string/));

  it("should add excess parameters to query", () =>
    expect(
      url("/report/[year]", {
        year: 2022,
        month: "02",
        sort: "desc",
      })
    ).toEqual("/report/2022?month=02&sort=desc"));
});

describe("query parameters", () => {
  it("should handle string", () =>
    expect(url("/", null, { id: "abc" })).toEqual("/?id=abc"));

  it("should handle number", () =>
    expect(url("/", null, { id: 123 })).toEqual("/?id=123"));

  it("should handle boolean", () =>
    expect(url("/", null, { is: true })).toEqual("/?is=true"));

  it("should handle multiple values", () =>
    expect(url("/", null, { filter: ["abc", "xyz"] })).toEqual(
      "/?filter=abc&filter=xyz"
    ));

  it("should work with absolute URL", () => {
    url.baseURL = "https://example.org/start/";
    expect(url("", null, { filter: ["abc", "xyz"] })).toEqual(
      "https://example.org/start/?filter=abc&filter=xyz"
    );
    url.baseURL = undefined;
  });
});

describe("serialized", () => {
  it("should serialize to relative path", () =>
    expect(String(url.for("/path/:id"))).toEqual("/path/:id"));

  it("should serialize to absolute URL", () => {
    url.baseURL = "https://example.org/start/";
    expect(String(url.for("path/:id"))).toEqual(
      "https://example.org/start/path/:id"
    );
    url.baseURL = undefined;
  });

  it("should serialize as JSON property", () => {
    const json = JSON.stringify({
      url: url.for("/path/:id"),
    });
    expect(json).toEqual('{"url":"/path/:id"}');
  });
});
