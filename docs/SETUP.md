# Guia de Configuracion — OpenClaw Email Reader

## Requisitos previos

| Requisito | Version minima | Notas |
|-----------|----------------|-------|
| Node.js | 22+ | https://nodejs.org |
| Ollama | Ultima | Con modelo `qwen2.5:7b` descargado |
| Cuenta Gmail | - | Con 2FA activado |
| WhatsApp | - | En un telefono con conexion a internet |

## Paso 1: Clonar y configurar

```bash
git clone <url-del-repo>
cd tbk-RicardoClaw
chmod +x setup.sh
./setup.sh
```

El script `setup.sh` verificara los requisitos e instalara las dependencias automaticamente.

## Paso 2: Credenciales de Gmail (App Password)

Gmail no permite acceso directo con contrasena. Necesitas crear una **App Password**:

1. Ve a https://myaccount.google.com/apppasswords
2. Si no ves la opcion, primero activa 2FA en https://myaccount.google.com/signinoptions/two-step-verification
3. Selecciona "Correo" como aplicacion
4. Selecciona "Otro" como dispositivo y pon "OpenClaw"
5. Google generara una contrasena de 16 caracteres (ej: `abcd efgh ijkl mnop`)
6. Copia esa contrasena (sin espacios) en tu `.env`:

```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=tu_email@gmail.com
IMAP_PASS=abcdefghijklmnop
IMAP_TLS=true
IMAP_MAILBOX=INBOX
```

### Habilitar IMAP en Gmail

1. Abre Gmail en el navegador
2. Configuracion (engranaje) > "Ver todos los ajustes"
3. Pestana "Reenvio y correo POP/IMAP"
4. Activa "Habilitar IMAP"
5. Guarda los cambios

## Paso 3: Configurar Ollama

Asegurate de que Ollama esta corriendo en tu red local con el modelo descargado:

```bash
# En la maquina donde corre Ollama:
ollama pull qwen2.5:7b
ollama serve  # Si no esta corriendo como servicio
```

Actualiza la IP en `.env`:

```env
OLLAMA_HOST=http://192.168.1.100:11434
OLLAMA_MODEL=qwen2.5:7b
```

Para verificar que funciona:
```bash
curl http://192.168.1.100:11434/api/tags
```

### Usar modelo potente (opcional)

Para tareas que requieran mas capacidad:

```bash
ollama pull qwen2.5:72b
```

Cambia en `.env` o en `openclaw.json` el modelo a `qwen2.5:72b`.

## Paso 4: Configurar tu numero de WhatsApp

Edita `openclaw.json` y reemplaza el placeholder con tu numero (formato internacional):

```json5
channels: {
  whatsapp: {
    dmPolicy: "allowlist",
    allowFrom: ["+34612345678"],  // Tu numero real aqui
  },
},
```

## Paso 5: Onboarding de OpenClaw

```bash
openclaw onboard
```

Sigue el asistente interactivo. Cuando pregunte por el proveedor de IA, selecciona Ollama y proporciona la URL.

## Paso 6: Vincular WhatsApp

```bash
openclaw channels login --channel whatsapp
```

Aparecera un QR code en la terminal. Escanea con tu WhatsApp:
1. Abre WhatsApp en tu telefono
2. Ve a Configuracion > Dispositivos vinculados
3. Toca "Vincular un dispositivo"
4. Escanea el QR

## Paso 7: Iniciar el Gateway

```bash
openclaw gateway
```

El gateway se ejecutara en primer plano. Para ejecucion en background:

```bash
openclaw gateway &
# O usar el daemon:
openclaw onboard --install-daemon
```

## Paso 8: Probar

Desde WhatsApp, envia estos mensajes al numero vinculado:

| Mensaje | Resultado esperado |
|---------|-------------------|
| `correo` | Lista de emails no leidos |
| `leer 1` | Contenido del primer email |
| `buscar Amazon` | Emails de Amazon |
| `carpetas` | Lista de carpetas |

## Verificacion de componentes

```bash
# Test conexion IMAP
node skills/email-reader/scripts/imap-client.js check --limit 3

# Test formateo WhatsApp
cd skills/email-reader && npm run test:format

# Test OpenClaw con skill
openclaw agent --message "revisa mi correo"
```

## Solucion de problemas

### "No pude conectar al servidor de correo"
- Verifica que IMAP esta habilitado en Gmail
- Verifica la App Password (no es tu contrasena normal)
- Comprueba que `IMAP_HOST` es `imap.gmail.com` y `IMAP_PORT` es `993`

### "OpenClaw no responde en WhatsApp"
- Verifica que el gateway esta corriendo: `openclaw gateway`
- Comprueba que tu numero esta en `allowFrom` de `openclaw.json`
- Verifica el vinculo WhatsApp: `openclaw channels login --channel whatsapp`

### "Ollama no responde"
- Verifica que Ollama esta corriendo: `curl http://<IP>:11434/api/tags`
- Comprueba que el modelo esta descargado: `ollama list`
- Si Ollama esta en otra maquina, asegurate de que escucha en `0.0.0.0` (no solo localhost)
