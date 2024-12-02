import type { IncomingMessage, ServerResponse } from "node:http";

declare global {
	type RequestContext = {
		req: IncomingMessage;
		res: ServerResponse;
		params: Record<string, string>;
		searchParams: Record<string, string>;
		body: () => Promise<unknown>;
		env: NodeJS.ProcessEnv;

		// Response methods
		status: (code: number) => RequestContext;
		setHeader: (name: string, value: string) => RequestContext;
		setHeaders: (headers: Record<string, string>) => RequestContext;
		json: (data: unknown) => void;
		send: (data: string | Buffer) => void;
		html: (data: string) => void;
		redirect: (url: string, statusCode?: number) => void;
		sendFile: (filePath: string) => void;
		download: (filePath: string, fileName?: string) => void;
		sse: (
			generator: (() => unknown | Promise<unknown>) | AsyncGenerator<unknown>,
			intervalMs?: number,
		) => void;
	};

	type NextFunction = (err?: unknown) => void;
	type Middleware = (ctx: RequestContext, next: NextFunction) => void;
	type MimedType = {
		source: string;
		charset?: string;
		compressible?: boolean;
		extensions?: string[];
		type?: string;
	};
}
