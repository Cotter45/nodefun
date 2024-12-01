import helmet from "helmet";
import { createServer } from "./core/server.js";

const helmetMiddleware = (ctx: RequestContext, next: NextFunction) => {
  helmet()(ctx.req, ctx.res, next);
};

createServer().then((server) => {
  server.use("/", helmetMiddleware);
  server.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
});
