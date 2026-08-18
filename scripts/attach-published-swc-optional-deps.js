#!/usr/bin/env node
// @ts-check

/**
 * Preview Next.js tarballs do not rebuild native SWC. Point optional
 * `@next/swc-*` deps at the same version already published to npm so apps can
 * download official binaries at install time.
 */
const fs = require('node:fs/promises')
const path = require('node:path')

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64-gnu',
  'linux-arm64-musl',
  'linux-x64-gnu',
  'linux-x64-musl',
  'win32-arm64-msvc',
  'win32-x64-msvc',
]

async function main() {
  const pkgPath = path.join(__dirname, '../packages/next/package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  pkg.optionalDependencies ??= {}
  for (const platform of PLATFORMS) {
    pkg.optionalDependencies[`@next/swc-${platform}`] = pkg.version
  }
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.info(
    `Attached @next/swc-* optionalDependencies at ${pkg.version} for ${PLATFORMS.length} platforms.`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
