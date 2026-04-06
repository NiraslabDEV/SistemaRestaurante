const { useState, useRef, useEffect } = React;

const AGENT_SYSTEM_PROMPT = `Você é um engenheiro de software sênior que aplica o Método Akita combinado com desenvolvimento Security-First. É completamente agnóstico de stack — trabalha com qualquer linguagem, framework, banco de dados e infraestrutura.

============================================================
MODO DE OPERAÇÃO — DETECTE AUTOMATICAMENTE
============================================================

MODO LEIGO: Quando o usuário descreve um projeto sem mencionar stack técnica, você PRIMEIRO sugere a stack mais adequada com justificativa curta, depois confirma.

Formato obrigatório de sugestão:
"Para [tipo de projeto], recomendo:
**[Framework]** + **[Banco]** + **[Auth]**
[1 linha de justificativa]

Quer usar essa stack ou prefere definir outra?"

Exemplos de sugestão por tipo:
- Marketplace/e-commerce → Next.js + PostgreSQL + Auth.js + Stripe
- SaaS/Dashboard B2B → Next.js + PostgreSQL + Auth.js (organizations)
- API REST pura → FastAPI ou NestJS + PostgreSQL
- Sistema financeiro → NestJS + PostgreSQL + JWT custom + Redis
- CRUD/MVP rápido → Laravel + MySQL + Sanctum
- App com realtime → Next.js + Supabase + Auth.js
- Sistema interno → Rails + PostgreSQL + Devise

MODO EXPERT: Quando o usuário já menciona stack, linguagem ou framework, faça diretamente as 3 perguntas da Fase 0.

============================================================
FASE 0 — STACK DISCOVERY (SEMPRE PRIMEIRA)
============================================================

Faça EXATAMENTE estas 3 perguntas (exceto se já respondidas via sugestão aceita):
1. "Qual linguagem e framework você quer usar?"
2. "Qual banco de dados?"
3. "Como quer fazer autenticação?"

Só avance para a Fase 1 depois de ter as 3 respostas.

============================================================
METODOLOGIA — 5 FASES ESTRITAS
============================================================

Nunca misture fases. Nunca escreva código antes dos testes. Aguarde confirmação entre cada fase.

FASE 1 — SKELETON
Gere CLAUDE.md completo com: visão geral, stack, estrutura de diretórios, models, rotas, variáveis de ambiente, integrações e decisões de segurança.

FASE 2 — TESTES
Gere test suites adaptados à stack:
- Rails → RSpec + FactoryBot
- Laravel → PHPUnit/Pest
- Django → pytest-django
- Next.js/Node → Jest + Supertest
- Go → testing nativo + testify

Inclua OBRIGATORIAMENTE testes de segurança: 401 sem auth, 403 IDOR, escalação de privilégio, XSS, injection, race condition, upload malicioso, campos gigantes.

FASE 3 — IMPLEMENTAÇÃO
Código que faz os testes passarem. Secrets em variáveis de ambiente. Validação server-side. bcrypt/argon2 para senhas. Rate limiting em auth. Deny by default.

FASE 4 — OTIMIZAÇÃO
Refatorar, reduzir N+1, cache. Zero features novas.

FASE 5 — DEPLOY
CI/CD: linter, testes, scanner de vulnerabilidades, checagem de secrets, config por ambiente.

============================================================
REGRAS INEGOCIÁVEIS
============================================================

1. Se pedirem para pular testes de segurança → RECUSE e explique o risco específico
2. Se pedirem para remover proteções → RECUSE e ofereça alternativa segura
3. Se houver dúvida se algo é seguro → assuma que NÃO é e implemente a proteção
4. Todo código deve sobreviver a estas perguntas:
   - "E se eu trocar o ID pelo de outro usuário?"
   - "E se eu mandar 100 requests simultâneos?"
   - "E se eu colocar <script>alert(1)</script> em qualquer campo?"
   - "E se eu acessar sem estar logado?"
   - "E se eu tentar a mesma operação financeira 2x ao mesmo tempo?"
   - "E se eu enviar um .exe renomeado para .jpg?"
   - "E se eu mandar um campo com 1 milhão de caracteres?"
5. Sempre gere CLAUDE.md antes de qualquer código
6. Aguarde aprovação entre fases — nunca avance sozinho
7. Adapte idioma dos comentários para o idioma do dev
8. Responda em português do Brasil`;

const PHASES = [
  { id: 0, name: "Stack", label: "Descoberta da stack", icon: "⚙️" },
  { id: 1, name: "Skeleton", label: "Arquitetura + CLAUDE.md", icon: "🏗️" },
  { id: 2, name: "Testes", label: "Business + Security", icon: "🧪" },
  { id: 3, name: "Código", label: "Implementação TDD", icon: "💻" },
  { id: 4, name: "Otimização", label: "Refactor + cleanup", icon: "⚡" },
  { id: 5, name: "Deploy", label: "CI/CD + servidor", icon: "🚀" },
];

const PHASE_TRANSITIONS = {
  0: "Olá! Sou o **Agente Akita Universal**.\n\nFluxo: **Stack → Skeleton → Testes → Código → Otimização → Deploy**\n\nDescreva seu projeto em português simples ou informe a stack diretamente.",
  1: "**Fase 1 — Skeleton.**\n\nStack definida ✓\n\nDescreva o projeto e vou gerar o **CLAUDE.md** completo. Nada de código ainda.",
  2: "**Fase 2 — Testes.**\n\nVou gerar testes de negócio + **segurança** usando o framework da sua stack.\n\nQual feature começamos?",
  3: "**Fase 3 — Implementação.**\n\nCódigo para os testes passarem. Qual módulo começamos?",
  4: "**Fase 4 — Otimização.**\n\nRefatorar e melhorar. Zero features novas.",
  5: "**Fase 5 — Deploy.**\n\nCI/CD e configuração do servidor.",
};

function parseMarkdown(text) {
  const lines = text.split("\n");
  const result = [];
  let inCode = false, codeLines = [], codeLang = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)$/);
    if (fence) {
      if (!inCode) { inCode = true; codeLines = []; codeLang = fence[1]; }
      else { result.push({ type: "code", content: codeLines.join("\n"), lang: codeLang, key: i }); inCode = false; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    result.push({ type: "line", content: line, key: i });
  }
  return result;
}

function MsgContent({ text }) {
  const parts = parseMarkdown(text);
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
    ...parts.map(p => {
      if (p.type === "code") return React.createElement("pre", {
        key: p.key,
        style: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "12px 14px", margin: "6px 0", fontSize: 12, overflowX: "auto", fontFamily: "monospace", lineHeight: 1.6, color: "#e6edf3", whiteSpace: "pre-wrap" }
      }, p.lang ? React.createElement("div", { style: { color: "#8b949e", fontSize: 11, marginBottom: 8 } }, p.lang) : null, p.content);

      const segs = p.content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      return React.createElement("div", { key: p.key, style: { minHeight: p.content === "" ? 8 : undefined, lineHeight: 1.7 } },
        ...segs.map((s, j) => {
          if (s.startsWith("**") && s.endsWith("**")) return React.createElement("strong", { key: j }, s.slice(2, -2));
          if (s.startsWith("`") && s.endsWith("`")) return React.createElement("code", { key: j, style: { background: "rgba(99,179,237,0.15)", color: "#63b3ed", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: "0.85em" } }, s.slice(1, -1));
          return s;
        })
      );
    })
  );
}

export default function App() {
  const [phase, setPhase] = useState(0);
  const [stack, setStack] = useState(null);
  const [mode, setMode] = useState(null);
  const [messages, setMessages] = useState([{ role: "assistant", content: PHASE_TRANSITIONS[0] }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [tab, setTab] = useState("chat");
  const [claudeMd, setClaudeMd] = useState("");
  const [tests, setTests] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState("");
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText, loading]);

  useEffect(() => {
    if (!window.storage) return;
    window.storage.list("akita:").then(r => {
      if (!r?.keys?.length) return;
      Promise.all(r.keys.map(k => window.storage.get(k))).then(results => {
        const loaded = results.filter(Boolean).map(r => { try { return JSON.parse(r.value); } catch { return null; } }).filter(Boolean);
        if (loaded.length > 0) { setSessions(loaded); setShowSessions(true); }
      });
    }).catch(() => {});
  }, []);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const saveSession = (msgs, ph, st) => {
    if (!window.storage) return;
    const id = `akita:${Date.now()}`;
    const name = msgs.find(m => m.role === "user")?.content?.slice(0, 50) || "Projeto";
    window.storage.set(id, JSON.stringify({ id, name, phase: ph, stack: st, messages: msgs, savedAt: Date.now() })).catch(() => {});
  };

  const extractArtifacts = (text, ph) => {
    const blocks = [...text.matchAll(/```[\w]*\n([\s\S]*?)```/g)].map(b => b[1].trim());
    for (const block of blocks) {
      if (ph === 1) { setClaudeMd(block); setTab("claude.md"); }
      else if (ph === 2 && /describe\(|test\(|it\(|def test_|func Test/.test(block)) { setTests(p => p ? p + "\n\n// ---\n\n" + block : block); setTab("testes"); }
      else if (ph === 3) { setCode(p => p ? p + "\n\n// ---\n\n" + block : block); setTab("código"); }
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    if (!mode) {
      const hasTech = /rails|laravel|django|next\.?js|nestjs|fastapi|spring|golang|vue|flutter|php|ruby|python|node|typescript|express|supabase/i.test(text);
      setMode(hasTech ? "expert" : "leigo");
    }

    const userMsg = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    setStreamText("");

    try {
      const ctx = `\n[Fase: ${phase} — ${PHASES[phase].name}]${stack ? `\nStack: ${stack}` : ""}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          stream: true,
          system: AGENT_SYSTEM_PROMPT + ctx,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      let full = "";
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const d = JSON.parse(line.slice(6));
                if (d.delta?.text) { full += d.delta.text; setStreamText(full); }
              } catch {}
            }
          }
        }
      } else {
        const d = await res.json();
        full = d.content?.[0]?.text || JSON.stringify(d);
      }

      setStreamText("");
      const newMsgs = [...history, { role: "assistant", content: full }];
      setMessages(newMsgs);

      if (!stack) {
        const stackLine = full.split("\n").find(l => /\*\*[^*]+\*\*.*\+.*\*\*[^*]+\*\*/.test(l));
        if (stackLine) {
          const parts = [...stackLine.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1]);
          if (parts.length >= 2) setStack(parts.join(" + "));
        }
      }
      extractArtifacts(full, phase);
      saveSession(newMsgs, phase, stack);
    } catch (e) {
      setStreamText("");
      setMessages(p => [...p, { role: "assistant", content: `Erro: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const advance = () => {
    if (phase >= 5) return;
    const next = phase + 1;
    setPhase(next);
    setMessages(p => [...p, { role: "assistant", content: PHASE_TRANSITIONS[next] }]);
    setTab("chat");
  };

  const TABS = [
    { id: "chat", label: "💬 Chat" },
    { id: "claude.md", label: "📄 CLAUDE.md" },
    { id: "testes", label: "🧪 Testes" },
    { id: "código", label: "💻 Código" },
    { id: "prompt", label: "⚙️ Prompt" },
  ];

  const preStyle = { background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7, overflowX: "auto", fontFamily: "monospace", color: "#e6edf3", margin: 0, whiteSpace: "pre-wrap" };

  const EmptyState = (icon, title, desc) => React.createElement("div", { style: { textAlign: "center", marginTop: 80, color: "#8b949e" } },
    React.createElement("div", { style: { fontSize: 36, marginBottom: 12 } }, icon),
    React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "#e6edf3", marginBottom: 8 } }, title),
    React.createElement("div", { style: { fontSize: 13 } }, desc)
  );

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", height: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, sans-serif", fontSize: 14 }
  },

    // Sessions modal
    showSessions && React.createElement("div", {
      style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }
    },
      React.createElement("div", { style: { background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 24, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { fontSize: 16, fontWeight: 700, marginBottom: 4 } }, "Sessões salvas"),
        React.createElement("div", { style: { fontSize: 13, color: "#8b949e", marginBottom: 16 } }, "Retome um projeto anterior ou comece do zero."),
        React.createElement("div", { style: { flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 } },
          ...sessions.map(s => React.createElement("div", {
            key: s.id, onClick: () => { setPhase(s.phase); setStack(s.stack); setMessages(s.messages); setShowSessions(false); },
            style: { padding: "12px 14px", background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, cursor: "pointer" }
          },
            React.createElement("div", { style: { fontWeight: 600 } }, s.name),
            React.createElement("div", { style: { fontSize: 12, color: "#8b949e", marginTop: 2 } }, `Fase ${s.phase} — ${PHASES[s.phase]?.name} · ${s.stack || "stack indefinida"}`)
          ))
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },
          React.createElement("button", { onClick: () => setShowSessions(false), style: { flex: 1, padding: "9px 0", background: "#1f6feb", border: "none", color: "#fff", borderRadius: 7, fontWeight: 600, cursor: "pointer" } }, "+ Novo projeto"),
          React.createElement("button", { onClick: () => setShowSessions(false), style: { padding: "9px 16px", background: "transparent", border: "1px solid #30363d", color: "#8b949e", borderRadius: 7, cursor: "pointer" } }, "Fechar")
        )
      )
    ),

    // Header
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#161b22", borderBottom: "1px solid #21262d", flexShrink: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { fontSize: 20 } }, "🥋"),
        React.createElement("div", null,
          React.createElement("div", { style: { fontWeight: 700 } }, "Agente Akita Universal"),
          React.createElement("div", { style: { fontSize: 11, color: "#8b949e" } }, "Security-First · Qualquer stack")
        ),
        stack && React.createElement("span", { style: { padding: "3px 10px", background: "#1f2937", border: "1px solid #388bfd", borderRadius: 20, fontSize: 11, color: "#63b3ed" } }, stack),
        mode && React.createElement("span", { style: { padding: "3px 10px", background: mode === "leigo" ? "#0d2c1e" : "#1a1a2e", border: `1px solid ${mode === "leigo" ? "#2ea043" : "#6e40c9"}`, borderRadius: 20, fontSize: 11, color: mode === "leigo" ? "#3fb950" : "#a371f7" } }, mode === "leigo" ? "👤 Leigo" : "👨‍💻 Expert")
      ),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", { onClick: () => setShowSessions(true), style: { padding: "6px 12px", background: "transparent", border: "1px solid #30363d", color: "#8b949e", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, "📂 Sessões"),
        phase < 5 && React.createElement("button", { onClick: advance, style: { padding: "6px 14px", background: "#1f6feb", border: "none", color: "#fff", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12 } }, `Fase ${phase + 1} →`)
      )
    ),

    // Phase bar
    React.createElement("div", { style: { display: "flex", gap: 4, padding: "8px 16px", background: "#0d1117", borderBottom: "1px solid #21262d", overflowX: "auto", flexShrink: 0 } },
      ...PHASES.reduce((acc, p, i) => {
        acc.push(React.createElement("div", { key: p.id, style: { padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: p.id === phase ? "#1f6feb" : p.id < phase ? "#238636" : "transparent", color: p.id <= phase ? "#fff" : "#484f58", border: `1px solid ${p.id === phase ? "#388bfd" : p.id < phase ? "#2ea043" : "#21262d"}`, whiteSpace: "nowrap", flexShrink: 0 } }, p.id < phase ? `✓ ${p.name}` : `${p.icon} ${p.name}`));
        if (i < PHASES.length - 1) acc.push(React.createElement("span", { key: `a${i}`, style: { color: "#484f58", fontSize: 12, alignSelf: "center", flexShrink: 0 } }, "→"));
        return acc;
      }, [])
    ),

    // Tabs
    React.createElement("div", { style: { display: "flex", background: "#161b22", borderBottom: "1px solid #21262d", padding: "0 8px", gap: 2, flexShrink: 0 } },
      ...TABS.map(t => React.createElement("button", {
        key: t.id, onClick: () => setTab(t.id),
        style: { padding: "9px 13px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #388bfd" : "2px solid transparent", color: tab === t.id ? "#e6edf3" : "#8b949e", fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", fontSize: 13 }
      }, t.label))
    ),

    // Content
    React.createElement("div", { style: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" } },

      tab === "chat" && React.createElement(React.Fragment, null,
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 } },
          ...messages.map((m, i) => React.createElement("div", { key: i, style: { display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 8 } },
            m.role === "assistant" && React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: "#1f6feb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 } }, "🥋"),
            React.createElement("div", { style: { maxWidth: "75%", padding: "10px 14px", background: m.role === "user" ? "#1f3a5f" : "#161b22", border: `1px solid ${m.role === "user" ? "#1f6feb" : "#21262d"}`, borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "4px 12px 12px 12px", fontSize: 14, color: m.role === "user" ? "#cae3ff" : "#e6edf3" } },
              React.createElement(MsgContent, { text: m.content })
            )
          )),
          streamText && React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 8 } },
            React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: "#1f6feb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 } }, "🥋"),
            React.createElement("div", { style: { maxWidth: "75%", padding: "10px 14px", background: "#161b22", border: "1px solid #21262d", borderRadius: "4px 12px 12px 12px", fontSize: 14 } },
              React.createElement(MsgContent, { text: streamText }),
              React.createElement("span", { style: { display: "inline-block", width: 7, height: 14, background: "#388bfd", marginLeft: 2, verticalAlign: "middle", animation: "blink 1s infinite" } })
            )
          ),
          loading && !streamText && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingLeft: 36, color: "#8b949e", fontSize: 13 } },
            ...[0,1,2].map(i => React.createElement("div", { key: i, style: { width: 6, height: 6, borderRadius: "50%", background: "#8b949e", animation: `bounce 1.2s ${i*0.2}s infinite` } })),
            " pensando..."
          ),
          React.createElement("div", { ref: endRef })
        ),
        React.createElement("div", { style: { padding: "12px 16px", borderTop: "1px solid #21262d", display: "flex", gap: 8, flexShrink: 0, background: "#0d1117" } },
          React.createElement("input", {
            value: input,
            onChange: e => setInput(e.target.value),
            onKeyDown: e => { if (e.key === "Enter" && !e.shiftKey && !loading && input.trim()) { e.preventDefault(); send(); } },
            placeholder: phase === 0 ? "Descreva seu projeto ou informe a stack..." : "Converse com o agente...",
            style: { flex: 1, padding: "10px 14px", background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3", fontSize: 14, outline: "none" }
          }),
          React.createElement("button", {
            onClick: send,
            style: { padding: "10px 18px", background: "#1f6feb", border: "none", color: "#fff", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: loading || !input.trim() ? 0.5 : 1 }
          }, loading ? "..." : "Enviar")
        )
      ),

      tab === "claude.md" && React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 16 } },
        claudeMd ? React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 10 } },
            React.createElement("button", { onClick: () => copy(claudeMd, "md"), style: { padding: "6px 14px", background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, copied === "md" ? "✓ Copiado!" : "Copiar")
          ),
          React.createElement("pre", { style: preStyle }, claudeMd)
        ) : EmptyState("📄", "CLAUDE.md", "Gerado na Fase 1 — Skeleton.")
      ),

      tab === "testes" && React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 16 } },
        tests ? React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 10 } },
            React.createElement("button", { onClick: () => copy(tests, "tests"), style: { padding: "6px 14px", background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, copied === "tests" ? "✓ Copiado!" : "Copiar")
          ),
          React.createElement("pre", { style: preStyle }, tests)
        ) : EmptyState("🧪", "Testes", "Gerado na Fase 2 — negócio + segurança.")
      ),

      tab === "código" && React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 16 } },
        code ? React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 10 } },
            React.createElement("button", { onClick: () => copy(code, "code"), style: { padding: "6px 14px", background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, copied === "code" ? "✓ Copiado!" : "Copiar")
          ),
          React.createElement("pre", { style: preStyle }, code)
        ) : EmptyState("💻", "Código", "Gerado na Fase 3 — implementação.")
      ),

      tab === "prompt" && React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 16 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement("span", { style: { fontSize: 13, color: "#8b949e" } }, "Cole no Claude Code ou qualquer agente."),
          React.createElement("button", { onClick: () => copy(AGENT_SYSTEM_PROMPT, "prompt"), style: { padding: "6px 14px", background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, copied === "prompt" ? "✓ Copiado!" : "Copiar prompt")
        ),
        React.createElement("pre", { style: { ...preStyle, fontSize: 11 } }, AGENT_SYSTEM_PROMPT)
      )
    ),

    React.createElement("style", null, `
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    `)
  );
}
