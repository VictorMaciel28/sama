"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import IconifyIcon from '@/components/wrappers/IconifyIcon'

type Vendedor = {
  id: number
  id_vendedor_externo?: string | null
  nome: string
  email?: string | null
  telefone?: string | null
  tipo_acesso?: 'VENDEDOR' | 'TELEVENDAS' | null
  nivel_acesso?: 'SUPERVISOR' | 'ADMINISTRADOR' | null
  senha?: string | null
}

export default function VendedoresPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Vendedor | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState<string | ''>('')
  const [formTelefone, setFormTelefone] = useState('')
  const [formTipo, setFormTipo] = useState<'VENDEDOR' | 'TELEVENDAS' | ''>('')
  const [formNivel, setFormNivel] = useState<'SUPERVISOR' | 'ADMINISTRADOR' | ''>('')
  const [formPassword, setFormPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendedores')
      const json = await res.json()
      if (json?.ok) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/vendedores/sync', { method: 'POST' })
      const json = await res.json()
      if (json?.ok) {
        await load()
        alert(`Atualização concluída. Inseridos: ${json.imported}`)
      } else {
        alert(json?.error ?? 'Falha ao atualizar vendedores')
      }
    } finally {
      setSyncing(false)
    }
  }

  const data = useMemo(() => rows, [rows])
  const totalVendedores = rows.length

  const openEdit = (v: Vendedor) => {
    setEditing(v)
    setFormNome(v.nome || '')
    setFormEmail(v.email || '')
    setFormTelefone(v.telefone || '')
    setFormTipo((v.tipo_acesso as any) || '')
    setFormNivel((v.nivel_acesso as any) || '')
    setFormPassword((v as any).senha || '')
    setShowModal(true)
  }

  const onSave = async () => {
    if (!editing) return
    const payload: any = {
      id: editing.id,
      nome: formNome.trim(),
      email: formEmail.trim() || null,
      telefone: formTelefone.trim() || null,
    }
    if (editing.id_vendedor_externo) {
      payload.id_vendedor_externo = editing.id_vendedor_externo
      if (formTipo) payload.tipo_acesso = formTipo
      if (formNivel) payload.nivel_acesso = formNivel
      if (formPassword) payload.password = formPassword
    }
    const res = await fetch('/api/vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!json?.ok) {
      alert(json?.error ?? 'Falha ao salvar')
      return
    }
    setShowModal(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="p-3">
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h2 className="m-0">Vendedores</h2>
            <div className="d-flex align-items-center gap-3">
              <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
                {syncing ? 'Atualizando...' : 'Atualizar Vendedores'}
              </button>
              <small className="text-muted mb-0">Total de vendedores: {totalVendedores}</small>
            </div>
          </div>

          {loading ? (
            <div>Carregando...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>ID Externo</th>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Telefone</th>
                      <th>Tipo de Acesso</th>
                    <th>Nível de Acesso</th>
                    <th style={{ width: 1 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => (
                    <tr
                      key={v.id}
                      style={{ cursor: v.id_vendedor_externo ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!v.id_vendedor_externo) return
                        router.push(`/vendedores/${v.id_vendedor_externo}`)
                      }}
                    >
                      <td>{v.id_vendedor_externo ?? '-'}</td>
                      <td>{v.nome}</td>
                      <td>{v.email ?? '-'}</td>
                      <td>{v.telefone ?? '-'}</td>
                      <td>{v.tipo_acesso ? (v.tipo_acesso === 'TELEVENDAS' ? 'Televendas' : 'Vendedor') : '-'}</td>
                      <td>{v.nivel_acesso ? (v.nivel_acesso === 'ADMINISTRADOR' ? 'Administrador' : 'Supervisor') : '-'}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEdit(v)
                          }}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Editar Vendedor</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setShowModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">ID Externo</label>
                  <input
                    type="text"
                    className="form-control"
                    disabled
                    value={editing?.id_vendedor_externo || ''}
                    readOnly
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Nome</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Telefone</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    placeholder="Opcional"
                    autoComplete="tel"
                  />
                  <small className="text-muted">Campo opcional para contato do vendedor.</small>
                </div>
                <div className="mb-3">
                  <label className="form-label">Tipo de Acesso</label>
                  <select
                    className="form-select"
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as any)}
                    disabled={!editing?.id_vendedor_externo}
                  >
                    <option value="">-</option>
                    <option value="VENDEDOR">Vendedor</option>
                    <option value="TELEVENDAS">Televendas</option>
                  </select>
                  {!editing?.id_vendedor_externo && (
                    <small className="text-muted">
                      Defina um ID Externo para relacionar o tipo.
                    </small>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Nível de Acesso</label>
                  <select
                    className="form-select"
                    value={formNivel}
                    onChange={(e) => setFormNivel(e.target.value as any)}
                    disabled={!editing?.id_vendedor_externo}
                  >
                    <option value="">-</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                  </select>
                  {!editing?.id_vendedor_externo && (
                    <small className="text-muted">
                      Defina um ID Externo para relacionar o nível.
                    </small>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Senha (preencher para permitir login)</label>
                  <div className="input-group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Deixe em branco para não alterar"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowPassword((s) => !s)}
                    >
                      <IconifyIcon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} className="fs-18" />
                    </button>
                  </div>
                  <small className="text-muted">Ao definir uma senha, este vendedor poderá acessar o sistema usando o e-mail e a senha.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={onSave}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


