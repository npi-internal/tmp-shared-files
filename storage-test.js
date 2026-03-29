#!/usr/bin/env node

// Note: Vibe coded :)

import fs from 'fs';
import path from 'path';
import tar from 'tar';
import zlib from 'zlib';
import https from 'https';
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';
import { pipeline } from 'stream/promises';

// Replace with your URL to host the tarball
const TAR_GZ_URL = 'https://raw.githubusercontent.com/npi-internal/tmp-shared-files/e34195d32df254b8dc93886ba8efd61edba1a242/example-001.tar.gz';

if (process.argv.length < 4) failedToStartError()

// Local temp directory for the test
const TEMP_DIR = path.join(process.argv[2], 'temp-' + Date.now());
const numberOfRuns = Number(process.argv[3])

if (isNaN(numberOfRuns)) {
  failedToStartError();
}

// Utility function: Ensure a directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Utility function: Measure and log the runtime of a step
async function measure(name, fn) {
  const start = performance.now();
  await fn();
  const end = performance.now();
  console.log(`${name} took ${(end - start).toFixed(2)} ms`);
  return end - start;
}

// Download the tar.gz file
async function downloadTarball(outputFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputFile);
    https.get(TAR_GZ_URL, function (response) {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download tarball. Status code: ${response.statusCode}`));
      }
      response
        .pipe(file)
        .on('finish', () => resolve())
        .on('error', err => {
          console.error('Error downloading tarball:', err);
          reject(err)
        });
    });
  });
}

// Extract the tarball
async function extractTarball(tarballPath, outputDir) {
  await pipeline(
    fs.createReadStream(tarballPath),
    zlib.createGunzip(),
    tar.extract({ cwd: outputDir, strict: true })
  );
  console.log(fs.readdirSync(path.join(outputDir, 'project')));
}

// Copy directory
async function tarDir(src, dest) {
  await tar.c({
    gzip: true,
    file: dest,
    cwd: src,
  }, ['.']);
}

// Run commands in Docker
function runDockerCommand(directory, command) {
  const dockerCmd = `docker run --rm -v ${directory}/project:/app -w /app node:current-buster ${command}`;
  execSync(dockerCmd, { stdio: process.env.SHOW_STDIO === 'true' ? 'inherit' : 'ignore' });
}

async function benchmark() {
  const tarballPath = path.join(TEMP_DIR, 'project.tar.gz');
  const times = {
    download: [],
    extract: [],
    npmInstall: [],
    npmRunBuild: [],
    copyBuilt: [],
  };

  ensureDir(TEMP_DIR);

  console.log('Starting benchmark...');

  for (let i = 0; i < numberOfRuns; i++) {
    console.log(`Run #${i + 1}`);

    const runDir = path.join(TEMP_DIR, `run-${i}`);
    const authorityDir = path.join(runDir, 'temp-build');
    const recoveryDir = path.join(runDir, 'temp-recovery');
    const builtTar = path.join(runDir, 'original-built.tar.gz');

    ensureDir(runDir);
    ensureDir(authorityDir);
    ensureDir(recoveryDir);

    // Step 1: Download the file
    times.download.push(
      await measure('Download tarball', async () => downloadTarball(tarballPath))
    );

    // Step 2: Extract the tarball
    times.extract.push(
      await measure('Extract tarball', async () => extractTarball(tarballPath, authorityDir))
    );

    // Step 3: Run `npm install` in Docker
    times.npmInstall.push(
      await measure('NPM install', async () => runDockerCommand(authorityDir, 'npm install'))
    );

    // Step 4: Run `npm run build` in Docker
    times.npmRunBuild.push(
      await measure('NPM run build', async () => runDockerCommand(authorityDir, 'npx nowprototypeit build'))
    );

    // Step 5: Copy to `original-built`
    times.copyBuilt.push(
      await measure('Copy built files', async () => tarDir(authorityDir, builtTar))
    );

    // Step 5: Copy to `original-built`
    times.copyBuilt.push(
      await measure('Recover built files', async () => extractTarball(builtTar, recoveryDir))
    );
  }

  // Performance report
  console.log('\nPerformance Summary:');
  for (const [step, durations] of Object.entries(times)) {
    const total = durations.reduce((acc, d) => acc + d, 0);
    const avg = total / durations.length;
    console.log(`${step}: Avg ${(avg / 1000).toFixed(2)} s  (Total ${(total / 1000).toFixed(2)} s)`);
  }
}

benchmark().catch((err) => {
  console.error('Benchmark failed:', err);
});


function failedToStartError() {
  throw new Error('Parameters required <output-directory> <number-of-runs>')
}
