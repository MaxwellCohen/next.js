// @ts-check

const path = require('path')
const fsp = require('fs/promises')
const process = require('process')
const execa = require('execa')
const yaml = require('js-yaml')
const yargs = require('yargs')

/**
 * Sync Next.js React dependencies from a CodeSandbox commit build.
 *
 * Basic usage:
 *   pnpm sync-react-csb f696d31b
 *
 * Update package.json but skip installing the dependencies automatically:
 *   pnpm sync-react-csb f696d31b --no-install
 *
 * Use a different CodeSandbox repo:
 *   pnpm sync-react-csb f696d31b --owner MaxwellCohen --repo react
 *
 * CodeSandbox packages are exotic (URL) sources. Root `pnpm.overrides` apply
 * those URLs across workspace packages, which `blockExoticSubdeps: true` in
 * `pnpm-workspace.yaml` rejects. This script disables that setting for the
 * duration of the sync/install so CSB React can be used locally.
 */

const defaultOwner = 'MaxwellCohen'
const defaultRepo = 'react'
const csbBaseUrl = 'https://pkg.csb.dev'

const reactPackages = [
  'react',
  'react-dom',
  'react-is',
  'react-server-dom-turbopack',
  'react-server-dom-webpack',
  'scheduler',
]

/**
 * Allow exotic (URL) React overrides to resolve for workspace packages.
 * Leaves `blockExoticSubdeps: false` in place so later `pnpm install`s keep
 * working while CodeSandbox React is pinned.
 *
 * @param {() => Promise<void>} fn
 */
async function withExoticSubdepsAllowed(fn) {
  const workspaceYamlPath = path.join(process.cwd(), 'pnpm-workspace.yaml')
  const original = await fsp.readFile(workspaceYamlPath, 'utf-8')
  const config = /** @type {Record<string, unknown>} */ (yaml.load(original))

  if (config.blockExoticSubdeps !== false) {
    let updated = original
    if (/^blockExoticSubdeps:\s*true\s*$/m.test(original)) {
      updated = original.replace(
        /^blockExoticSubdeps:\s*true\s*$/m,
        'blockExoticSubdeps: false # disabled by sync-react-csb for CodeSandbox React'
      )
    } else if (!/^blockExoticSubdeps:/m.test(original)) {
      updated =
        original.trimEnd() +
        '\nblockExoticSubdeps: false # disabled by sync-react-csb for CodeSandbox React\n'
    }
    await fsp.writeFile(workspaceYamlPath, updated)
    console.log(
      'Set blockExoticSubdeps: false in pnpm-workspace.yaml (required for CodeSandbox URL overrides).'
    )
  }

  await fn()
}

/**
 * @param {object} options
 * @param {string} options.owner
 * @param {string} options.repo
 * @param {string} options.commit
 * @param {string} options.packageName
 * @returns {string}
 */
function getCsbPackageUrl({ owner, repo, commit, packageName }) {
  return `${csbBaseUrl}/${owner}/${repo}/commit/${commit}/${packageName}`
}

/**
 * @param {object} options
 * @param {string} options.owner
 * @param {string} options.repo
 * @param {string} options.commit
 * @returns {Record<string, string>}
 */
function getPackageUrls({ owner, repo, commit }) {
  /** @type {Record<string, string>} */
  const urls = {}
  for (const packageName of reactPackages) {
    urls[packageName] = getCsbPackageUrl({
      owner,
      repo,
      commit,
      packageName,
    })
  }
  return urls
}

/**
 * @param {object} options
 * @param {string} options.commit
 * @param {string} options.owner
 * @param {string} options.repo
 * @param {boolean} options.install
 */
async function sync({ commit, owner, repo, install }) {
  const cwd = process.cwd()
  const packageJsonPath = path.join(cwd, 'package.json')
  const pkgJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf-8'))
  const devDependencies = pkgJson.devDependencies
  const pnpmOverrides = pkgJson.pnpm.overrides
  const urls = getPackageUrls({ owner, repo, commit })

  console.log(
    `Updating React packages to CodeSandbox commit ${owner}/${repo}@${commit}...`
  )

  for (const [packageName, url] of Object.entries(urls)) {
    console.log(`  ${packageName} -> ${url}`)
  }

  devDependencies['react-builtin'] = urls.react
  devDependencies['react-experimental-builtin'] = urls.react
  devDependencies['react-dom-builtin'] = urls['react-dom']
  devDependencies['react-dom-experimental-builtin'] = urls['react-dom']
  devDependencies['react-is-builtin'] = urls['react-is']
  devDependencies['react-server-dom-turbopack'] =
    urls['react-server-dom-turbopack']
  devDependencies['react-server-dom-turbopack-experimental'] =
    urls['react-server-dom-turbopack']
  devDependencies['react-server-dom-webpack'] = urls['react-server-dom-webpack']
  devDependencies['react-server-dom-webpack-experimental'] =
    urls['react-server-dom-webpack']
  devDependencies['scheduler-builtin'] = urls.scheduler
  devDependencies['scheduler-experimental-builtin'] = urls.scheduler

  pnpmOverrides.react = urls.react
  pnpmOverrides['react-dom'] = urls['react-dom']
  pnpmOverrides['react-is'] = urls['react-is']
  pnpmOverrides.scheduler = urls.scheduler

  await fsp.writeFile(
    packageJsonPath,
    JSON.stringify(pkgJson, null, 2) +
      // Prettier would add a newline anyway so do it manually to skip the additional `pnpm prettier-write`
      '\n'
  )

  // Root overrides point every workspace package at exotic CSB URLs.
  // `blockExoticSubdeps: true` only allows exotic sources on root package.json
  // direct deps, so disable it for as long as CSB React is in use.
  await withExoticSubdepsAllowed(async () => {
    if (!install) {
      console.log(
        `
To finish upgrading, complete the following steps:

- Install the updated dependencies: pnpm install --config.block-exotic-subdeps=false
- Build the vendored React files: (inside packages/next dir) pnpm ncc-compiled

Or run this command again without the --no-install flag to do both automatically.
    `
      )
      return
    }

    console.log('Installing dependencies...')

    const installSubprocess = execa('pnpm', [
      'install',
      '--no-frozen-lockfile',
      // Belt-and-suspenders in case workspace yaml hasn't been reloaded yet.
      '--config.block-exotic-subdeps=false',
    ])
    if (installSubprocess.stdout) {
      installSubprocess.stdout.pipe(process.stdout)
    }
    try {
      await installSubprocess
    } catch (error) {
      console.error(error)
      throw new Error('Failed to install updated dependencies.')
    }

    console.log('Building vendored React files...\n')
    const nccSubprocess = execa('pnpm', ['ncc-compiled'], {
      cwd: path.join(cwd, 'packages', 'next'),
    })
    if (nccSubprocess.stdout) {
      nccSubprocess.stdout.pipe(process.stdout)
    }
    try {
      await nccSubprocess
    } catch (error) {
      console.error(error)
      throw new Error('Failed to run ncc.')
    }

    console.log()
  })
}

async function main() {
  const argv = await yargs(process.argv.slice(2))
    .usage('Usage: pnpm sync-react-csb <commit> [options]')
    .version(false)
    .options('commit', {
      alias: 'c',
      type: 'string',
      description: 'React commit SHA from CodeSandbox (e.g. f696d31b)',
    })
    .options('owner', {
      default: defaultOwner,
      type: 'string',
      description: 'CodeSandbox repo owner',
    })
    .options('repo', {
      default: defaultRepo,
      type: 'string',
      description: 'CodeSandbox repo name',
    })
    .options('install', {
      default: true,
      type: 'boolean',
      description:
        'Run pnpm install and ncc-compiled after updating package.json',
    })
    .help()
    .parse()

  const commit = String(argv.commit ?? argv._[0] ?? '').trim()
  if (!commit) {
    throw new Error(
      'Missing commit SHA. Usage: pnpm sync-react-csb <commit> (e.g. f696d31b)'
    )
  }
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error(
      `Invalid commit SHA '${commit}'. Expected a 7-40 character hex string.`
    )
  }

  await sync({
    commit,
    owner: argv.owner,
    repo: argv.repo,
    install: argv.install,
  })

  console.log(
    `Successfully updated React packages to CodeSandbox commit ${argv.owner}/${argv.repo}@${commit}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
