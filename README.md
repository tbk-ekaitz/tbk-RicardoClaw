# tbk-RicardoClaw

Prueba tecnica de integracion de OpenClaw para automatizaciones en entornos no ingenieria.

## Que es esto?

Integracion de [OpenClaw](https://openclaw.ai/) que permite **leer y gestionar correos de Gmail desde WhatsApp** con formato visual rico (negrita, cursiva, iconos, listas, PDFs).

### Arquitectura

```
WhatsApp <---> OpenClaw Gateway <---> Gmail (IMAP)
                     |
              Skill: email-reader
              LLM: Ollama (qwen2.5:7b)
```

### Comandos desde WhatsApp

| Escribes en WhatsApp | Resultado |
|---------------------|-----------|
| `correo` | Ver ultimos emails no leidos |
| `leer 1` | Leer el primer email |
| `buscar Amazon` | Buscar emails de Amazon |
| `carpetas` | Ver carpetas del buzon |
| `marcar leido 2` | Marcar email como leido |

### Ejemplo de formato

```
📬 *Bandeja de Entrada* — 3 no leidos
─────────────────────────

1️⃣ ⭐ *Amazon*
   _Confirmacion de pedido #123-456_
   📎 1 adjunto · hace 2h

2️⃣ *Carlos Lopez*
   _Re: Reunion del viernes_
   hace 5h
─────────────────────────
_Responde con "leer N" para abrir_
```

## Setup rapido

```bash
chmod +x setup.sh
./setup.sh
```

Ver [docs/SETUP.md](docs/SETUP.md) para la guia completa.

## Requisitos

- Node.js 22+
- Ollama con modelo `qwen2.5:7b` (o `qwen2.5:72b` para mas potencia)
- Cuenta Gmail con 2FA + App Password
- WhatsApp en un telefono

## Estructura

```
├── openclaw.json                  # Config OpenClaw (canales, modelo, skills)
├── .env.example                   # Plantilla de credenciales
├── setup.sh                       # Script de instalacion
├── skills/email-reader/
│   ├── SKILL.md                   # Definicion del skill para OpenClaw
│   ├── package.json               # Dependencias Node.js
│   └── scripts/
│       ├── imap-client.js         # Cliente IMAP (check, fetch, search, mark)
│       ├── email-formatter.js     # Formateador WhatsApp (negrita, iconos)
│       └── email-to-pdf.js        # Conversion de email largo a PDF
└── docs/SETUP.md                  # Guia de configuracion detallada
```

## Stack

- **OpenClaw** — Asistente IA open-source (gateway + channels + skills)
- **Baileys** — Protocolo WhatsApp Web (integrado en OpenClaw)
- **ImapFlow** — Cliente IMAP moderno para Node.js
- **Ollama** — LLM local (qwen2.5:7b / 72b)
