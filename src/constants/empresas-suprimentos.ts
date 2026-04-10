/** Mesmas opções de “Enviar para Empresa” em Notas Fiscais (identificador + exibição). */
export const EMPRESAS_SUPRIMENTOS = [
  {
    id: 'ff-lima',
    label: 'Casa dos Parafusos F.f. Lima Parafusos e Ferramentas LTDA',
    cnpj: '30.961.214/0001-95',
    apiKey: '',
  },
  {
    id: 'ff-lima-filial',
    label: 'F.f. Lima Parafusos e Ferramentas LTDA',
    cnpj: '30.961.214/0003-57',
    apiKey: '',
  },
  {
    id: 'alianca-matriz',
    label: 'Alianca Mercantil Atacadista LTDA',
    cnpj: '43.589.635/0001-89',
    apiKey: '',
  },
  {
    id: 'alianca-filial',
    label: 'Alianca Mercantil Atacadista LTDA',
    cnpj: '43.589.635/0002-60',
    apiKey: '',
  },
  {
    id: 'r1',
    label: 'Casa dos Parafusos R1 Parafusos e Ferramentas LTDA',
    cnpj: '41.281.835/0001-44',
    apiKey: '',
  },
  {
    id: 'crisfer-matriz',
    label: 'Casa dos Parafusos Crisfer Parafusos e Ferramentas LTDA',
    cnpj: '28.114.510/0001-09',
    apiKey: '',
  },
  {
    id: 'crisfer-filial',
    label: 'Crisfer Parafusos e Ferramentas LTDA',
    cnpj: '28.114.510/0002-90',
    apiKey: '',
  },
] as const

export type EmpresaSuprimento = (typeof EMPRESAS_SUPRIMENTOS)[number]
export type EmpresaSuprimentoId = EmpresaSuprimento['id']

/** IDs aceitos em filtros e gravação de ordem de compra (API). */
export const EMPRESA_IDS = new Set<string>(EMPRESAS_SUPRIMENTOS.map((e) => e.id))

/** Aliança (matriz/filial — CNPJ 43.589.635/0001-89 e 43.589.635/0002-60): logo no PDF da ordem de compra. */
export const EMPRESA_IDS_LOGO_ALIANCA_PDF = new Set<string>(['alianca-matriz', 'alianca-filial'])

export function labelEmpresa(id: string | null | undefined): string {
  if (!id) return '—'
  return EMPRESAS_SUPRIMENTOS.find((e) => e.id === id)?.label ?? id
}

/** Dados da empresa para listagens (nome + CNPJ), igual ao padrão de cliente em pedidos. */
export function findEmpresaById(id: string | null | undefined): EmpresaSuprimento | undefined {
  if (!id) return undefined
  return EMPRESAS_SUPRIMENTOS.find((e) => e.id === id)
}
