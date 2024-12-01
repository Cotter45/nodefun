export const GET = (ctx: RequestContext) => {
	const { id } = ctx.params;
	ctx.res.writeHead(200, { "Content-Type": "application/json" });
	ctx.res.end(JSON.stringify({ id, name: `User ${id}` }));
};
