#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
const sha = process.env.GITHUB_SHA || process.env.BUILD_SHA || 'development';
const builtAt = new Date().toISOString();
const deployment = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT || '1'}` : String(Date.now());
const version = `${sha.slice(0, 12)}-${deployment}`;
const info = { sha, builtAt, version };
await Promise.all([
  writeFile(new URL('../build-version.json', import.meta.url), `${JSON.stringify(info, null, 2)}\n`),
  writeFile(new URL('../js/build-version.js', import.meta.url), `// Generated during deployment.\nexport const CURRENT_BUILD_VERSION = ${JSON.stringify(version)};\n`),
  writeFile(new URL('../sw-version.js', import.meta.url), `// Generated during deployment.\nself.PID_AR_BUILD_VERSION = ${JSON.stringify(version)};\n`)
]);
console.log(`Build ${version} (${sha}) at ${builtAt}`);
