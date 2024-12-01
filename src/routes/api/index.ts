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
