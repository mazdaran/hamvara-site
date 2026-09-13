import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = resolve(repositoryRoot, '.github/dependency-license-policy.json');
const policy = JSON.parse(await readFile(policyPath, 'utf8'));

const args = process.argv.slice(2);
const npmLockfiles = [];
let cargoMetadataPath = null;

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--npm-lock') {
    npmLockfiles.push(args[++index]);
  } else if (args[index] === '--cargo-metadata') {
    cargoMetadataPath = args[++index];
  } else {
    throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
}

if (!npmLockfiles.length && !cargoMetadataPath) {
  throw new Error('Provide at least one --npm-lock or --cargo-metadata input.');
}

const failures = [];
const notices = [];
let checkedPackages = 0;

function packageNameFromLockPath(lockPath, metadata) {
  if (metadata.name) return metadata.name;
  const marker = 'node_modules/';
  const start = lockPath.lastIndexOf(marker);
  return start === -1 ? lockPath : lockPath.slice(start + marker.length);
}

function matchesPattern(value, pattern) {
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${expression}$`).test(value);
}

function isForbiddenCopyleft(license) {
  const normalized = license.toUpperCase();
  return /\bAGPL(?:-\d(?:\.\d)?(?:-ONLY|-OR-LATER)?)?\b/.test(normalized)
    || /\bGPL(?:-\d(?:\.\d)?(?:-ONLY|-OR-LATER)?)?\b/.test(normalized)
    || normalized.includes('GNU GENERAL PUBLIC LICENSE')
    || normalized.includes('GNU AFFERO GENERAL PUBLIC LICENSE');
}

function isRestrictedCopyleft(license) {
  const normalized = license.toUpperCase();
  return /\bLGPL(?:-\d(?:\.\d)?(?:-ONLY|-OR-LATER)?)?\b/.test(normalized)
    || normalized.includes('GNU LESSER GENERAL PUBLIC LICENSE');
}

function hasPermissiveOrAlternative(license) {
  const alternatives = license.split(/\s+OR\s+/i);
  return alternatives.length > 1
    && alternatives.some((alternative) => !isForbiddenCopyleft(alternative) && !isRestrictedCopyleft(alternative));
}

function isReviewedRestrictedNpmPackage(name, version, dev) {
  return policy.reviewedRestrictedNpmPackages.some((rule) => (
    matchesPattern(name, rule.pattern)
    && (!rule.versions || rule.versions.includes(version))
    && (!rule.devOnly || dev === true)
  ));
}

function auditLicense({ ecosystem, name, version, license, source, dev = false }) {
  checkedPackages += 1;
  const display = `${name}@${version || 'unknown'}`;
  if (!license || typeof license !== 'string') {
    failures.push(`${ecosystem}: ${display} has no declared license (${source}).`);
    return;
  }
  if (hasPermissiveOrAlternative(license)) return;
  if (isForbiddenCopyleft(license)) {
    failures.push(`${ecosystem}: ${display} declares forbidden license "${license}" (${source}).`);
    return;
  }
  if (isRestrictedCopyleft(license)) {
    if (ecosystem === 'npm' && isReviewedRestrictedNpmPackage(name, version, dev)) {
      notices.push(`${ecosystem}: reviewed development-only exception ${display} (${license}).`);
    } else {
      failures.push(`${ecosystem}: ${display} declares restricted license "${license}" and needs explicit review (${source}).`);
    }
  }
}

for (const relativeLockfile of npmLockfiles) {
  if (!relativeLockfile) throw new Error('Missing path after --npm-lock.');
  const absoluteLockfile = resolve(repositoryRoot, relativeLockfile);
  const lock = JSON.parse(await readFile(absoluteLockfile, 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages) {
    failures.push(`npm: ${relativeLockfile} must be a package-lock v3 file.`);
    continue;
  }
  for (const [lockPath, metadata] of Object.entries(lock.packages)) {
    if (!lockPath) continue;
    auditLicense({
      ecosystem: 'npm',
      name: packageNameFromLockPath(lockPath, metadata),
      version: metadata.version,
      license: metadata.license,
      source: relativeLockfile,
      dev: metadata.dev === true
    });
  }
}

if (cargoMetadataPath) {
  const absoluteMetadataPath = resolve(repositoryRoot, cargoMetadataPath);
  const metadata = JSON.parse(await readFile(absoluteMetadataPath, 'utf8'));
  for (const crate of metadata.packages || []) {
    if (crate.source === null) continue;
    auditLicense({
      ecosystem: 'cargo',
      name: crate.name,
      version: crate.version,
      license: crate.license,
      source: cargoMetadataPath
    });
  }
}

for (const asset of policy.reviewedExternalAssets) {
  const assetPath = resolve(repositoryRoot, asset.path);
  let contents;
  try {
    contents = await readFile(assetPath, 'utf8');
  } catch {
    failures.push(`external asset: missing evidence file ${asset.path} for ${asset.name}@${asset.version}.`);
    continue;
  }
  if (!contents.includes(asset.source)) {
    failures.push(`external asset: ${asset.path} no longer references the reviewed ${asset.name}@${asset.version} source.`);
  }
  auditLicense({
    ecosystem: 'external asset',
    name: asset.name,
    version: asset.version,
    license: asset.license,
    source: asset.path
  });
}

for (const notice of notices) console.log(`NOTICE: ${notice}`);

if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error(`Dependency license gate failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Dependency license gate passed: ${checkedPackages} package/asset license records checked; no GPL or AGPL dependencies found.`);
