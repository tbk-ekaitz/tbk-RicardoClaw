#!/usr/bin/env bash
# =============================================================================
# setup.sh — Instalacion automatizada de OpenClaw Email Reader via WhatsApp
#             Gmail API (solo lectura — scope gmail.readonly)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRED_DIR="$SCRIPT_DIR/skills/email-reader/credentials"

echo ""
echo "=========================================="
echo "  OpenClaw Email Reader - Setup"
echo "  Leer correos desde WhatsApp"
echo "  (Gmail API — SOLO LECTURA)"
echo "=========================================="
echo ""

# --- Paso 1: Verificar Node.js ---
info "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js no esta instalado. Instala Node.js 22+ desde https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    error "Se requiere Node.js 22+. Version actual: $(node -v)"
fi
ok "Node.js $(node -v) detectado"

# --- Paso 2: Verificar npm ---
info "Verificando npm..."
if ! command -v npm &> /dev/null; then
    error "npm no esta instalado"
fi
ok "npm $(npm -v) detectado"

# --- Paso 3: Instalar OpenClaw ---
info "Verificando OpenClaw..."
if ! command -v openclaw &> /dev/null; then
    info "Instalando OpenClaw globalmente..."
    npm install -g openclaw@latest
    ok "OpenClaw instalado"
else
    ok "OpenClaw ya esta instalado: $(openclaw --version 2>/dev/null || echo 'version desconocida')"
fi

# --- Paso 4: Instalar dependencias del skill ---
info "Instalando dependencias del skill email-reader..."
cd "$SCRIPT_DIR/skills/email-reader"
npm install
cd "$SCRIPT_DIR"
ok "Dependencias instaladas (googleapis, html-to-text, html-pdf-node)"

# --- Paso 5: Configurar .env ---
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    info "Creando archivo .env desde plantilla..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    warn "Edita .env con la IP de tu servidor Ollama:"
    echo "    nano $SCRIPT_DIR/.env"
    echo ""
fi

# --- Paso 6: Crear directorio de credenciales ---
mkdir -p "$CRED_DIR"

# --- Paso 7: Verificar credenciales Google ---
info "Verificando credenciales de Gmail API..."
if [ ! -f "$CRED_DIR/client_secret.json" ]; then
    warn "No se encontro client_secret.json"
    echo ""
    echo "  Para configurar Gmail API (solo lectura):"
    echo ""
    echo "  1. Ve a https://console.cloud.google.com/"
    echo "  2. Crea un proyecto nuevo"
    echo "  3. Habilita 'Gmail API' en la Biblioteca"
    echo "  4. Configura pantalla de consentimiento OAuth"
    echo "     - Agrega solo el scope: gmail.readonly"
    echo "  5. Crea credenciales > ID de cliente OAuth > Escritorio"
    echo "  6. Descarga el JSON y guardalo como:"
    echo "     $CRED_DIR/client_secret.json"
    echo ""
    echo "  Ver docs/SETUP.md para instrucciones detalladas."
    echo ""
else
    ok "client_secret.json encontrado"

    if [ ! -f "$CRED_DIR/gmail-token.json" ]; then
        info "Ejecutando autorizacion OAuth (se abrira el navegador)..."
        echo "  Scope: gmail.readonly (SOLO LECTURA)"
        echo ""
        node "$SCRIPT_DIR/skills/email-reader/scripts/oauth-setup.js"
    else
        ok "Token OAuth ya existe"
        # Test rapido
        info "Probando conexion a Gmail API..."
        if node "$SCRIPT_DIR/skills/email-reader/scripts/gmail-client.js" check --limit 1 2>/dev/null; then
            ok "Conexion Gmail API exitosa"
        else
            warn "No se pudo conectar a Gmail API. Puede que el token haya expirado."
            warn "Re-ejecuta: node skills/email-reader/scripts/oauth-setup.js"
        fi
    fi
fi

# --- Paso 8: Verificar Ollama ---
info "Verificando conexion a Ollama..."
if [ -f "$SCRIPT_DIR/.env" ]; then
    OLLAMA_HOST=$(grep -E '^OLLAMA_HOST=' "$SCRIPT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
    if [ -n "$OLLAMA_HOST" ] && [ "$OLLAMA_HOST" != "http://192.168.x.x:11434" ]; then
        if curl -s --connect-timeout 5 "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
            ok "Ollama responde en $OLLAMA_HOST"
        else
            warn "No se pudo conectar a Ollama en $OLLAMA_HOST"
        fi
    else
        warn "Configura OLLAMA_HOST en .env con la IP de tu servidor Ollama"
    fi
fi

# --- Resumen ---
echo ""
echo "=========================================="
echo "  Setup completado"
echo "=========================================="
echo ""
echo "  Seguridad: Gmail API con scope gmail.readonly"
echo "  Google BLOQUEA cualquier escritura (HTTP 403)"
echo ""
echo "  Proximos pasos:"
echo ""
if [ ! -f "$CRED_DIR/client_secret.json" ]; then
echo "  1. Configura Google Cloud Console (ver docs/SETUP.md)"
echo "  2. Coloca client_secret.json en credentials/"
echo "  3. Ejecuta: node skills/email-reader/scripts/oauth-setup.js"
echo "  4. Ejecuta: openclaw onboard"
else
echo "  1. Ejecuta el onboarding de OpenClaw:"
echo "     openclaw onboard"
fi
echo ""
echo "  2. Vincula WhatsApp (escanea el QR con tu telefono):"
echo "     openclaw channels login --channel whatsapp"
echo ""
echo "  3. Inicia el Gateway:"
echo "     openclaw gateway"
echo ""
echo "  4. Envia 'correo' desde WhatsApp para probar!"
echo ""
echo "=========================================="
