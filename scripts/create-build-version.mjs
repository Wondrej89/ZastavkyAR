#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
const sha = process.env.GITHUB_SHA || process.env.BUILD_SHA || 'development';
const builtAt = new Date().toISOString();
const version = sha;
const shortVersion = sha === 'development' ? sha : sha.slice(0, 7);
const info = { version, shortVersion, builtAt };
await Promise.all([
  writeFile(new URL('../build-version.json', import.meta.url), `${JSON.stringify(info, null, 2)}\n`),
  writeFile(new URL('../js/build-version.js', import.meta.url), `// Generated during deployment.\nexport const CURRENT_BUILD_VERSION = ${JSON.stringify(version)};\n`),
  writeFile(new URL('../sw-version.js', import.meta.url), `// Generated during deployment.\nself.PID_AR_BUILD_VERSION = ${JSON.stringify(version)};\n`)
]);
console.log(`Build ${shortVersion} (${version}) at ${builtAt}`);
