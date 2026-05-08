import { NextResponse } from "next/server";

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const token = process.env.TINY_API_TOKEN;
  const id = params.id;

  if (!token) {
    return NextResponse.json(
      { erro: "Token da API não configurado" },
      { status: 500 }
    );
  }

  const paramsBody = new URLSearchParams();
  paramsBody.set("token", token);
  paramsBody.set("id", id);
  paramsBody.set("formato", "JSON");

  try {
    const res = await fetch("https://api.tiny.com.br/api2/produto.obter.estoque.php", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: paramsBody.toString(),
    });

    if (!res.ok) {
      throw new Error(`Erro na API: ${res.status}`);
    }

    const json = await res.json();
    const produtoEstoque = json?.retorno?.produto;

    if (!produtoEstoque) {
      return NextResponse.json(
        { erro: "Estoque do produto não encontrado" },
        { status: 404 }
      );
    }

    const depositosRaw = Array.isArray(produtoEstoque.depositos)
      ? produtoEstoque.depositos
      : [];

    /** Soma numérica por depósito (Tiny pode enviar saldo como string; evita concatenação no reduce). */
    const somaDepositos = depositosRaw.reduce(
      (acc: number, dep: { deposito?: { saldo?: unknown } }) =>
        acc + num(dep?.deposito?.saldo),
      0
    );

    const hasRootSaldo =
      produtoEstoque.saldo !== undefined &&
      produtoEstoque.saldo !== null &&
      String(produtoEstoque.saldo).trim() !== "";

    /**
     * Saldo físico total: prioriza `produto.saldo` retornado pela Tiny (igual ao painel).
     * Se não vier no raiz, usa a soma dos depósitos.
     */
    const saldoFisico = hasRootSaldo ? num(produtoEstoque.saldo) : somaDepositos;

    const saldoReservadoNum = num(produtoEstoque.saldoReservado);
    const saldoDisponivel = Math.max(0, saldoFisico - saldoReservadoNum);

    const depositosComEstoque = depositosRaw.filter(
      (dep: { deposito?: { saldo?: unknown } }) => num(dep?.deposito?.saldo) > 0
    );

    return NextResponse.json({
      id: produtoEstoque.id,
      nome: produtoEstoque.nome,
      codigo: produtoEstoque.codigo,
      unidade: produtoEstoque.unidade,
      /** Saldo físico total (Tiny). */
      saldo: saldoFisico,
      saldoReservado: saldoReservadoNum,
      /** Saldo que pode ser vendido / adicionado ao pedido. */
      saldoDisponivel,
      /**
       * Compatibilidade: antes era soma incorreta dos depósitos; agora = saldo disponível.
       * Use `saldoDisponivel` em código novo.
       */
      totalEstoque: saldoDisponivel,
      depositos: depositosRaw,
      depositosComEstoque,
    });
  } catch (error) {
    console.error("Erro ao buscar estoque:", error);
    return NextResponse.json(
      { erro: "Falha ao buscar informações de estoque" },
      { status: 500 }
    );
  }
}
