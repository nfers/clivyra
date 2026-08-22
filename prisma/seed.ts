import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.systemMetadata.upsert({
    where: { key: 'bootstrap.version' },
    create: { key: 'bootstrap.version', value: '0.1.0' },
    update: { value: '0.1.0' },
  })
}

void main()
  .catch((error: unknown) => {
    console.error('Database seed failed', error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
