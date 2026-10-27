"use client";

// Abrir uma tela já vista não recarrega: as leituras (GET /api/…) que a tela faz
// LOGO AO ABRIR (até JANELA_MS depois de trocar de rota) são servidas do cache se
// têm menos de TTL_MS — a lista aparece na hora e a rolagem volta ao lugar.
// Fora dessa janela (botão Atualizar, filtros, polling) tudo vai à rede e só
// renova o cache. Qualquer gravação (POST/PUT/PATCH/DELETE — inclusive trocar de
// empresa) limpa o cache inteiro: nunca se vê de volta um dado que acabou de mudar.
// Instalado uma vez no layout do ERP (window.fetch); telas públicas não passam aqui.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TTL_MS = 3 * 60_000;
const JANELA_MS = 2_000;
// Leituras que precisam estar sempre frescas (contadores, sessão) ou que não são JSON.
const FORA = [/^\/api\/auth\//, /^\/api\/notificacoes/, /^\/api\/aprovacoes/, /^\/api\/projetos\/inbox/, /^\/api\/search/, /^\/api\/arquivos\//, /\/(pdf|xlsx|csv|export|download)(\/|$|\?)/];

type Entrada = { t: number; status: number; headers: [string, string][]; corpo: string };
const cache = new Map<string, Entrada>();
let ultimaNavegacao = 0;
let ultimaRota: string | null = null;
let instalado = false;

function instalar() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const bruto = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL | null = null;
    try { url = new URL(bruto, window.location.origin); } catch { /* deixa passar */ }
    const ehApi = !!url && url.origin === window.location.origin && url.pathname.startsWith("/api/");
    if (!ehApi) return original(input, init);

    if (metodo !== "GET" && metodo !== "HEAD") {
      cache.clear();
      const res = await original(input, init);
      cache.clear(); // leituras que correram durante a gravação também saem
      return res;
    }
    const chave = url!.pathname + url!.search;
    if (FORA.some((r) => r.test(chave)) || init?.cache === "no-store" || init?.cache === "reload") return original(input, init);

    const agora = Date.now();
    const e = cache.get(chave);
    if (e && agora - e.t < TTL_MS && agora - ultimaNavegacao < JANELA_MS) {
      return new Response(e.corpo, { status: e.status, headers: e.headers });
    }
    const res = await original(input, init);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
      res.clone().text()
        .then((corpo) => cache.set(chave, { t: Date.now(), status: res.status, headers: Array.from(res.headers.entries()), corpo }))
        .catch(() => {});
    }
    return res;
  };
}

export default function FetchCache() {
  const pathname = usePathname();
  instalar();
  // A troca de rota é marcada no RENDER (que vem antes dos efeitos de montagem da
  // tela nova — é neles que ela busca os dados); o efeito cobre o 1º carregamento.
  if (typeof window !== "undefined" && pathname !== ultimaRota) { ultimaRota = pathname; ultimaNavegacao = Date.now(); }
  useEffect(() => { ultimaNavegacao = Date.now(); }, [pathname]);
  return null;
}
