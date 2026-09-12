import { PasswordHasherService } from './password-hasher.service'

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService('test-pepper-with-more-than-thirty-two-chars')

  it('hashes passwords without storing plaintext', async () => {
    const hash = await service.hash('CorrectHorse1Battery')

    expect(hash).not.toContain('CorrectHorse1Battery')
    expect(hash.startsWith('pbkdf2$210000$')).toBe(true)
    await expect(service.verify('CorrectHorse1Battery', hash)).resolves.toBe(true)
  })

  it('rejects wrong passwords', async () => {
    const hash = await service.hash('CorrectHorse1Battery')

    await expect(service.verify('WrongHorse1Battery', hash)).resolves.toBe(false)
  })

  it('fails when pepper differs', async () => {
    const hash = await service.hash('CorrectHorse1Battery')
    const other = new PasswordHasherService('another-pepper-with-more-than-thirty-two-chars')

    await expect(other.verify('CorrectHorse1Battery', hash)).resolves.toBe(false)
  })
})
