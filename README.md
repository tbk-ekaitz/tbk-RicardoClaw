# tbk-RicardoClaw

Prueba tecnica de integracion de OpenClaw para automatizaciones en entornos no ingenieria.

## Que es esto?

Integracion de [OpenClaw](https://openclaw.ai/) que permite **leer correos de Gmail desde WhatsApp** con formato visual rico (negrita, cursiva, iconos, listas, PDFs).

### Seguridad: SOLO LECTURA por diseno

Este sistema opera en modo **solo lectura garantizado a nivel de protocolo**:

- La conexion IMAP usa el comando `EXAMINE` (no `SELECT`) — el servidor de correo **rechaza cualquier escritura** aunque se intentara
- **No existe codigo** para enviar, responder, eliminar, mover, ni modificar emails
- **No hay SMTP** — es imposible enviar emails desde este sistema
- **No se pueden alterar flags** (leido/no leido, importante, etc.)
- Los PDFs temporales se auto-eliminan a los 5 minutos

### Privacidad: datos 100% locales

- Todo el procesamiento ocurre en tu maquina local
- Los emails se procesan en memoria y se descartan tras mostrarlos
- **No se guardan** emails en disco, base de datos, ni cache
- **No se envian** datos a servicios externos ni terceros
- Credenciales almacenadas solo en `.env` local (excluido de git)
- El LLM (Ollama) corre en tu propia red local

### Arquitectura

```
WhatsApp <---> OpenClaw Gateway <---> Gmail (IMAP EXAMINE / solo lectura)
                     |
              Skill: email-reader
              LLM: Ollama local (qwen2.5:7b)
```

### Comandos desde WhatsApp

| Escribes en WhatsApp | Resultado |
|---------------------|-----------|
| `correo` | Ver ultimos emails no leidos |
| `leer 1` | Leer el primer email |
| `buscar Amazon` | Buscar emails de Amazon |
| `carpetas` | Ver carpetas del buzon |
| `pdf` | Recibir email largo como documento PDF |

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
│   ├── SKILL.md                   # Definicion del skill (solo lectura)
│   ├── package.json               # Dependencias Node.js
│   └── scripts/
│       ├── imap-client.js         # Cliente IMAP solo lectura (EXAMINE)
│       ├── email-formatter.js     # Formateador WhatsApp (negrita, iconos)
│       └── email-to-pdf.js        # Conversion de email largo a PDF temporal
└── docs/SETUP.md                  # Guia de configuracion detallada
```

## Stack

- **OpenClaw** — Asistente IA open-source (gateway + channels + skills)
- **Baileys** — Protocolo WhatsApp Web (integrado en OpenClaw)
- **ImapFlow** — Cliente IMAP moderno para Node.js (modo EXAMINE)
- **Ollama** — LLM local (qwen2.5:7b / 72b) — datos nunca salen de tu red
