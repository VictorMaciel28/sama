// src/app/api/produtos/route.ts
import { NextResponse } from "next/server";

const TINY_URL = "https://api.tiny.com.br/api2/produtos.pesquisa.php";
const MAX_TOKENS = 8;

type ProdutoRow = Record<string, unknown>;

function unwrapProdutos(data: unknown): ProdutoRow[] {
  const r = data as { retorno?: { produtos?: unknown[] } };
  const rows = r?.retorno?.produtos;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: { produto?: unknown }) => row?.produto)
    .filter((p): p is ProdutoRow => p != null && typeof p === "object");
}

function produtoId(p: ProdutoRow): number {
  const id = p.id;
  if (typeof id === "string") return Number.parseInt(id, 10);
  if (typeof id === "number") return id;
  return Number.NaN;
}

function buildProdutosResponse(produtos: ProdutoRow[]) {
  return {
    retorno: {
      status_processamento: 3,
      status: "OK",
      pagina: "1",
      numero_paginas: "1",
      produtos: produtos.map((produto) => ({ produto })),
    },
  };
}

async function fetchTinyPesquisa(pesquisa: string, token: string | undefined) {
  const formData = new URLSearchParams();
  formData.append("token", token || "");
  formData.append("pesquisa", pesquisa);
  formData.append("formato", "json");
  formData.append("pagina", "1");
  formData.append("limite", "100");

  const res = await fetch(TINY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return res.json();
}

/** Interseção por id: produto precisa aparecer na busca de cada token (substring contínua na Tiny por palavra). */
function intersectProdutos(lists: ProdutoRow[][]): ProdutoRow[] {
  if (lists.length === 0) return [];
  if (lists.some((l) => l.length === 0)) return [];

  let ids = new Set(
    lists[0].map(produtoId).filter((id) => Number.isFinite(id))
  );
  for (let i = 1; i < lists.length; i++) {
    const next = new Set(
      lists[i].map(produtoId).filter((id) => Number.isFinite(id))
    );
    ids = new Set([...ids].filter((id) => next.has(id)));
  }

  const order = lists[0].filter((p) => ids.has(produtoId(p)));
  return order;
}

export async function GET(req: Request) {
  const busca = new URL(req.url).searchParams.get("q") || "";
  const token = process.env.TINY_API_TOKEN;
  const trimmed = busca.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);

  try {
    if (tokens.length <= 1) {
      const pesquisa = tokens.length === 1 ? tokens[0] : trimmed;
      const data = await fetchTinyPesquisa(pesquisa, token);
      return NextResponse.json(data);
    }

    const responses = await Promise.all(
      tokens.map((t) => fetchTinyPesquisa(t, token))
    );
    const lists = responses.map(unwrapProdutos);
    const merged = intersectProdutos(lists);
    return NextResponse.json(buildProdutosResponse(merged));
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return NextResponse.json({ erro: "Falha ao buscar produtos" }, { status: 500 });
  }
}
