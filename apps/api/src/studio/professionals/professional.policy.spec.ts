import { BadRequestException } from '@nestjs/common'
import { ProfessionalPolicy } from './professional.policy'

describe('ProfessionalPolicy', () => {
  const policy = new ProfessionalPolicy()

  it('rejects non-allowlisted fields on me', () => {
    expect(() => policy.assertMeAllowlist({ status: 'ACTIVE' })).toThrow(BadRequestException)
    expect(() => policy.assertMeAllowlist({ membershipId: 'x' })).toThrow(BadRequestException)
    expect(() => policy.assertMeAllowlist({ displayName: 'Ana' })).not.toThrow()
  })

  it('rejects linking RECEPTION', () => {
    expect(() => policy.assertCanLinkRole('RECEPTION')).toThrow(BadRequestException)
    expect(() => policy.assertCanLinkRole('PROFESSIONAL')).not.toThrow()
  })

  it('requires council or councilNotApplicable for ACTIVE', () => {
    expect(() =>
      policy.resolveActivation({
        displayName: 'Ana',
        requestedStatus: 'ACTIVE',
      }),
    ).toThrow(BadRequestException)

    expect(
      policy.resolveActivation({
        displayName: 'Ana',
        councilNotApplicable: true,
        requestedStatus: 'ACTIVE',
      }),
    ).toEqual({ status: 'ACTIVE', clearCouncil: true })

    expect(
      policy.resolveActivation({
        displayName: 'Ana',
        councilType: 'CREFITO',
        councilNumber: '123',
        councilState: 'SP',
        requestedStatus: 'ACTIVE',
      }),
    ).toEqual({ status: 'ACTIVE', clearCouncil: false })
  })

  it('limits specialties', () => {
    expect(() =>
      policy.assertSpecialties(Array.from({ length: 11 }, (_, i) => `s${i}`)),
    ).toThrow(BadRequestException)
    expect(policy.assertSpecialties(['Ortopedia', 'Livre custom'])).toEqual([
      'Ortopedia',
      'Livre custom',
    ])
  })
})
