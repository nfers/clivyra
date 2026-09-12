#!/usr/bin/env node
/**
 * Ensures domain modules that hold data-subject PII register LGPD exporter + anonymizer.
 *
 * SUBJECT_DATA_MODULES lists module directory names under apps/api/src that must
 * call LgpdRegistry.registerExporter / registerAnonymizer when the module exists.
 * Empty list today (patients/leads/clinical/finance/documents not yet present).
 * `users` is registered by LgpdModule itself.
 *
 * When adding a module to SUBJECT_DATA_MODULES, also ensure its *module.ts registers ports.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_SRC = path.join(ROOT, 'apps/api/src')

/** Future modules that hold titular data — add names when directories are created. */
const SUBJECT_DATA_MODULES = [
  // 'patients',
  // 'leads',
  // 'clinical-record',
  // 'finance',
  // 'documents',
]

const REGISTER_EXPORTER = /registerExporter\s*\(/
const REGISTER_ANONYMIZER = /registerAnonymizer\s*\(/

/** @type {string[]} */
const violations = []

for (const moduleName of SUBJECT_DATA_MODULES) {
  const dir = path.join(API_SRC, moduleName)
  if (!fs.existsSync(dir)) {
    // Module not implemented yet — skip (list documents intent).
    continue
  }

  /** @type {string[]} */
  const files = []
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(full)
    }
  }
  walk(dir)

  const contents = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  if (!REGISTER_EXPORTER.test(contents)) {
    violations.push(`${moduleName}: missing registerExporter`)
  }
  if (!REGISTER_ANONYMIZER.test(contents)) {
    violations.push(`${moduleName}: missing registerAnonymizer`)
  }
}

if (violations.length > 0) {
  console.error('check-lgpd-ports: modules with subject data must register LGPD ports:')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log(
  `check-lgpd-ports: ok (${SUBJECT_DATA_MODULES.filter((m) => fs.existsSync(path.join(API_SRC, m))).length} modules enforced)`,
)
