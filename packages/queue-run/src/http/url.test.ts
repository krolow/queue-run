/* eslint-disable sonarjs/no-duplicate-string */
import { URL } from "url";
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

  it("should retain query string and hash", () =>
    expect(url("/foo/bar?a=b#c")).toEqual("/foo/bar?a=b#c"));

  afterAll(() => {
    url.rootDir = "";
  });
});

describe("with base URL", () => {
  beforeAll(() => {
    url.baseUrl = "https://example.org/start/";
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

  it("should retain query string and hash", () =>
    expect(url("foo/bar?a=b#c")).toEqual(
      "https://example.org/start/foo/bar?a=b#c"
    ));

  afterAll(() => {
    url.baseUrl = undefined;
    url.rootDir = "";
  });
});

describe("url with URL object", () => {
  it("should return exact URL", () =>
    expect(url(new URL("http://url.example.com/path"))).toEqual(
      "http://url.example.com/path"
    ));
});

describe("url with file: URL", () => {
  it("should return path if inside root directory", () => {
    url.rootDir = "/src";
    expect(url(`file:///${process.cwd()}/src/test.js`)).toEqual("/test");
  });

  it("should ignore file extension", () => {
    expect(url(`file:///${process.cwd()}/test.js`)).toEqual("/test");
    expect(url(`file:///${process.cwd()}/test.mjs`)).toEqual("/test");
    expect(url(`file:///${process.cwd()}/test.ts`)).toEqual("/test");
    expect(url(`file:///${process.cwd()}/test.tsx`)).toEqual("/test");
  });

  it("should ignore index if entire path", () => {
    expect(url(`file:///${process.cwd()}/index.js`)).toEqual("/");
  });

  it("should ignore index if basename", () => {
    expect(url(`file:///${process.cwd()}/test/index.js`)).toEqual("/test");
  });

  it("should not ignore index if dirname", () => {
    expect(url(`file:///${process.cwd()}/index/test.js`)).toEqual(
      "/index/test"
    );
  });

  it("should error if outside root directory", () => {
    url.rootDir = "/opt";
    expect(() => url("file:///usr/assaf/queue-run/src/test.js")).toThrowError(
      /outside of root directory/
    );
  });

  afterEach(() => {
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

  afterEach(() => {
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
    url.baseUrl = "https://example.org/start/";
    expect(url("", null, { filter: ["abc", "xyz"] })).toEqual(
      "https://example.org/start/?filter=abc&filter=xyz"
    );
    url.baseUrl = undefined;
  });

  it("should retain query paramteres", () =>
    expect(url("/?this=that", null, { filter: ["abc", "xyz"] })).toEqual(
      "/?this=that&filter=abc&filter=xyz"
    ));
});

describe("serialized", () => {
  it("should serialize to original URL", () =>
    expect(String(url.for("http://example.com/path/:id?a=b#c"))).toEqual(
      "http://example.com/path/:id?a=b#c"
    ));

  it("should serialize to relative path", () =>
    expect(String(url.for("/path/:id"))).toEqual("/path/:id"));

  it("should serialize to absolute URL", () => {
    url.baseUrl = "https://example.org/start/";
    expect(String(url.for("path/:id?a=b#c"))).toEqual(
      "https://example.org/start/path/:id?a=b#c"
    );
    url.baseUrl = undefined;
  });

  it("should serialize as JSON property", () => {
    const json = JSON.stringify({
      url: url.for("/path/:id?a=b#c"),
    });
    expect(json).toEqual('{"url":"/path/:id?a=b#c"}');
  });
});

describe("url.relative", () => {
  beforeAll(() => {
    url.baseUrl = "https://example.org/";
  });

  it("should have no effect if not used", () => {
    expect(url.for("/path/:id")({ id: 123 })).toEqual(
      "https://example.org/path/123"
    );
  });

  it("should return relative URL", () => {
    expect(url.for("/path/:id").relative({ id: 123 })).toEqual("/path/123");
  });

  it("should return URL relative to root", () => {
    expect(url.for("path/:id").relative({ id: 123 })).toEqual("/path/123");
  });

  it("should work with absolute URL", () => {
    const absoluteUrl = "https://example.org/path/:id";
    expect(url.for(absoluteUrl).relative({ id: 123 })).toEqual("/path/123");
  });
  it("should work with URL object", () => {
    const urlObject = new URL("https://example.org/path/:id");
    expect(url.for(urlObject).relative({ id: 123 })).toEqual("/path/123");
  });

  it("should work with url.self", () => {
    url.rootDir = "src";
    expect(url.self().relative({ id: 123 })).toEqual("/http/url.test?id=123");
    url.rootDir = "";
  });

  afterEach(() => {
    url.baseUrl = undefined;
  });
});

describe("url.base", () => {
  beforeAll(() => {
    url.baseUrl = "https://wrong.info/";
  });

  it("should use new base URL", () =>
    expect(
      url.base("http://example.com")("/bookmark/[id]", { id: 123 })
    ).toEqual("http://example.com/bookmark/123"));

  it("should apply to url.for", () =>
    expect(
      url.base("http://example.com").for("/bookmark/[id]")({ id: 123 })
    ).toEqual("http://example.com/bookmark/123"));

  it("should apply to url.self", () => {
    url.rootDir = "src";
    expect(url.base("http://example.com").self()({ id: 123 })).toEqual(
      "http://example.com/http/url.test?id=123"
    );
    url.rootDir = "";
  });

  afterEach(() => {
    url.baseUrl = undefined;
  });
});
