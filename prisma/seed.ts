import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.systemMetadata.upsert({
    where: { key: 'bootstrap.version' },
    create: { key: 'bootstrap.version', value: '0.1.0' },
    update: { value: '0.1.0' },
  })

  const seedTenantSlug = process.env.SEED_TENANT_SLUG ?? 'studio-vega'
  const seedTenantName = process.env.SEED_TENANT_NAME ?? 'Studio Vega'
  const seedAdminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'owner@studio-vega.test').trim().toLowerCase()
  const seedAdminName = process.env.SEED_ADMIN_NAME ?? 'Owner Vega'
  const seedAdminPasswordHash = process.env.SEED_ADMIN_PASSWORD_HASH

  const tenant = await prisma.tenant.upsert({
    where: { slug: seedTenantSlug },
    create: { slug: seedTenantSlug, name: seedTenantName },
    update: { name: seedTenantName, isActive: true },
  })

  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    create: {
      email: seedAdminEmail,
      name: seedAdminName,
      passwordHash: seedAdminPasswordHash,
    },
    update: {
      name: seedAdminName,
      ...(seedAdminPasswordHash ? { passwordHash: seedAdminPasswordHash } : {}),
      isActive: true,
    },
  })

  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: admin.id,
      },
    },
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: 'OWNER',
    },
    update: {
      role: 'OWNER',
      isActive: true,
    },
  })

  // CLI-15: draft consent templates for OWNER review (legal review required before production)
  const templates: Array<{ type: 'PRIVACY_POLICY' | 'DATA_PROCESSING'; title: string; content: string }> = [
    {
      type: 'PRIVACY_POLICY',
      title: 'Política de Privacidade',
      content:
        '# Política de Privacidade\n\nTexto-modelo genérico. **Revisão jurídica obrigatória** antes do uso em produção comercial.\n\nEste studio trata dados pessoais para prestação de serviços de saúde e bem-estar, conforme a LGPD.',
    },
    {
      type: 'DATA_PROCESSING',
      title: 'Termo de Tratamento de Dados de Saúde',
      content:
        '# Termo de Tratamento de Dados\n\nTexto-modelo genérico. **Revisão jurídica obrigatória** antes do uso em produção comercial.\n\nConsentimento para tratamento de dados de saúde (art. 11 LGPD) no âmbito do atendimento.',
    },
  ]

  for (const template of templates) {
    const existing = await prisma.consentTerm.findFirst({
      where: { tenantId: tenant.id, type: template.type, status: 'DRAFT', version: 0 },
    })
    if (!existing) {
      await prisma.consentTerm.create({
        data: {
          tenantId: tenant.id,
          type: template.type,
          version: 0,
          title: template.title,
          content: template.content,
          contentHash: '',
          purposes: template.type === 'PRIVACY_POLICY' ? ['operacao', 'comunicacao'] : ['prontuario', 'atendimento'],
          legalBasis: 'CONSENT',
          status: 'DRAFT',
          createdByUserId: admin.id,
        },
      })
    }
  }
}

void main()
  .catch(() => {
    console.error('Database seed failed')
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
