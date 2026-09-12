'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { canAssignRole, type Role } from '@clivyra/types'
import { usePermissions, useSession } from '../../../../../lib/session/SessionProvider'

type UserRow = {
  membershipId: string
  userId: string
  name: string
  email: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

type InvitationRow = {
  id: string
  email: string
  role: Role
  status: string
  expiresAt: string
  invitedBy: { name: string }
}

const ALL_ROLES: Role[] = ['OWNER', 'ADMIN', 'PROFESSIONAL', 'RECEPTION']

export default function UsersSettingsPage() {
  const session = useSession()
  const { can, role, refreshPermissions } = usePermissions()
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active')
  const [users, setUsers] = useState<UserRow[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('RECEPTION')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const assignableRoles = useMemo(
    () => (role ? ALL_ROLES.filter((item) => canAssignRole(role, item)) : []),
    [role],
  )

  async function load() {
    setError(null)
    const [usersRes, invitationsRes] = await Promise.all([
      fetch(`/api/users?status=${statusFilter}`),
      fetch('/api/users/invitations?status=PENDING'),
    ])
    if (usersRes.status === 403 || invitationsRes.status === 403) {
      setError('Acesso negado. Você não tem permissão para gerenciar usuários.')
      await refreshPermissions()
      return
    }
    if (!usersRes.ok) {
      setError('Não foi possível carregar os usuários.')
      return
    }
    setUsers((await usersRes.json()) as UserRow[])
    if (invitationsRes.ok) {
      setInvitations((await invitationsRes.json()) as InvitationRow[])
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  if (!can('users:read')) {
    return (
      <section className="settings-page" aria-labelledby="users-denied-title">
        <h2 id="users-denied-title">Acesso negado</h2>
        <p>Você não tem permissão para ver os usuários deste studio.</p>
        <p>
          <Link href="/app">Voltar ao painel</Link>
        </p>
      </section>
    )
  }

  async function invite(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/users/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role: inviteRole }),
    })
    setPending(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.message ?? 'Não foi possível enviar o convite.')
      if (response.status === 403) await refreshPermissions()
      return
    }
    setEmail('')
    await load()
  }

  async function changeRole(membershipId: string, nextRole: Role) {
    if (!window.confirm('Alterar o papel deste usuário?')) return
    setPending(true)
    const response = await fetch(`/api/users/${membershipId}/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    setPending(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.message ?? 'Não foi possível alterar o papel.')
      return
    }
    await load()
  }

  async function toggleActive(row: UserRow) {
    const action = row.isActive ? 'deactivate' : 'activate'
    if (!window.confirm(row.isActive ? 'Desativar este usuário?' : 'Reativar este usuário?')) return
    setPending(true)
    const response = await fetch(`/api/users/${row.membershipId}/${action}`, { method: 'POST' })
    setPending(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.message ?? 'Não foi possível atualizar o status.')
      return
    }
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="users-title">
      <h2 id="users-title">Usuários</h2>
      <p className="auth-lead">Gerencie acesso, papéis e convites do studio {session?.tenant.name}.</p>

      <div className="settings-toolbar">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'active' | 'inactive')}
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="user-list">
        {users.map((row) => {
          const isSelf = row.membershipId === session?.membership.id
          return (
            <li key={row.membershipId}>
              <div>
                <strong>{row.name}</strong>
                <span>{row.email}</span>
                <span>
                  {row.role} · {row.isActive ? 'ativo' : 'inativo'}
                </span>
              </div>
              {can('users:write') && !isSelf ? (
                <div className="user-actions">
                  <select
                    aria-label={`Papel de ${row.name}`}
                    value={row.role}
                    disabled={pending}
                    onChange={(event) => void changeRole(row.membershipId, event.target.value as Role)}
                  >
                    {ALL_ROLES.filter((item) => canAssignRole(role!, item) || item === row.role).map(
                      (item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ),
                    )}
                  </select>
                  <button type="button" className="ghost-button" disabled={pending} onClick={() => void toggleActive(row)}>
                    {row.isActive ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {can('users:write') ? (
        <>
          <h3>Convidar</h3>
          <form className="auth-form" onSubmit={(event) => void invite(event)}>
            <label htmlFor="invite-email">E-mail</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="invite-role">Papel</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as Role)}
            >
              {assignableRoles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending || assignableRoles.length === 0}>
              Enviar convite
            </button>
          </form>

          <h3>Convites pendentes</h3>
          <ul className="user-list">
            {invitations.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.email}</strong>
                  <span>
                    {row.role} · expira {new Date(row.expiresAt).toLocaleString('pt-BR')}
                  </span>
                  <span>por {row.invitedBy.name}</span>
                </div>
                <div className="user-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={pending}
                    onClick={async () => {
                      setPending(true)
                      await fetch(`/api/users/invitations/${row.id}/resend`, { method: 'POST' })
                      setPending(false)
                      await load()
                    }}
                  >
                    Reenviar
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={pending}
                    onClick={async () => {
                      if (!window.confirm('Cancelar este convite?')) return
                      setPending(true)
                      await fetch(`/api/users/invitations/${row.id}`, { method: 'DELETE' })
                      setPending(false)
                      await load()
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
