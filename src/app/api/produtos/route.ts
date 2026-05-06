// src/app/api/produtos/route.ts
import { NextResponse } from "next/server";

const TINY_URL = "https://api.tiny.com.br/api2/produtos.pesquisa.php";

async function fetchTinyPesquisa(
  pesquisa: string,
  token: string | undefined,
  pagina: number
) {
  const formData = new URLSearchParams();
  formData.append("token", token || "");
  formData.append("pesquisa", pesquisa);
  formData.append("formato", "json");
  formData.append("pagina", String(Math.max(1, pagina)));
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const busca = url.searchParams.get("q") || "";
  const paginaRaw = url.searchParams.get("pagina");
  const pagina = Math.max(1, Number.parseInt(paginaRaw || "1", 10) || 1);
  const token = process.env.TINY_API_TOKEN;
  const trimmed = busca.trim();

  try {
    const data = await fetchTinyPesquisa(trimmed, token, pagina);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return NextResponse.json({ erro: "Falha ao buscar produtos" }, { status: 500 });
  }
}
