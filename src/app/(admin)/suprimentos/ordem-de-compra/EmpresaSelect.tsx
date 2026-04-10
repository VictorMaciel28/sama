'use client'

import { useId } from 'react'
import { Dropdown } from 'react-bootstrap'
import { EMPRESAS_SUPRIMENTOS } from '@/constants/empresas-suprimentos'

type Props = {
  value: string
  onChange: (id: string) => void
  /** Ex.: filtro “Todas as empresas”. */
  allowEmpty?: boolean
  emptyLabel?: string
  /** `sm` = filtro da listagem; padrão = mesmo tamanho do `Form.Select` do formulário. */
  size?: 'sm'
  className?: string
}

export function EmpresaSelect({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Todas',
  size,
  className = 'w-100',
}: Props) {
  const toggleId = useId()
  const selected = EMPRESAS_SUPRIMENTOS.find((e) => e.id === value)

  return (
    <Dropdown className={className}>
      {/*
        `as="button"` evita o Button do RB (btn + outline roxo).
        `form-select` deixa o mesmo visual do Form.Select nativo.
      */}
      <Dropdown.Toggle
        as="button"
        type="button"
        id={toggleId}
        className={`form-select empresa-select-toggle d-flex align-items-start justify-content-between gap-2 text-start w-100 ${size === 'sm' ? 'form-select-sm' : ''}`}
      >
        <span className="flex-grow-1 min-w-0 text-start">
          {allowEmpty && !value ? (
            <span className="text-muted">{emptyLabel}</span>
          ) : selected ? (
            <>
              <span className="fw-semibold small d-block">{selected.label}</span>
              <span className="text-muted small d-block">{selected.cnpj}</span>
            </>
          ) : (
            <span className="text-muted">{value || '—'}</span>
          )}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-100 empresa-select-menu" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {allowEmpty && (
          <Dropdown.Item
            active={!value}
            onClick={() => onChange('')}
            className="text-wrap py-2 empresa-select-item"
          >
            <span className="text-muted">{emptyLabel}</span>
          </Dropdown.Item>
        )}
        {EMPRESAS_SUPRIMENTOS.map((e) => (
          <Dropdown.Item
            key={e.id}
            active={value === e.id}
            onClick={() => onChange(e.id)}
            className="text-wrap py-2 empresa-select-item"
          >
            <div className="fw-semibold small">{e.label}</div>
            <div className="text-muted small">{e.cnpj}</div>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
      <style jsx global>{`
        .dropdown-toggle.empresa-select-toggle.form-select {
          white-space: normal !important;
          height: auto;
          min-height: calc(1.5em + 0.75rem + 2px);
        }
        /* Evita duas setas: form-select já tem chevron de fundo. */
        .dropdown-toggle.empresa-select-toggle::after {
          display: none;
        }
        .empresa-select-menu .empresa-select-item {
          white-space: normal !important;
        }
      `}</style>
    </Dropdown>
  )
}
