'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { Form, Row, Col, Modal } from 'react-bootstrap'
import styles from './page.module.css'

type SupervisorRow = {
  id: number
  id_vendedor_externo: string
  nome: string | null
}

type Vendedor = {
  id: number
  id_vendedor_externo?: string | null
  nome: string
  email?: string | null
  telefone?: string | null
  tipo_acesso?: 'VENDEDOR' | 'TELEVENDAS' | null
  nivel_acesso?: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null
  senha?: string | null
  razao_social?: string | null
  endereco_razao?: string | null
  nome_representante?: string | null
  endereco_representante?: string | null
  cpf_representante?: string | null
  identidade_representante?: string | null
  conta_bancaria?: string | null
  pix?: string | null
  supervisor_responsavel_externo?: string | null
  /** Preenchido pela API quando há vínculo em Supervisores (sem campo explícito no vendedor). */
  supervisor_via_vinculo_externo?: string | null
  observacao?: string | null
}

function nivelLabel(n: Vendedor['nivel_acesso']) {
  if (!n) return '-'
  if (n === 'ADMINISTRADOR') return 'Administrador'
  if (n === 'SUPERVISOR') return 'Supervisor'
  return 'Operador'
}

export default function VendedoresPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Vendedor[]>([])
  const [supervisores, setSupervisores] = useState<SupervisorRow[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Vendedor | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState<string | ''>('')
  const [formTelefone, setFormTelefone] = useState('')
  const [formTipo, setFormTipo] = useState<'VENDEDOR' | 'TELEVENDAS' | ''>('')
  const [formNivel, setFormNivel] = useState<'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | ''>('')
  const [formRazaoSocial, setFormRazaoSocial] = useState('')
  const [formEnderecoRazao, setFormEnderecoRazao] = useState('')
  const [formNomeRepresentante, setFormNomeRepresentante] = useState('')
  const [formEnderecoRepresentante, setFormEnderecoRepresentante] = useState('')
  const [formCpf, setFormCpf] = useState('')
  const [formIdentidade, setFormIdentidade] = useState('')
  const [formContaBancaria, setFormContaBancaria] = useState('')
  const [formPix, setFormPix] = useState('')
  const [formSupervisorExterno, setFormSupervisorExterno] = useState('')
  const [formObservacao, setFormObservacao] = useState('')
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

  const loadSupervisores = async () => {
    try {
      const res = await fetch('/api/supervisores')
      const json = await res.json()
      if (json?.ok && Array.isArray(json.data)) {
        setSupervisores(
          json.data.map((s: any) => ({
            id: Number(s.id),
            id_vendedor_externo: String(s.id_vendedor_externo),
            nome: s.nome != null ? String(s.nome) : null,
          }))
        )
      }
    } catch {
      setSupervisores([])
    }
  }

  useEffect(() => {
    load()
    loadSupervisores()
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
    setFormRazaoSocial(v.razao_social || '')
    setFormEnderecoRazao(v.endereco_razao || '')
    setFormNomeRepresentante(v.nome_representante || '')
    setFormEnderecoRepresentante(v.endereco_representante || '')
    setFormCpf(v.cpf_representante || '')
    setFormIdentidade(v.identidade_representante || '')
    setFormContaBancaria(v.conta_bancaria || '')
    setFormPix(v.pix || '')
    setFormSupervisorExterno(
      String(v.supervisor_responsavel_externo || v.supervisor_via_vinculo_externo || '').trim()
    )
    setFormObservacao(v.observacao || '')
    setFormPassword((v as any).senha || '')
    setShowModal(true)
  }

  const onSave = async () => {
    if (!editing) return
    const payload: Record<string, unknown> = {
      id: editing.id,
      nome: formNome.trim(),
      email: formEmail.trim() || null,
      telefone: formTelefone.trim() || null,
      razao_social: formRazaoSocial.trim() || null,
      endereco_razao: formEnderecoRazao.trim() || null,
      nome_representante: formNomeRepresentante.trim() || null,
      endereco_representante: formEnderecoRepresentante.trim() || null,
      cpf_representante: formCpf.trim() || null,
      identidade_representante: formIdentidade.trim() || null,
      conta_bancaria: formContaBancaria.trim() || null,
      pix: formPix.trim() || null,
      supervisor_responsavel_externo: formSupervisorExterno.trim() || null,
      observacao: formObservacao.trim() || null,
    }
    if (editing.id_vendedor_externo) {
      payload.id_vendedor_externo = editing.id_vendedor_externo
      payload.tipo_acesso = formTipo ? formTipo : null
      payload.nivel_acesso = formNivel ? formNivel : null
    }
    if (formPassword) payload.password = formPassword

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
                      <td>{nivelLabel(v.nivel_acesso)}</td>
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

      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        centered
        scrollable
        dialogClassName={styles.wideDialog}
      >
        <Modal.Header closeButton>
          <Modal.Title>Editar vendedor</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>ID externo</Form.Label>
                <Form.Control type="text" disabled readOnly value={editing?.id_vendedor_externo || ''} />
              </Col>
              <Col md={8}>
                <Form.Label>Nome</Form.Label>
                <Form.Control type="text" value={formNome} onChange={(e) => setFormNome(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Telefone</Form.Label>
                <Form.Control
                  type="tel"
                  value={formTelefone}
                  onChange={(e) => setFormTelefone(e.target.value)}
                  placeholder="Opcional"
                  autoComplete="tel"
                />
              </Col>
              <Col md={12}>
                <Form.Label>Razão social</Form.Label>
                <Form.Control value={formRazaoSocial} onChange={(e) => setFormRazaoSocial(e.target.value)} />
              </Col>
              <Col md={12}>
                <Form.Label>Endereço da razão</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={formEnderecoRazao}
                  onChange={(e) => setFormEnderecoRazao(e.target.value)}
                />
              </Col>
              <Col md={6}>
                <Form.Label>Nome do representante</Form.Label>
                <Form.Control value={formNomeRepresentante} onChange={(e) => setFormNomeRepresentante(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>CPF</Form.Label>
                <Form.Control value={formCpf} onChange={(e) => setFormCpf(e.target.value)} placeholder="CPF do representante" />
              </Col>
              <Col md={12}>
                <Form.Label>Endereço do representante</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={formEnderecoRepresentante}
                  onChange={(e) => setFormEnderecoRepresentante(e.target.value)}
                />
              </Col>
              <Col md={6}>
                <Form.Label>Identidade (RG)</Form.Label>
                <Form.Control value={formIdentidade} onChange={(e) => setFormIdentidade(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Conta bancária</Form.Label>
                <Form.Control value={formContaBancaria} onChange={(e) => setFormContaBancaria(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>PIX</Form.Label>
                <Form.Control value={formPix} onChange={(e) => setFormPix(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Supervisor responsável</Form.Label>
                <Form.Select
                  value={formSupervisorExterno}
                  onChange={(e) => setFormSupervisorExterno(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {supervisores.map((s) => (
                    <option key={s.id} value={s.id_vendedor_externo}>
                      {s.nome ? `${s.nome} (${s.id_vendedor_externo})` : s.id_vendedor_externo}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Tipo de acesso</Form.Label>
                <Form.Select
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value as any)}
                  disabled={!editing?.id_vendedor_externo}
                >
                  <option value="">Nenhum (remove)</option>
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="TELEVENDAS">Televendas</option>
                </Form.Select>
                {!editing?.id_vendedor_externo && (
                  <Form.Text className="text-muted">ID externo necessário para tipo/nível.</Form.Text>
                )}
              </Col>
              <Col md={6}>
                <Form.Label>Nível de acesso</Form.Label>
                <Form.Select
                  value={formNivel}
                  onChange={(e) => setFormNivel(e.target.value as any)}
                  disabled={!editing?.id_vendedor_externo}
                >
                  <option value="">Nenhum (remove)</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                  <option value="OPERADOR">Operador</option>
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Text className="text-muted d-block mb-2">
                  Em tipo ou nível, use &quot;Nenhum (remove)&quot; para retirar o acesso já atribuído a este vendedor.
                </Form.Text>
              </Col>
              <Col md={12}>
                <Form.Label>Observação</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                />
              </Col>
              <Col md={12}>
                <Form.Label>Senha (preencher para permitir login)</Form.Label>
                <div className="input-group">
                  <Form.Control
                    type={showPassword ? 'text' : 'password'}
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
                <Form.Text className="text-muted">
                  Ao definir uma senha, este vendedor poderá acessar o sistema com e-mail e senha.
                </Form.Text>
              </Col>
            </Row>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Salvar
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
