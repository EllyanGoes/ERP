// ─────────────────────────────────────────────────────────────────────────────
// Snippet de tracking (Fase 3 do PRD docs/marketing-funis-prd.md, seção 3.2).
//
// JS vanilla servido por GET /api/t/s.js e instalado nos sites do grupo via
// <script async src=".../api/t/s.js" data-site="SITE_ID"></script>.
//
// Privacidade: NÃO envia IP nem user-agent no payload (o servidor lê o UA do
// header só para derivar mobile/desktop e o descarta). Todo o código roda
// dentro de try/catch — um erro aqui jamais pode quebrar o site do cliente.
// ─────────────────────────────────────────────────────────────────────────────

export function gerarSnippet(baseUrl: string): string {
  // String template — sem dependências, minificável. Comentários no próprio JS
  // são curtos de propósito (o arquivo é servido a cada visitante).
  return `(function () {
  try {
    var script = document.currentScript;
    var SITE = script && script.getAttribute("data-site");
    if (!SITE || !window.crypto || !window.crypto.getRandomValues) return;
    var ENDPOINT = ${JSON.stringify(baseUrl)} + "/api/t/e";

    // id aleatório estilo cuid: prefixo + 24 chars base36
    function rid(prefixo) {
      var bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      var out = "";
      for (var i = 0; i < 24; i++) out += (bytes[i] % 36).toString(36);
      return prefixo + out;
    }
    function getCookie(nome) {
      var m = document.cookie.match(new RegExp("(?:^|; )" + nome + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    }
    function setCookie(nome, valor, segundos) {
      document.cookie = nome + "=" + encodeURIComponent(valor) + "; max-age=" + segundos + "; path=/; SameSite=Lax";
    }

    // Visitante: cookie first-party de 365 dias (renovado a cada visita)
    var vid = getCookie("_erp_vid");
    if (!vid) vid = rid("v_");
    setCookie("_erp_vid", vid, 365 * 24 * 60 * 60);

    // Sessão: cookie de 30 min renovado a cada evento. Ausente/expirado = nova
    // sessão -> o primeiro payload leva referrer + UTMs + cid da querystring.
    var novaSessao = null;
    var sid = getCookie("_erp_sid");
    if (!sid) {
      sid = rid("s_");
      var qs = new URLSearchParams(location.search);
      novaSessao = {
        ref: document.referrer || "",
        utm: {
          source: qs.get("utm_source"),
          medium: qs.get("utm_medium"),
          campaign: qs.get("utm_campaign"),
          term: qs.get("utm_term"),
          content: qs.get("utm_content")
        },
        cid: qs.get("cid")
      };
    }
    function renovarSessao() { setCookie("_erp_sid", sid, 30 * 60); }
    renovarSessao();

    function enviar(eventos, identify) {
      try {
        var payload = { site: SITE, vid: vid, sid: sid, eventos: eventos || [] };
        if (novaSessao) { payload.novaSessao = novaSessao; novaSessao = null; }
        if (identify) payload.identify = identify;
        var body = JSON.stringify(payload);
        renovarSessao();
        // sendBeacon com Blob text/plain: content-type "safelisted" dispensa o
        // preflight CORS (o beacon não espera resposta). O servidor faz
        // JSON.parse do texto independente do content-type.
        var ok = false;
        if (navigator.sendBeacon) {
          try { ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" })); } catch (e) { ok = false; }
        }
        if (!ok && window.fetch) {
          fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain;charset=UTF-8" } }).catch(function () {});
        }
      } catch (e) { /* nunca quebrar o site */ }
    }

    function pageview() {
      enviar([{ tipo: "pageview", path: location.pathname }]);
    }

    // API global: window.erp("track", "nome_evento") / window.erp("identify", { email })
    window.erp = function (comando, dados) {
      try {
        if (comando === "track" && dados) {
          enviar([{ tipo: "evento", nome: String(dados), path: location.pathname }]);
        } else if (comando === "identify" && dados && dados.email) {
          enviar([], { email: String(dados.email) });
        }
      } catch (e) { /* noop */ }
    };

    // Pageview inicial + SPAs (patch da History API + popstate)
    pageview();
    var ultimoPath = location.pathname;
    function aoNavegar() {
      if (location.pathname !== ultimoPath) {
        ultimoPath = location.pathname;
        pageview();
      }
    }
    var _push = history.pushState;
    history.pushState = function () { _push.apply(this, arguments); aoNavegar(); };
    var _replace = history.replaceState;
    history.replaceState = function () { _replace.apply(this, arguments); aoNavegar(); };
    window.addEventListener("popstate", aoNavegar);
  } catch (e) { /* nunca quebrar o site */ }
})();
`;
}
