'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SPECIALTIES, WEEKDAYS } from '@clivyra/types'
import { usePermissions, useSession } from '../../../lib/session/SessionProvider'

type OnboardingStatus = {
  completed: boolean
  steps: { studio: boolean; professional: boolean; workingHours: boolean }
}

const HOUR_PRESET = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: '08:00',
  endTime: '18:00',
}))

export default function OnboardingPage() {
  const router = useRouter()
  const session = useSession()
  const { can } = usePermissions()
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')

  const [proName, setProName] = useState('')
  const [councilNumber, setCouncilNumber] = useState('')
  const [councilState, setCouncilState] = useState('SP')
  const [specialties, setSpecialties] = useState<string[]>(['Pilates clínico'])
  const [skipProfessional, setSkipProfessional] = useState(false)

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/tenant/onboarding')
      if (!response.ok) return
      const body = (await response.json()) as OnboardingStatus
      setStatus(body)
      if (body.completed) router.replace('/app')
    })()
  }, [router])

  if (!can('settings:write')) {
    return (
      <section className="settings-page">
        <h2>Onboarding</h2>
        <p>Apenas OWNER/ADMIN configuram o studio neste fluxo.</p>
      </section>
    )
  }

  async function saveStudio(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/tenant/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, phone, timezone }),
    })
    setPending(false)
    if (!response.ok) {
      setError('Não foi possível salvar o studio.')
      return
    }
    setStep(1)
  }

  async function saveProfessional(event: FormEvent) {
    event.preventDefault()
    if (skipProfessional) {
      setStep(2)
      return
    }
    setPending(true)
    setError(null)
    const me = await fetch('/api/professionals/me')
    if (me.status === 404) {
      const created = await fetch('/api/professionals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: proName,
          councilType: 'CREFITO',
          councilNumber,
          councilState,
          specialties,
          status: 'ACTIVE',
          membershipId: session?.membership.id,
        }),
      })
      setPending(false)
      if (!created.ok) {
        setError('Não foi possível criar o perfil profissional.')
        return
      }
    } else if (me.ok) {
      const patched = await fetch('/api/professionals/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: proName,
          councilType: 'CREFITO',
          councilNumber,
          councilState,
          specialties,
        }),
      })
      setPending(false)
      if (!patched.ok) {
        setError('Não foi possível atualizar o perfil.')
        return
      }
    } else {
      setPending(false)
      setError('Não foi possível carregar o perfil.')
      return
    }
    setStep(2)
  }

  async function saveHours(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const hours = await fetch('/api/working-hours', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: HOUR_PRESET }),
    })
    if (!hours.ok) {
      setPending(false)
      setError('Não foi possível salvar os horários.')
      return
    }
    const complete = await fetch('/api/tenant/onboarding/complete', { method: 'POST' })
    setPending(false)
    if (!complete.ok) {
      setError('Pré-requisitos incompletos para concluir o onboarding.')
      return
    }
    router.replace('/app')
  }

  return (
    <section className="settings-page" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Configuração inicial</h2>
      <p>Passo {step + 1} de 3 — studio, perfil e horários.</p>
      {error ? <p role="alert">{error}</p> : null}

      {step === 0 ? (
        <form onSubmit={(event) => void saveStudio(event)}>
          <label>
            Nome do studio
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} />
          </label>
          <label>
            Telefone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            Fuso horário
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
              <option value="America/Manaus">America/Manaus</option>
              <option value="America/Fortaleza">America/Fortaleza</option>
            </select>
          </label>
          <button type="submit" disabled={pending}>
            Continuar
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <form onSubmit={(event) => void saveProfessional(event)}>
          <label>
            <input
              type="checkbox"
              checked={skipProfessional}
              onChange={(e) => setSkipProfessional(e.target.checked)}
            />{' '}
            Não atendo pacientes (pular)
          </label>
          {!skipProfessional ? (
            <>
              <label>
                Seu nome profissional
                <input value={proName} onChange={(e) => setProName(e.target.value)} required minLength={2} />
              </label>
              <label>
                CREFITO
                <input value={councilNumber} onChange={(e) => setCouncilNumber(e.target.value)} required />
              </label>
              <label>
                UF
                <input value={councilState} onChange={(e) => setCouncilState(e.target.value)} maxLength={2} required />
              </label>
              <fieldset>
                <legend>Especialidades</legend>
                {SPECIALTIES.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={specialties.includes(item)}
                      onChange={(e) => {
                        setSpecialties((prev) =>
                          e.target.checked ? [...prev, item] : prev.filter((value) => value !== item),
                        )
                      }}
                    />{' '}
                    {item}
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}
          <button type="submit" disabled={pending}>
            Continuar
          </button>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={(event) => void saveHours(event)}>
          <p>Preset: segunda a sexta, 08:00–18:00</p>
          <ul>
            {HOUR_PRESET.map((entry) => (
              <li key={entry.weekday}>
                {WEEKDAYS.find((day) => day.value === entry.weekday)?.label}: {entry.startTime}–{entry.endTime}
              </li>
            ))}
          </ul>
          <button type="submit" disabled={pending}>
            Concluir
          </button>
        </form>
      ) : null}

      {status && !status.completed ? (
        <p className="auth-lead">Você pode retomar este onboarding a qualquer momento.</p>
      ) : null}
    </section>
  )
}
