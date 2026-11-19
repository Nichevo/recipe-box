#!/usr/bin/env node
// Builds wrangler.deploy.json for production from wrangler.jsonc plus
// account-specific values held in CI secrets, so they never enter the repo.
//
//   D1_DATABASE_ID  id of the production D1 database
//   APP_DOMAIN      custom domain for the app, e.g. recipes.example.com
import { readFileSync, writeFileSync } from "node:fs";

const required = ["D1_DATABASE_ID", "APP_DOMAIN"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const source = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
// Drop whole-line // comments (the file has no trailing comments after values).
const config = JSON.parse(source.replace(/^\s*\/\/.*$/gm, ""));

config.$schema = undefined;
config.d1_databases[0].database_id = process.env.D1_DATABASE_ID;
config.routes = [{ pattern: process.env.APP_DOMAIN, custom_domain: true }];
config.workers_dev = false;
config.vars = { ...config.vars, ACCESS_REQUIRED: "true" };

writeFileSync(new URL("../wrangler.deploy.json", import.meta.url), JSON.stringify(config, null, 2));
console.log("Wrote wrangler.deploy.json");
