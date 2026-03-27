'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Row = {
  id: number
  id_vendedor_externo?: string | null
  nome: string
  email?: string | null
  telefone?: string | null
  tipo_acesso?: 'VENDEDOR' | 'TELEVENDAS' | null
  nivel_acesso?: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null
}

function nivelLabel(n: Row['nivel_acesso']) {
  if (!n) return '-'
  if (n === 'ADMINISTRADOR') return 'Administrador'
  if (n === 'SUPERVISOR') return 'Supervisor'
  return 'Operador'
}

export default function SupervisorVendedoresPage() {
  const params = useParams()
  const router = useRouter()
  const externo = decodeURIComponent((params?.externo as string) || '')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!externo) {
      setError('ID externo inválido')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/supervisor/${encodeURIComponent(externo)}/vendedores`)
        const json = await res.json()
        if (cancelled) return
        if (!json?.ok) {
          setError(json?.error || 'Falha ao carregar')
          setRows([])
          return
        }
        setRows(json.data || [])
      } catch {
        if (!cancelled) setError('Erro ao carregar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [externo])

  const data = useMemo(() => rows, [rows])

  return (
    <div className="p-3">
      <h2 className="mb-3">Supervisão • Vendedores</h2>
      <p className="text-muted small mb-3">
        Vendedores vinculados a você na supervisão (mesma base da lista em Administração, filtrada).
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>ID externo</th>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Telefone</th>
                    <th>Tipo de acesso</th>
                    <th>Nível de acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => (
                    <tr
                      key={v.id}
                      style={{ cursor: v.id_vendedor_externo ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!v.id_vendedor_externo) return
                        router.push(`/vendedores/${encodeURIComponent(v.id_vendedor_externo)}`)
                      }}
                    >
                      <td>{v.id_vendedor_externo ?? '-'}</td>
                      <td>{v.nome}</td>
                      <td>{v.email ?? '-'}</td>
                      <td>{v.telefone ?? '-'}</td>
                      <td>{v.tipo_acesso ? (v.tipo_acesso === 'TELEVENDAS' ? 'Televendas' : 'Vendedor') : '-'}</td>
                      <td>{nivelLabel(v.nivel_acesso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && !error && (
                <div className="text-muted small p-2">Nenhum vendedor supervisionado.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
