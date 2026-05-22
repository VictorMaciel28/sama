import type { SeparacaoStatus } from '@prisma/client'

/** Detalhe da separação (após concluir a conferência). */
export function labelSeparacaoStatus(s: SeparacaoStatus): string {
  switch (s) {
    case 'SEPARANDO':
      return 'Separando'
    case 'SEPARADO':
      return 'Pronto para embalagem'
    case 'CONCLUIDO':
      return 'Concluído'
    case 'PRE_FATURAMENTO':
      return 'Aprovado para faturamento'
    default:
      return String(s)
  }
}

/** Listagem da aba Separação (fila enviada à embalagem). */
export function labelSeparacaoStatusListagem(s: SeparacaoStatus): string {
  switch (s) {
    case 'SEPARANDO':
      return 'Separando'
    case 'SEPARADO':
      return 'Enviado para embalagem'
    case 'CONCLUIDO':
      return 'Concluído'
    case 'PRE_FATURAMENTO':
      return 'Pré-faturamento'
    default:
      return String(s)
  }
}
