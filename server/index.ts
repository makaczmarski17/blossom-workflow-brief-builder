import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";

dotenv.config({ path: process.env.ENV_FILE || ".env.local", quiet: true });

const port = Number(process.env.PORT || 5173);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const staticDirectory = path.join(rootDirectory, "dist");
    app.use(express.static(staticDirectory));
    app.use((_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(port, "127.0.0.1", () => {
    console.log(`Blossom is running at http://127.0.0.1:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Blossom failed to start", error);
  process.exit(1);
});
