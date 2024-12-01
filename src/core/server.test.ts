import fs from "node:fs";
import path from "node:path";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";

import { createServer } from "./server";

const testRoutesDir = path.resolve(__dirname, "test/routes");
let serverInstance: Awaited<ReturnType<typeof createServer>>;
let port: number;

beforeAll(() => {
  // Create mock routes directory
  fs.mkdirSync(testRoutesDir, { recursive: true });
  fs.writeFileSync(
    path.join(testRoutesDir, "index.ts"),
    `export function GET(ctx) { ctx.status(200).send("Root Route"); }`
  );
  fs.mkdirSync(path.join(testRoutesDir, "api"), { recursive: true });
  fs.writeFileSync(
    path.join(testRoutesDir, "api/index.ts"),
    `export function GET(ctx) { ctx.json({ message: "API Route" }); }`
  );
  fs.writeFileSync(
    path.join(testRoutesDir, "api/[id].ts"),
    `export function GET(ctx) { ctx.json({ message: "API Route" }); }`
  );
});

afterAll(() => {
  // Cleanup mock routes directory
  fs.rmSync(testRoutesDir, { recursive: true, force: true });
  serverInstance.close();
});

beforeEach(async () => {
  serverInstance = await createServer(testRoutesDir, {});
  const testServer = serverInstance.listen(8080);
  const address = testServer.address();

  if (!address || typeof address !== "object") {
    throw new Error("Server did not start properly");
  }

  port = address.port;
});

afterEach(() => {
  serverInstance.close();
});

describe("Server", () => {
  it("should respond to GET /", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toBe("Root Route");
  });

  it("should handle dynamic routes", async () => {
    const res = await fetch(`http://localhost:${port}/api/123`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ message: "API Route" });
  });

  it("should handle route not found", async () => {
    const res = await fetch(`http://localhost:${port}/not-found`);
    const text = await res.text();

    expect(res.status).toBe(404);
    expect(text).toBe("Not Found");
  });
});
