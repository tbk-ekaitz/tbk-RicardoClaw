#!/usr/bin/env bash
# =============================================================================
# setup.sh — Instalacion automatizada de OpenClaw Email Reader via WhatsApp
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

echo ""
echo "=========================================="
echo "  OpenClaw Email Reader - Setup"
echo "  Leer correos desde WhatsApp"
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
ok "Dependencias instaladas"

# --- Paso 5: Configurar .env ---
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    info "Creando archivo .env desde plantilla..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    warn "IMPORTANTE: Edita el archivo .env con tus credenciales:"
    echo ""
    echo "  1. Gmail App Password:"
    echo "     - Ve a https://myaccount.google.com/apppasswords"
    echo "     - Necesitas tener 2FA activado"
    echo "     - Crea una app password para 'Correo'"
    echo "     - Copia la contrasena generada"
    echo ""
    echo "  2. Ollama:"
    echo "     - Asegurate de tener Ollama corriendo"
    echo "     - Modelo requerido: ollama pull qwen2.5:7b"
    echo "     - Modelo opcional: ollama pull qwen2.5:72b"
    echo ""
    echo "  Edita con: nano $SCRIPT_DIR/.env"
    echo ""
else
    ok "Archivo .env ya existe"
fi

# --- Paso 6: Verificar Ollama ---
info "Verificando conexion a Ollama..."
if [ -f "$SCRIPT_DIR/.env" ]; then
    OLLAMA_HOST=$(grep -E '^OLLAMA_HOST=' "$SCRIPT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
    if [ -n "$OLLAMA_HOST" ] && [ "$OLLAMA_HOST" != "http://192.168.x.x:11434" ]; then
        if curl -s --connect-timeout 5 "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
            ok "Ollama responde en $OLLAMA_HOST"
        else
            warn "No se pudo conectar a Ollama en $OLLAMA_HOST"
            warn "Asegurate de que Ollama este corriendo"
        fi
    else
        warn "Configura OLLAMA_HOST en .env con la IP de tu servidor Ollama"
    fi
fi

# --- Paso 7: Test rapido IMAP ---
info "Verificando configuracion IMAP..."
if [ -f "$SCRIPT_DIR/.env" ]; then
    IMAP_PASS=$(grep -E '^IMAP_PASS=' "$SCRIPT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
    if [ "$IMAP_PASS" = "tu_gmail_app_password" ] || [ -z "$IMAP_PASS" ]; then
        warn "Las credenciales IMAP no estan configuradas en .env"
    else
        info "Probando conexion IMAP..."
        if node "$SCRIPT_DIR/skills/email-reader/scripts/imap-client.js" check --limit 1 2>/dev/null; then
            ok "Conexion IMAP exitosa"
        else
            warn "No se pudo conectar al servidor IMAP. Verifica las credenciales en .env"
        fi
    fi
fi

# --- Resumen ---
echo ""
echo "=========================================="
echo "  Setup completado"
echo "=========================================="
echo ""
echo "  Proximos pasos:"
echo ""
echo "  1. Edita .env con tus credenciales (si no lo has hecho)"
echo "     nano .env"
echo ""
echo "  2. Ejecuta el onboarding de OpenClaw:"
echo "     openclaw onboard"
echo ""
echo "  3. Vincula WhatsApp (escanea el QR con tu telefono):"
echo "     openclaw channels login --channel whatsapp"
echo ""
echo "  4. Inicia el Gateway:"
echo "     openclaw gateway"
echo ""
echo "  5. Envia 'correo' desde WhatsApp para probar!"
echo ""
echo "=========================================="
