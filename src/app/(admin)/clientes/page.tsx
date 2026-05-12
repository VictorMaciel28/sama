"use client"

import { useEffect, useMemo, useState } from 'react'

type Cliente = {
  id: number
  external_id: string
  nome: string
  fantasia?: string | null
  cidade?: string | null
  estado?: string | null
  fone?: string | null
  email?: string | null
  cpf_cnpj?: string | null
  nome_vendedor?: string | null
  vendedor?: { id: number; nome: string | null } | null
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  const load = async (targetPage = page) => {
    setLoading(true)
    try {
      const offset = (targetPage - 1) * limit
      const qParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''
      const res = await fetch(`/api/clientes?limit=${limit}&offset=${offset}${qParam}`)
      const json = await res.json()
      if (json?.ok) {
        setClientes(json.data || [])
        setTotal(Number(json?.paginacao?.total || 0))
      }
    } catch (e) {
      // noop
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(page)
  }, [page, query])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      setQuery(queryInput)
    }, 1000)
    return () => clearTimeout(t)
  }, [queryInput])

  const onSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/clientes/sync', { method: 'POST' })
      const json = await res.json()
      if (json?.ok) {
        await load(page)
        alert(`Atualização concluída. Inseridos: ${json.imported}, Atualizados: ${json.updated}`)
      } else {
        alert(json?.error ?? 'Falha ao atualizar')
      }
    } catch (err: any) {
      alert('Falha ao atualizar clientes.')
    } finally {
      setSyncing(false)
    }
  }

  const rows = useMemo(() => clientes, [clientes])
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const canPrev = page > 1
  const canNext = page < totalPages
  const shownCount = rows.length

  return (
    <div className="p-3">
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h2 className="m-0">Clientes</h2>
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small me-1">
                Mostrando {shownCount} de {total}
              </span>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || loading}
              >
                Anterior
              </button>
              <select
                className="form-select form-select-sm"
                style={{ width: 110 }}
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
                disabled={loading}
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    Página {p}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => canNext && setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!canNext || loading}
              >
                Próxima
              </button>
              {/* Botão “Atualizar Clientes” (Tiny) — temporariamente desativado
              <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
                {syncing ? 'Atualizando...' : 'Atualizar Clientes'}
              </button>
              */}
            </div>
          </div>

          <div className="mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Filtrar por descrição (nome do cliente)"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
          </div>

          {loading ? (
            <div>Carregando...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Fantasia</th>
                    <th>CPF/CNPJ</th>
                    <th>Cidade/UF</th>
                    <th>Telefone</th>
                    <th>Email</th>
                    <th>Vendedor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.external_id}</td>
                      <td>{c.nome}</td>
                      <td>{c.fantasia ?? '-'}</td>
                      <td>{c.cpf_cnpj ?? '-'}</td>
                      <td>
                        {c.cidade ?? '-'} {c.estado ? `/${c.estado}` : ''}
                      </td>
                      <td>{c.fone ?? '-'}</td>
                      <td>{c.email ?? '-'}</td>
                      <td>{c.vendedor?.nome ?? c.nome_vendedor ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


