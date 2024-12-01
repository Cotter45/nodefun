export const MIDDLEWARE: Middleware[] = [
	(ctx, next) => {
		console.log("API-level middleware");
		next();
	},
];

export const GET = (ctx: RequestContext) => {
	ctx.send("Welcome to the API");
};
