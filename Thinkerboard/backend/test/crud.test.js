// Full CRUD tests against a real MongoDB.
// Uses MONGO_TEST_URI if set (CI service container), otherwise starts an in-memory MongoDB.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";

import { createApp } from "../src/app.js";

let memoryServer;
const app = createApp({ rateLimiter: (_req, _res, next) => next() });

before(async () => {
  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }
  await mongoose.connect(uri, { dbName: "thinkboard_test" });
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

test("GET /ready returns 200 when MongoDB is reachable", async () => {
  const res = await request(app).get("/ready");
  assert.equal(res.status, 200);
});

test("create, read, update and delete a note", async () => {
  const created = await request(app).post("/api/notes").send({ title: "First", content: "Hello" });
  assert.equal(created.status, 201);
  const id = created.body._id;

  const list = await request(app).get("/api/notes");
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);

  const one = await request(app).get(`/api/notes/${id}`);
  assert.equal(one.body.title, "First");

  const updated = await request(app).put(`/api/notes/${id}`).send({ title: "Edited", content: "Hi" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, "Edited");

  const deleted = await request(app).delete(`/api/notes/${id}`);
  assert.equal(deleted.status, 200);

  const gone = await request(app).get(`/api/notes/${id}`);
  assert.equal(gone.status, 404);
});

test("notes are listed newest first", async () => {
  await request(app).post("/api/notes").send({ title: "Older", content: "1" });
  await new Promise((r) => setTimeout(r, 10));
  await request(app).post("/api/notes").send({ title: "Newer", content: "2" });
  const list = await request(app).get("/api/notes");
  assert.equal(list.body[0].title, "Newer");
});

test("updating with an empty title returns 400", async () => {
  const created = await request(app).post("/api/notes").send({ title: "Keep", content: "x" });
  const res = await request(app).put(`/api/notes/${created.body._id}`).send({ title: "", content: "x" });
  assert.equal(res.status, 400);
});

test("a valid id that does not exist returns 404", async () => {
  const res = await request(app).get(`/api/notes/${new mongoose.Types.ObjectId()}`);
  assert.equal(res.status, 404);
});
