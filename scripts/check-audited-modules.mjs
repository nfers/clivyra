#!/usr/bin/env node
/**
 * Ensures sensitive module controllers audit mutations (CLI-14).
 *
 * For directories in SENSITIVE_MODULES, every controller with POST|PATCH|PUT|DELETE
 * handlers must use @Audited or the sibling service must import AuditService.
 *
 * Allowlist a file with: // audit: not-required <reason>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_SRC = path.join(ROOT, 'apps/api/src')

const SENSITIVE_MODULES = ['clinical-record', 'finance', 'users', 'consent', 'professionals', 'lgpd']

const MUTATION = /@(Post|Patch|Put|Delete)\b/
const AUDITED = /@Audited\b|AuditService/
const ALLOW = /audit:\s*not-required\b/

/** @type {string[]} */
const violations = []

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.controller.ts')) continue
    checkController(full)
  }
}

function checkController(file) {
  const relative = path.relative(ROOT, file)
  const parts = relative.split(path.sep)
  const moduleName = parts[3] // apps/api/src/<module>/...
  if (!SENSITIVE_MODULES.includes(moduleName)) return

  const content = fs.readFileSync(file, 'utf8')
  if (ALLOW.test(content)) return
  if (!MUTATION.test(content)) return

  if (AUDITED.test(content)) return

  // Sibling *service.ts in the same directory (or parent module dir) must import AuditService.
  const dir = path.dirname(file)
  const serviceFiles = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.service.ts'))
    .map((name) => path.join(dir, name))

  const moduleRoot = path.join(API_SRC, moduleName)
  if (fs.existsSync(moduleRoot)) {
    for (const entry of fs.readdirSync(moduleRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.service.ts')) {
        serviceFiles.push(path.join(moduleRoot, entry.name))
      }
    }
  }

  const hasAuditService = serviceFiles.some((servicePath) => {
    if (!fs.existsSync(servicePath)) return false
    return /AuditService/.test(fs.readFileSync(servicePath, 'utf8'))
  })

  if (!hasAuditService) {
    violations.push(relative)
  }
}

for (const moduleName of SENSITIVE_MODULES) {
  walk(path.join(API_SRC, moduleName))
}

if (violations.length > 0) {
  console.error('check-audited-modules: mutations in sensitive modules lack @Audited / AuditService:')
  for (const file of violations) {
    console.error(`  ${file}`)
  }
  process.exit(1)
}

console.log('check-audited-modules: ok')
