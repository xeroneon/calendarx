#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderAll, type MobileWrapperConfig, CLOUD_EXAMPLE, MTG_FREE_EXAMPLE, CALENDARX_EXAMPLE } from './index.js'

const USAGE = `xeroneon-mobile-wrap - generate a reusable Capacitor Android wrapper for a web app

USAGE:
  xeroneon-mobile-wrap --example cloud|mtg|calendarx
      Write cloud.config.ts / mtg.config.ts / calendarx.config.ts + the rendered
      artifacts to ./out/ for the pre-baked reference configs.

  xeroneon-mobile-wrap --out <dir> <config.json>
      Render capacitor.config.ts, release-android.yml and README from a JSON file
      matching MobileWrapperConfig into <dir>.

The JSON config shape (all fields required):
{
  "appId": "dev.acme.app", "appName": "Acme", "shape": "monorepo"|"single",
  "webDir": "../web/dist/client", "originEnv": "ACME_ANDROID_ORIGIN",
  "defaultOrigin": "https://app.acme.dev", "buildWebCommand": "pnpm --filter \\"@acme/web...\\" build",
  "installCommand": "pnpm install --frozen-lockfile", "apkPrefix": "acme",
  "sourceRepo": "acme/app", "publicReleaseRepo": "acme/app-releases",
  "wrapperDir": "apps/mobile", "versionPkgJson": "./apps/web/package.json",
  "capSyncDir": "apps/mobile"
}`

interface CliArgs {
  example?: 'cloud' | 'mtg' | 'calendarx'
  configFile?: string
  outDir: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { outDir: './out' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.outDir = argv[++i]!
    else if (a === '--example') args.example = argv[++i]! as CliArgs['example']
    else if (a === '--help' || a === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else args.configFile = a
  }
  if (!args.example && !args.configFile) {
    console.error('error: expected --example <cloud|mtg> OR a <config.json> path')
    console.error(USAGE)
    process.exit(1)
  }
  return args
}

function configFromArgs(args: CliArgs): MobileWrapperConfig {
  if (args.example) {
    if (args.example === 'cloud') return CLOUD_EXAMPLE
    if (args.example === 'mtg') return MTG_FREE_EXAMPLE
    if (args.example === 'calendarx') return CALENDARX_EXAMPLE
    console.error(`error: unknown example '${args.example}' (expected cloud|mtg|calendarx)`)
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(args.configFile!, 'utf8')) as MobileWrapperConfig
  return raw
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const cfg = configFromArgs(args)

  const out = renderAll(cfg)
  mkdirSync(args.outDir, { recursive: true })
  const files: Array<[string, string]> = [
    ['capacitor.config.ts', out.capacitorConfig],
    ['release-android.yml', out.releaseWorkflow],
    ['README.md', out.runbook],
  ]
  for (const [name, content] of files) {
    const path = join(args.outDir, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    console.log(`wrote ${path}`)
  }
  console.log(`\nGenerated wrap for '${cfg.appName}' (${cfg.shape}).`)
  console.log(`Next: commit android/ (npx cap add android in ${cfg.wrapperDir}), add CI secrets,`)
  console.log(`seed the public repo ${cfg.publicReleaseRepo}, then push a v* tag to release.`)
}

main()