#!/usr/bin/env node
// @ts-check

/**
 * Posts (or updates) a sticky PR comment with install URLs for the preview
 * Next.js tarball published to pkg.pr.new.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const MARKER = '<!-- preview-next-install -->'
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

async function main() {
  const prNumber = requiredEnv('PR_NUMBER')
  const headSha = requiredEnv('HEAD_SHA')
  const repo = requiredEnv('GITHUB_REPOSITORY')
  const token = requiredEnv('GITHUB_TOKEN')

  const rootPkg = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8')
  )
  const reactUrl = rootPkg.devDependencies['react-builtin']
  const reactDomUrl = rootPkg.devDependencies['react-dom-builtin']
  const nextUrl = `https://pkg.pr.new/${repo}/next@${headSha}`

  const body = `${MARKER}
## Preview Next.js build

Install this PR's Next.js (vendored with the fork's React) in an app:

\`\`\`json
{
  "dependencies": {
    "next": "${nextUrl}",
    "react": "${reactUrl}",
    "react-dom": "${reactDomUrl}"
  }
}
\`\`\`

\`\`\`bash
pnpm add ${nextUrl} ${reactUrl} ${reactDomUrl}
\`\`\`

This preview keeps official \`@next/swc-*\` binaries from npm (same Next version). Your CodeSandbox React CI does not publish \`react-server-dom-turbopack\`, so use webpack until it does:

\`\`\`bash
next dev --webpack
next build --webpack
\`\`\`

Install the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new) on this repo if publishing fails.
`

  const ghEnv = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token }
  const comments = JSON.parse(
    execFileSync(
      'gh',
      ['api', `repos/${repo}/issues/${prNumber}/comments`, '--paginate'],
      { encoding: 'utf8', env: ghEnv }
    )
  )

  const existing = comments.find(
    (comment) =>
      typeof comment?.body === 'string' && comment.body.includes(MARKER)
  )

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'preview-next-comment-'))
  const bodyFile = path.join(tmpDir, 'body.md')
  await writeFile(bodyFile, body)

  if (existing) {
    execFileSync(
      'gh',
      [
        'api',
        `repos/${repo}/issues/comments/${existing.id}`,
        '-X',
        'PATCH',
        '-F',
        `body=@${bodyFile}`,
      ],
      { stdio: 'inherit', env: ghEnv }
    )
    return
  }

  execFileSync('gh', ['pr', 'comment', prNumber, '--body-file', bodyFile], {
    stdio: 'inherit',
    env: ghEnv,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
