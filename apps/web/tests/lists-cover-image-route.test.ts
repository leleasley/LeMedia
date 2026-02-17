import assert from "node:assert/strict";
import test from "node:test";
import { handleListCoverImageRequest } from "../src/lib/lists-cover-image";

const baseDeps = {
  getCustomListById: async () => null as any,
  resolveOptionalUserId: async () => null as number | null,
  readFile: async () => Buffer.from(""),
  uploadBaseDir: "/tmp",
};

test("cover image route: owner can view private list cover", async () => {
  const deps = {
    ...baseDeps,
    getCustomListById: async () =>
    ({
      id: 10,
      userId: 7,
      isPublic: false,
      customCoverImagePath: "list-covers/list-10-aabbccdd.jpg",
    }) as any,
    resolveOptionalUserId: async () => 7,
    readFile: async () => Buffer.from("jpeg-data"),
  };

  const res = await handleListCoverImageRequest("10", deps);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
});

test("cover image route: non-owner cannot view private list cover", async () => {
  let readCalled = false;
  const deps = {
    ...baseDeps,
    getCustomListById: async () =>
    ({
      id: 10,
      userId: 7,
      isPublic: false,
      customCoverImagePath: "list-covers/list-10-aabbccdd.png",
    }) as any,
    resolveOptionalUserId: async () => 99,
    readFile: async () => {
      readCalled = true;
      return Buffer.from("png-data");
    },
  };

  const res = await handleListCoverImageRequest("10", deps);

  assert.equal(res.status, 404);
  assert.equal(readCalled, false);
});

test("cover image route: public list is viewable", async () => {
  const deps = {
    ...baseDeps,
    getCustomListById: async () =>
    ({
      id: 11,
      userId: 42,
      isPublic: true,
      customCoverImagePath: "list-covers/list-11-aabbccdd.webp",
    }) as any,
    resolveOptionalUserId: async () => null,
    readFile: async () => Buffer.from("webp-data"),
  };

  const res = await handleListCoverImageRequest("11", deps);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
});

test("cover image route: invalid listId returns 404", async () => {
  const res = await handleListCoverImageRequest("not-a-number", baseDeps);
  assert.equal(res.status, 404);
});

test("cover image route: missing cover returns 404", async () => {
  const deps = {
    ...baseDeps,
    getCustomListById: async () =>
      ({
        id: 12,
        userId: 42,
        isPublic: true,
        customCoverImagePath: null,
      }) as any,
    resolveOptionalUserId: async () => 42,
  };
  const res = await handleListCoverImageRequest("12", deps);

  assert.equal(res.status, 404);
});
