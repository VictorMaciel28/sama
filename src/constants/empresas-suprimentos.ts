/** Mesmas opções de “Enviar para Empresa” em Notas Fiscais (identificador + exibição). */
export type EmpresaSuprimento = {
  id: 'ff-lima' | 'alianca-matriz'
  label: string
  cnpj: string
  /** Usado só na tela de NF-e (envio XML). */
  apiKey: string
}

export const EMPRESAS_SUPRIMENTOS: EmpresaSuprimento[] = [
  {
    id: 'ff-lima',
    label: 'FF Lima Parafusos e Ferramentas',
    apiKey: '9b6cd0b8379346e7e7384b45f8e45e43cd2c142197b8e37385ea7c20211ec9b5',
    cnpj: '30.961.214/0001-95',
  },
  {
    id: 'alianca-matriz',
    label: 'Aliança Mercantil Matriz',
    apiKey: '505099465fb48df51dc1fc29400cac6b5e11e13864ac630a3cdd3ae9aa208533',
    cnpj: '43.589.635/0001-89',
  },
]

export function labelEmpresa(id: string | null | undefined): string {
  if (!id) return '—'
  return EMPRESAS_SUPRIMENTOS.find((e) => e.id === id)?.label ?? id
}
