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
const LONG_TERM_DIR = path.join(process.argv[2], 'temp-' + Date.now());
const SHORT_TERM_DIR = path.join(process.argv[3], 'temp-' + Date.now());
const numberOfRuns = Number(process.argv[4])
const CACHE_DIR = process.argv[5]

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
  console.log(`Starting ${name}...`);
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

async function tarDir(dir, outputPath) {
  return new Promise((resolve, reject) => {
    tar.c(
      {
        gzip: true,
        file: outputPath,
        cwd: dir
      },
      ['.'],
      (err) => {
        if (err) {
          console.error('Error creating tarball:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    )
  });
}

// Run commands in Docker
function runDockerCommand(directory, command, additionalMounts = {}) {
  const mounts = Object.assign({}, additionalMounts, {
    [`${directory}/project`]: { bind: '/app', mode: 'rw' }
  });

  const mountString = Object.entries(mounts).map(([src, dest]) => `-v ${src}:${dest.bind}:${dest.mode || 'r'}`).join(' ');

  const dockerCmd = `docker run --rm ${mountString} -w /app node:current-buster ${command}`;
  execSync(dockerCmd, { stdio: process.env.SHOW_STDIO === 'true' ? 'inherit' : 'ignore' });
}

async function benchmark() {
  const originalUploadPath = path.join(LONG_TERM_DIR, 'project.tar.gz');
  const builtTarPath = path.join(LONG_TERM_DIR, 'built.tar.gz');

  const times = {
    download: [],
    extract: [],
    npmInstall: [],
    npmRunBuild: [],
    saveNewAuthority: [],
    extractAuthority: []
  };

  ensureDir(LONG_TERM_DIR);
  ensureDir(SHORT_TERM_DIR);

  console.log('Starting benchmark...');

  for (let i = 0; i < numberOfRuns; i++) {
    console.log(`Run #${i + 1}`);

    const longTermRunDir = path.join(LONG_TERM_DIR, `run-${i}`);
    const shortTermRunDir = path.join(SHORT_TERM_DIR, `run-${i}`);
    const buildDir = path.join(shortTermRunDir, 'temp-build');

    ensureDir(longTermRunDir);
    ensureDir(buildDir);

    // Step 1: Download the file
    times.download.push(
      await measure('Download tarball', async () => downloadTarball(originalUploadPath))
    );

    // Step 2: Extract the tarball
    times.extract.push(
      await measure('Extract tarball', async () => extractTarball(originalUploadPath, buildDir))
    );

    // Step 3: Run `npm install` in Docker
    const mounts = {};
    if (CACHE_DIR) {
      mounts[CACHE_DIR] = { bind: '/root/.npm', mode: 'rw' };
    }
    times.npmInstall.push(
      await measure('NPM install', async () => runDockerCommand(buildDir, 'npm ci --prefer-offline', mounts))
    );

    // Step 4: Run `npm run build` in Docker
    times.npmRunBuild.push(
      await measure('NPI build', async () => runDockerCommand(buildDir, 'npx nowprototypeit build'))
    );

    times.saveNewAuthority.push(
      await measure('Save new authority', async () => tarDir(buildDir, builtTarPath))
    )

    const authorityUnpackedDir = path.join(shortTermRunDir, 'authority-unpacked');
    ensureDir(authorityUnpackedDir);

    times.extractAuthority.push(
      await measure('Extract authority', async () => extractTarball(builtTarPath, authorityUnpackedDir))
    )

  }

  // Performance report
  console.log('\nPerformance Summary:');
  let totalTime = 0;
  for (const [step, durations] of Object.entries(times)) {
    const total = durations.reduce((acc, d) => acc + d, 0);
    const avg = total / durations.length;
    totalTime += avg;
    console.log(`${step}: Avg ${(avg / 1000).toFixed(2)} s`);
  }
  console.log(`Average total time: ${(totalTime / 1000).toFixed(2)} s`);
}

benchmark().catch((err) => {
  console.error('Benchmark failed:', err);
});


function failedToStartError() {
  throw new Error('Parameters required <output-directory> <number-of-runs> [cache-directory]')
}
