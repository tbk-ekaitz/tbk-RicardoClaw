# Guia de Configuracion — OpenClaw Email Reader (Solo Lectura)

## Modelo de seguridad

Este sistema esta disenado como **solo lectura a 3 niveles**:

- **Gmail API + OAuth `gmail.readonly`**: El token OAuth solo tiene permiso de
  lectura. Google **rechaza con HTTP 403** cualquier intento de enviar, eliminar,
  modificar o mover emails. Esto es una garantia de Google, no del codigo.
- **Sin SMTP**: No existe ninguna dependencia ni configuracion SMTP. Es
  imposible enviar emails desde este sistema.
- **Sin codigo de escritura**: No existen funciones para send, delete, modify,
  trash ni draft. Aunque se anadieran, Google las rechazaria.

## Privacidad de datos

- Los emails se procesan **exclusivamente en memoria local** y se descartan
  tras mostrarlos en WhatsApp
- Los PDFs temporales se auto-eliminan a los 5 minutos
- **Ningun dato de email sale de tu maquina** — ni al LLM cloud, ni a APIs externas
- El LLM (Ollama) corre en tu propia red local
- El token OAuth y credenciales se almacenan solo en local (excluidos de git)

## Requisitos previos

| Requisito | Version minima | Notas |
|-----------|----------------|-------|
| Node.js | 22+ | https://nodejs.org |
| Ollama | Ultima | Con modelo `qwen2.5:7b` descargado |
| Cuenta Gmail | - | Cualquier cuenta Gmail personal o Workspace |
| Cuenta Google Cloud | - | Gratis — solo para crear credenciales OAuth |
| WhatsApp | - | En un telefono con conexion a internet |

## Paso 1: Clonar y configurar

```bash
git clone <url-del-repo>
cd tbk-RicardoClaw
chmod +x setup.sh
./setup.sh
```

## Paso 2: Crear proyecto en Google Cloud Console

Esto es una configuracion **unica** (10 minutos):

### 2.1. Crear proyecto

1. Ve a https://console.cloud.google.com/
2. Click en el selector de proyecto (arriba) > "Nuevo proyecto"
3. Nombre: `openclaw-email-reader` (o lo que quieras)
4. Click "Crear"

### 2.2. Habilitar Gmail API

1. En el menu lateral: **APIs y servicios** > **Biblioteca**
2. Busca "Gmail API"
3. Click en **Gmail API** > **Habilitar**

### 2.3. Configurar pantalla de consentimiento OAuth

1. **APIs y servicios** > **Pantalla de consentimiento OAuth**
2. Tipo de usuario: **Externo** (a menos que tengas Google Workspace, entonces Interno)
3. Rellena:
   - Nombre de la app: `Email Reader`
   - Email de soporte: tu email
   - Dominios autorizados: dejalo vacio
4. **Scopes**: click "Agregar o quitar scopes"
   - Busca `gmail.readonly` y marcalo
   - **NO marques** ningun otro scope de Gmail
5. **Usuarios de prueba**: agrega tu email de Gmail
6. Guarda todo

### 2.4. Crear credenciales OAuth

1. **APIs y servicios** > **Credenciales**
2. Click **Crear credenciales** > **ID de cliente OAuth**
3. Tipo de aplicacion: **Aplicacion de escritorio**
4. Nombre: `OpenClaw Email Reader`
5. Click **Crear**
6. Click **Descargar JSON** en el popup
7. Renombra el archivo descargado a `client_secret.json`
8. Muevelo a:
   ```bash
   mv ~/Downloads/client_secret.json skills/email-reader/credentials/
   ```

### 2.5. Autorizar acceso (una sola vez)

```bash
node skills/email-reader/scripts/oauth-setup.js
```

Esto abrira tu navegador. Inicia sesion con tu cuenta Gmail y autoriza el
acceso de **solo lectura**. El token se guardara en `credentials/gmail-token.json`.

**Importante**: Veras una advertencia de "app no verificada" — es normal para
apps de desarrollo. Click en "Avanzado" > "Ir a Email Reader (no seguro)".
Esto es porque tu app no esta publicada (solo tu la usas).

## Paso 3: Configurar Ollama

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

Para verificar: `curl http://192.168.1.100:11434/api/tags`

### Usar modelo potente (opcional)

```bash
ollama pull qwen2.5:72b
```

Cambia `OLLAMA_MODEL=qwen2.5:72b` en `.env` o `openclaw.json`.

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

Sigue el asistente interactivo. Cuando pregunte por el proveedor de IA, selecciona Ollama.

## Paso 6: Vincular WhatsApp

```bash
openclaw channels login --channel whatsapp
```

Escanea el QR con tu WhatsApp (Configuracion > Dispositivos vinculados > Vincular).

## Paso 7: Iniciar el Gateway

```bash
openclaw gateway
```

Para background: `openclaw onboard --install-daemon`

## Paso 8: Probar

Desde WhatsApp, envia estos mensajes:

| Mensaje | Resultado esperado |
|---------|-------------------|
| `correo` | Lista de emails no leidos |
| `leer 1` | Contenido del primer email |
| `buscar Amazon` | Emails de Amazon |
| `carpetas` | Lista de etiquetas |

## Verificacion de componentes

```bash
# Test conexion Gmail API
node skills/email-reader/scripts/gmail-client.js check --limit 3

# Test formateo WhatsApp
cd skills/email-reader && npm run test:format

# Test OpenClaw con skill
openclaw agent --message "revisa mi correo"
```

## Verificar que es solo lectura

Puedes confirmar que el scope es correcto inspeccionando el token:

```bash
cat skills/email-reader/credentials/gmail-token.json | grep scope
```

Debe mostrar SOLO `gmail.readonly`. Si ves otro scope, elimina el token y
re-ejecuta `oauth-setup.js`.

## Solucion de problemas

### "Permiso denegado por Google" (HTTP 403)
- El token OAuth puede haber expirado. Re-ejecuta `node scripts/oauth-setup.js`
- Verifica que Gmail API esta habilitada en tu proyecto de Google Cloud

### "client_secret.json no encontrado"
- Descargalo de Google Cloud Console > APIs > Credenciales > tu OAuth Client > Download JSON
- Guardalo en `skills/email-reader/credentials/client_secret.json`

### "Token OAuth no encontrado"
- Ejecuta `node skills/email-reader/scripts/oauth-setup.js` para autorizar

### "OpenClaw no responde en WhatsApp"
- Verifica que el gateway esta corriendo: `openclaw gateway`
- Comprueba que tu numero esta en `allowFrom` de `openclaw.json`

### "Ollama no responde"
- Verifica: `curl http://<IP>:11434/api/tags`
- Comprueba que el modelo esta descargado: `ollama list`
- Si Ollama esta en otra maquina, asegurate de que escucha en `0.0.0.0`
