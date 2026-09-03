import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../wrangler.toml", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = await readFile(configUrl, "utf8");

const d1Blocks = config.match(/\[\[d1_databases\]\][\s\S]*?(?=\n\[|$)/g) ?? [];
const productionBinding = d1Blocks.find((block) =>
  /^\s*binding\s*=\s*["']DB["']\s*$/m.test(block),
);

const errors = [];

if (!/^\s*main\s*=\s*["']worker\/src\/index\.js["']\s*$/m.test(config)) {
  errors.push('main must be "worker/src/index.js"');
}

if (!productionBinding) {
  errors.push('a D1 database binding named "DB" is required');
} else {
  if (!/^\s*database_name\s*=\s*["']hamvara-growth-production["']\s*$/m.test(productionBinding)) {
    errors.push('DB must target database_name "hamvara-growth-production"');
  }

  if (!/^\s*database_id\s*=\s*["'][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["']\s*$/im.test(productionBinding)) {
    errors.push("DB must have a valid production database_id");
  }
}

if (errors.length > 0) {
  console.error(`Refusing to deploy with ${configPath}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Deploy configuration verified: ${configPath} includes the production DB binding.`);
