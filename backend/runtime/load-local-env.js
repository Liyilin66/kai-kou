import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

loadLocalServerEnv();

function loadLocalServerEnv() {
  const mode = `${process.env.NODE_ENV || "development"}`.trim() || "development";
  const envFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    ".env.local",
    ".env"
  ];

  for (const envFile of envFiles) {
    const absolutePath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(absolutePath)) continue;
    dotenv.config({ path: absolutePath });
  }
}
