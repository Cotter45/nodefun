import { createServer } from "./core/server.js";

createServer().then((server) => {
  server.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
});
