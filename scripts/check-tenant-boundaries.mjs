#!/usr/bin/env node
/**
 * Heuristic tenant-boundary check (CLI-11).
 * Fails when tenantId appears to be accepted from client-controlled input.
 *
 * Allowlist a line with: // tenant-boundary: allow <reason>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_SRC = path.join(ROOT, 'apps/api/src')

const ALLOW = /tenant-boundary:\s*allow\b/

/** @type {{ file: string, line: number, text: string, rule: string }[]} */
const violations = []

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    // Test support intentionally accepts tenantId to prove rejection.
    if (full.includes(`${path.sep}test-support${path.sep}`)) continue
    scanFile(full)
  }
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)
  const relative = path.relative(ROOT, file)
  const isDto = /\.dto\.ts$/.test(file)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (ALLOW.test(line)) continue

    if (isDto && /\btenantId\b/.test(line)) {
      violations.push({ file: relative, line: index + 1, text: line.trim(), rule: 'dto-tenantId' })
    }

    if (/@(Query|Param|Body)\([^)]*tenantId/.test(line) || /@(Query|Param|Body)\(\s*['"]tenantId['"]/.test(line)) {
      violations.push({ file: relative, line: index + 1, text: line.trim(), rule: 'decorator-tenantId' })
    }

    if (/@Headers\(\s*['"]x-tenant/.test(line)) {
      violations.push({ file: relative, line: index + 1, text: line.trim(), rule: 'header-tenant' })
    }
  }
}

walk(API_SRC)

if (violations.length > 0) {
  console.error('check-tenant-boundaries: violations found')
  for (const item of violations) {
    console.error(`  ${item.file}:${item.line} [${item.rule}] ${item.text}`)
  }
  process.exit(1)
}

console.log('check-tenant-boundaries: ok')
