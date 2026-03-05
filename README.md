# tbk-RicardoClaw

Prueba tecnica de integracion de OpenClaw para automatizaciones en entornos no ingenieria.

## Que es esto?

Integracion de [OpenClaw](https://openclaw.ai/) que permite **leer correos de Gmail desde WhatsApp** con formato visual rico (negrita, cursiva, iconos, listas, PDFs).

### Seguridad: SOLO LECTURA a 3 niveles

| Nivel | Mecanismo | Quien lo garantiza |
|-------|-----------|-------------------|
| **OAuth scope** | Token con `gmail.readonly` | Google rechaza escritura con HTTP 403 |
| **Codigo** | No existe ninguna funcion de escritura | El cliente solo tiene check/fetch/search |
| **Sin SMTP** | Cero dependencias de envio de email | Imposible enviar desde este sistema |

Aunque alguien robe el token OAuth, solo podra **leer** — Google bloquea cualquier modificacion.

### Privacidad: datos 100% locales

- Todo el procesamiento ocurre en tu maquina local
- Los emails se procesan en memoria y se descartan tras mostrarlos
- **No se guardan** emails en disco, base de datos, ni cache
- **No se envian** datos a servicios externos ni terceros
- PDFs temporales se auto-eliminan a los 5 minutos
- Token OAuth y credenciales solo en local (excluidos de git)
- El LLM (Ollama) corre en tu propia red local

### Arquitectura

```
WhatsApp <---> OpenClaw Gateway <---> Gmail REST API (scope: gmail.readonly)
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
| `carpetas` | Ver etiquetas del buzon |
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
- Cuenta Gmail + proyecto en Google Cloud Console (gratis)
- WhatsApp en un telefono

## Estructura

```
├── openclaw.json                  # Config OpenClaw (canales, modelo, skills)
├── .env.example                   # Plantilla de configuracion
├── setup.sh                       # Script de instalacion
├── skills/email-reader/
│   ├── SKILL.md                   # Definicion del skill (solo lectura)
│   ├── package.json               # Dependencias Node.js
│   ├── credentials/               # OAuth tokens (git-ignored)
│   └── scripts/
│       ├── gmail-client.js        # Cliente Gmail API (scope gmail.readonly)
│       ├── oauth-setup.js         # Setup OAuth unico (genera token)
│       ├── email-formatter.js     # Formateador WhatsApp (negrita, iconos)
│       └── email-to-pdf.js        # Conversion de email largo a PDF temporal
└── docs/SETUP.md                  # Guia de configuracion detallada
```

## Stack

- **OpenClaw** — Asistente IA open-source (gateway + channels + skills)
- **Baileys** — Protocolo WhatsApp Web (integrado en OpenClaw)
- **Gmail REST API** — Acceso a Gmail con scope `gmail.readonly` (escritura imposible)
- **Ollama** — LLM local (qwen2.5:7b / 72b) — datos nunca salen de tu red
