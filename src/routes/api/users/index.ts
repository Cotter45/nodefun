export const GET = (ctx: RequestContext) => {
	ctx.res.writeHead(200, { "Content-Type": "application/json" });
	ctx.res.end(
		JSON.stringify([
			{ id: 1, name: "John Doe" },
			{ id: 2, name: "Jane Doe" },
		]),
	);
};

export const POST = async (ctx: RequestContext) => {
	const body = await ctx.body();
	ctx.json({ message: "User created", body });
};
