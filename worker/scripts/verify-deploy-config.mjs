import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../wrangler.toml", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = await readFile(configUrl, "utf8");

const d1Blocks = config.match(/\[\[d1_databases\]\][\s\S]*?(?=\n\[|$)/g) ?? [];
const productionBinding = d1Blocks.find((block) =>
  /^\s*binding\s*=\s*["']DB["']\s*$/m.test(block),
);
const r2Blocks = config.match(/\[\[r2_buckets\]\][\s\S]*?(?=\n\[|$)/g) ?? [];
const tariffSnapshotBinding = r2Blocks.find((block) =>
  /^\s*binding\s*=\s*["']TARIFF_SNAPSHOTS["']\s*$/m.test(block),
);

const errors = [];
const expectedProductionOrigins = ["https://hamvara.com", "https://www.hamvara.com"];

if (!/^\s*main\s*=\s*["']worker\/src\/index\.js["']\s*$/m.test(config)) {
  errors.push('main must be "worker/src/index.js"');
}

const originsMatch = config.match(/^\s*ALLOWED_ORIGINS\s*=\s*["']([^"']*)["']\s*$/m);
const productionOrigins = originsMatch?.[1]
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

if (JSON.stringify(productionOrigins) !== JSON.stringify(expectedProductionOrigins)) {
  errors.push(
    `ALLOWED_ORIGINS must contain only the production origins: ${expectedProductionOrigins.join(", ")}`,
  );
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

if (!tariffSnapshotBinding) {
  errors.push('an R2 bucket binding named "TARIFF_SNAPSHOTS" is required');
} else if (!/^\s*bucket_name\s*=\s*["']hamvara-tariff-snapshots["']\s*$/m.test(tariffSnapshotBinding)) {
  errors.push('TARIFF_SNAPSHOTS must target bucket_name "hamvara-tariff-snapshots"');
}

const promotionMatch = config.match(
  /^\s*TARIFF_PRODUCTION_PROMOTION_ENABLED\s*=\s*["'](true|false)["']\s*$/m,
);

if (!promotionMatch) {
  errors.push('TARIFF_PRODUCTION_PROMOTION_ENABLED must be explicitly set to "true" or "false"');
} else if (
  promotionMatch[1] !== "false" &&
  process.env.ALLOW_TARIFF_PROMOTION_DEPLOY !== "true"
) {
  errors.push(
    'TARIFF_PRODUCTION_PROMOTION_ENABLED must remain "false" unless ALLOW_TARIFF_PROMOTION_DEPLOY=true is explicitly authorized',
  );
}

if (errors.length > 0) {
  console.error(`Refusing to deploy with ${configPath}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Deploy configuration verified: ${configPath} includes production DB, tariff snapshot R2, and an authorized promotion lock state.`,
);
