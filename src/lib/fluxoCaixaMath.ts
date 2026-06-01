export function fluxoCaixaResultado(contasAReceber: number, inadimplencia: number, contasAPagar: number): number {
  return contasAReceber + inadimplencia - contasAPagar
}

export function fluxoCaixaRealizadoResultado(
  contasAReceber: number,
  vendaBalcao: number,
  mercadoLivre: number,
  despesa: number,
  contasAPagar: number
): number {
  return contasAReceber + vendaBalcao + mercadoLivre - despesa - contasAPagar
}
