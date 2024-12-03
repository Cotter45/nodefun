import { fileURLToPath } from "node:url";
import path, { basename } from "node:path";
import fs, { createReadStream, existsSync, stat } from "node:fs";
import {
	createServer as httpCreateServer,
	type IncomingMessage,
	type ServerResponse,
	globalAgent,
} from "node:http";

import { RequestQueue } from "./queue.js";
import {
	fetchAndSaveMimeDb,
	getMimeType,
	LOCAL_MIME_DB_PATH,
} from "./mimes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function determineRoutesDir(): string {
	const isDevelopment = __dirname.includes("src");
	return isDevelopment
		? "src/routes"
		: path.resolve(__dirname, "../", "routes");
}

export async function createServer(
	routesDir = determineRoutesDir(),
	config: {
		maxBodySize?: number;
		keepAliveTimeout?: number;
		headersTimeout?: number;
		maxConcurrentRequests?: number;
		maxSockets?: number;
		maxFreeSockets?: number;
	} = {},
) {
	const routes: Array<{
		method: string;
		path: RegExp;
		paramKeys: string[];
		handler: (ctx: RequestContext) => void;
	}> = [];
	const pathMiddlewares: Array<{
		path: RegExp;
		middlewares: Middleware[];
	}> = [];

	const maxBodySize = config.maxBodySize || 1_000_000;
	const maxConcurrentRequests = config.maxConcurrentRequests || 100;

	const requestQueue = new RequestQueue(maxConcurrentRequests);

	function normalizePath(path: string): string {
		return path.replace(/\/+$/, "").replace(/\/+/g, "/") || "/";
	}

	const isAsyncGenerator = (
		gen: AsyncGenerator<unknown> | (() => unknown),
	): gen is AsyncGenerator<unknown> => {
		const isObject = typeof gen === "object";
		return isObject && Symbol.asyncIterator in gen;
	};

	function onRequest(req: IncomingMessage, res: ServerResponse) {
		if (requestQueue.canProcessImmediately()) {
			handleRequest(req, res);
		} else {
			requestQueue.enqueue(() => handleRequest(req, res));
		}
	}

	function handleRequest(req: IncomingMessage, res: ServerResponse) {
		try {
			const { method, url } = req;

			if (!method || !url) {
				res.writeHead(400, { "Content-Type": "text/plain" });
				res.end("Bad Request");
				return;
			}

			const parsedUrl = new URL(url, `http://${req.headers.host}`);
			const searchParams = Object.fromEntries(parsedUrl.searchParams.entries());
			const path = normalizePath(parsedUrl.pathname);

			const applicableMiddlewares = precomputeMiddlewares(path);

			let middlewareIdx = 0;

			const ctx: RequestContext = {
				req,
				res,
				params: {},
				searchParams,
				body: (() => {
					let parsedBody: unknown;
					return async () => {
						if (!parsedBody) {
							try {
								parsedBody = await bodyParser(req, res, maxBodySize);
							} catch (err) {
								console.error("Error parsing request body:", err);
							}
						}
						return parsedBody;
					};
				})(),
				env: process.env,

				// Response methods
				status(code: number) {
					res.statusCode = code;
					return this;
				},
				setHeader(name: string, value: string) {
					res.setHeader(name, value);
					return this;
				},
				setHeaders(headers: Record<string, string>) {
					for (const [key, value] of Object.entries(headers)) {
						res.setHeader(key, value);
					}
					return this;
				},
				json(data: unknown) {
					this.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(data));
				},
				send(data: string | Buffer) {
					if (typeof data === "string") {
						this.setHeader("Content-Type", "text/plain");
					}
					res.end(data);
				},
				html(data: string) {
					this.setHeader("Content-Type", "text/html");
					res.end(data);
				},
				redirect(url: string, statusCode = 302) {
					this.status(statusCode).setHeader("Location", url);
					res.end();
				},
				sendFile(filePath: string) {
					stat(filePath, (err, stats) => {
						if (err) {
							console.error(`File error: ${err.message}`);
							this.status(404).json({ error: "File not found" });
							return;
						}

						if (!stats.isFile()) {
							console.error(`Attempt to access non-file: ${filePath}`);
							this.status(400).json({ error: "Invalid file request" });
							return;
						}

						// Determine MIME type
						const mimeType =
							getMimeType(filePath) || "application/octet-stream";
						this.setHeader("Content-Type", mimeType);

						// Stream the file
						const fileStream = createReadStream(filePath);
						fileStream.on("error", (streamErr) => {
							console.error(`Stream error: ${streamErr.message}`);
							this.status(500).json({ error: "Error reading file" });
						});

						fileStream.pipe(this.res);
					});
				},
				download(filePath: string, fileName?: string) {
					this.setHeader(
						"Content-Disposition",
						`attachment; filename="${fileName || basename(filePath)}"`,
					);
					this.sendFile(filePath);
				},
				sse(
					generator:
						| AsyncGenerator<unknown>
						| (() => unknown | Promise<unknown>),
					intervalMs = 1000,
				) {
					this.setHeaders({
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					});

					let disconnected = false; // Track disconnection state

					// Detect client disconnect
					this.req.on("close", () => {
						disconnected = true;
						this.res.end();
					});

					if (isAsyncGenerator(generator)) {
						const handleAsyncGenerator = async () => {
							try {
								for await (const data of generator) {
									if (disconnected) break; // Stop processing if disconnected
									this.res.write(`data: ${JSON.stringify(data)}\n\n`);
								}
							} catch (err) {
								console.error("Error in SSE async generator:", err);
								this.res.end();
							}
						};

						handleAsyncGenerator();
					} else if (typeof generator === "function") {
						const interval = setInterval(async () => {
							try {
								if (disconnected) {
									clearInterval(interval); // Stop interval if disconnected
									return;
								}
								const data = await generator();
								this.res.write(`data: ${JSON.stringify(data)}\n\n`);
							} catch (err) {
								console.error("Error in SSE function:", err);
								clearInterval(interval);
								this.res.end();
							}
						}, intervalMs);
					} else {
						throw new Error("Invalid generator provided to SSE.");
					}
				},
			};

			function next() {
				if (middlewareIdx < applicableMiddlewares.length) {
					const middleware = applicableMiddlewares[middlewareIdx++];
					middleware(ctx, next);
				} else {
					for (const route of routes) {
						const match = route.path.exec(path);
						if (match && route.method === method) {
							route.paramKeys.forEach((key, i) => {
								ctx.params[key] = match[i + 1];
							});
							route.handler(ctx);
							return;
						}
					}

					res.writeHead(404, { "Content-Type": "text/plain" });
					res.end("Not Found");
				}
			}

			next();
		} catch (e) {
			console.error(e);
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal Server Error");
		}
	}

	const middlewareCache = new Map<string, Middleware[]>();

	function precomputeMiddlewares(path: string): Middleware[] {
		const normalizedPath = normalizePath(path);
		if (middlewareCache.has(normalizedPath)) {
			return middlewareCache.get(normalizedPath) as Middleware[];
		}
		const matchedMiddlewares = pathMiddlewares
			.filter((entry) => entry.path.test(path))
			.sort((a, b) => b.path.source.length - a.path.source.length)
			.flatMap((entry) => entry.middlewares);
		middlewareCache.set(normalizedPath, matchedMiddlewares);
		return matchedMiddlewares;
	}

	function isValidPayload(payload: Record<string, unknown>): boolean {
		const dangerousKeys = ["__proto__", "constructor", "prototype"];
		return !Object.keys(payload).some((key) => dangerousKeys.includes(key));
	}

	async function bodyParser(
		req: IncomingMessage,
		_res: ServerResponse,
		maxBodySize: number,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			let totalSize = 0;
			const chunks: Buffer[] = [];

			req.on("data", (chunk) => {
				totalSize += chunk.length;
				if (totalSize > maxBodySize) {
					reject(new Error("Payload too large"));
					req.destroy();
				} else {
					chunks.push(chunk);
				}
			});

			req.on("end", () => {
				try {
					const rawBody = Buffer.concat(chunks);
					const contentType = req.headers["content-type"] || "";

					if (contentType.includes("application/json")) {
						const parsedBody = JSON.parse(rawBody.toString());
						if (typeof parsedBody === "object" && !isValidPayload(parsedBody)) {
							throw new Error("Invalid payload: dangerous keys detected");
						}
						resolve(parsedBody);
					} else if (
						contentType.includes("application/x-www-form-urlencoded")
					) {
						const formPayload = Object.fromEntries(
							new URLSearchParams(rawBody.toString()),
						);
						if (!isValidPayload(formPayload)) {
							throw new Error("Invalid payload: dangerous keys detected");
						}
						resolve(formPayload);
					} else if (contentType.includes("text/plain")) {
						resolve(rawBody.toString());
					} else if (
						contentType.includes("multipart/form-data") ||
						contentType.includes("application/octet-stream")
					) {
						resolve(rawBody);
					} else {
						reject(new Error("Unsupported content type"));
					}
				} catch (err) {
					reject(new Error("Invalid request body"));
				}
			});

			req.on("error", reject);
		});
	}

	// Automatically load routes
	async function loadRoutes(directory: string, basePath = "") {
		if (!fs.existsSync(directory)) {
			console.warn(`Routes directory not found: ${directory}`);
			return;
		}

		const files = fs.readdirSync(directory);

		for (const file of files) {
			const filePath = path.join(directory, file);
			const stat = fs.statSync(filePath);

			if (stat.isDirectory()) {
				loadRoutes(filePath, path.join(basePath, file));
			} else if (file.endsWith(".ts") || file.endsWith(".js")) {
				let routePath = path
					.join(basePath, file)
					.replace(/\.[tj]s$/, "") // Remove file extensions
					.replace(/\\/g, "/") // Normalize path separators
					.replace(/\/index$/, "");

				if (filePath.endsWith("/routes/index.ts")) {
					routePath = "/";
				}

				routePath = `/${routePath}`.replace(/\/+/g, "/");

				const dynamicPath = routePath.replace(
					/\[([^\]]+)\]/g,
					(_, param) => `(?<${param}>[^/]+)`,
				);
				const paramKeys = [...routePath.matchAll(/\[([^\]]+)\]/g)].map(
					(match) => match[1],
				);

				const module = await import(filePath);
				const middlewares = module.MIDDLEWARE || [];

				if (middlewares.length > 0) {
					pathMiddlewares.push({
						path: new RegExp(`^${routePath}`),
						middlewares,
					});
				}

				for (const method of Object.keys(module)) {
					if (method === "MIDDLEWARE") continue;
					const handler = module[method];
					if (typeof handler === "function") {
						routes.push({
							method: method.toUpperCase(),
							path: new RegExp(`^${dynamicPath}$`),
							paramKeys,
							handler,
						});

						console.log(
							`Registered route: ${method.toUpperCase()} ${routePath} -> ${dynamicPath}`,
						);
					}
				}
			}
		}
	}

	if (!existsSync(LOCAL_MIME_DB_PATH)) {
		await fetchAndSaveMimeDb();
	}

	// Load routes on initialization
	await loadRoutes(path.resolve(routesDir));

	const server = httpCreateServer(onRequest);

	server.keepAliveTimeout = config.keepAliveTimeout || 10000;
	server.headersTimeout = config.headersTimeout || 6000;

	globalAgent.maxSockets = config.maxSockets || Number.POSITIVE_INFINITY;
	globalAgent.maxFreeSockets = config.maxFreeSockets || 256;

	/**
	 * Close the server and cleanup resources
	 */
	function close() {
		server.close();
		requestQueue.clear();
	}

	return {
		listen: (port: number, callback?: () => void) =>
			server.listen(port, callback),
		close,
		use: (path: string, middleware: Middleware) =>
			pathMiddlewares.push({
				path: new RegExp(`^${normalizePath(path)}`),
				middlewares: [middleware],
			}),
	};
}
