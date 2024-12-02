export const MIDDLEWARE: Middleware[] = [
	(ctx, next) => {
		console.log("API-level middleware");
		next();
	},
];

export const GET = (ctx: RequestContext) => {
	// ctx.send("Welcome to the API");
	// ctx.download("src/files/catalyst-ui-kit.zip");
	ctx.sendFile("src/files/bottle.webp");
};

// SSE can be async generator function
// export const POST = (ctx: RequestContext) => {
//   ctx.sse(
//     (async function* () {
//       let counter = 0;
//       while (true) {
//         const data = {
//           counter: counter++,
//           timestamp: new Date().toISOString(),
//         };
//         console.log("Yielding data:", data);
//         yield data;
//         // await new Promise((resolve) => setTimeout(resolve, 1000));
//       }
//     })()
//   );
// };

// SSE can be async function like db query
export const POST = (ctx: RequestContext) => {
	let count = 0;

	const sendCount = async () => {
		const oldCount = count;
		await new Promise((resolve) => setTimeout(resolve, 1000));
		count++;
		return { count: oldCount };
	};

	ctx.sse(sendCount, 1000);
};
