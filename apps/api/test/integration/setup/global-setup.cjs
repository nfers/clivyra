const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for integration tests')
  }

  const schemaPath = path.resolve(__dirname, '../../../../../prisma/schema.prisma')
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPath], {
    stdio: 'inherit',
    env: process.env,
  })
}
