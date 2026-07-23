import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

try {
  await app.listen({ port: PORT, host: HOST });
} catch (error) {
  app.log.error(error, "failed to start server");
  process.exit(1);
}
