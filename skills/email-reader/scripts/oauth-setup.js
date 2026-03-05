#!/usr/bin/env node
/**
 * oauth-setup.js — Configuracion unica de OAuth2 para Gmail API (solo lectura)
 *
 * Ejecutar UNA VEZ para autorizar el acceso de lectura a Gmail:
 *   node scripts/oauth-setup.js
 *
 * Esto abrira un navegador para que autorices el acceso.
 * El scope solicitado es SOLO gmail.readonly — Google no permitira
 * ninguna operacion de escritura con este token.
 *
 * El token se guarda en credentials/gmail-token.json (git-ignored).
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const CREDENTIALS_DIR = path.resolve(__dirname, "..", "credentials");
const TOKEN_PATH = path.join(CREDENTIALS_DIR, "gmail-token.json");
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, "client_secret.json");

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  // Load .env
  try {
    require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
  } catch (e) {}

  console.log("");
  console.log("==========================================");
  console.log("  Gmail OAuth Setup (SOLO LECTURA)");
  console.log("==========================================");
  console.log("");

  // Check client_secret.json exists
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.log("ERROR: No se encontro credentials/client_secret.json");
    console.log("");
    console.log("Para obtenerlo:");
    console.log("  1. Ve a https://console.cloud.google.com/");
    console.log("  2. Crea un proyecto (o selecciona uno existente)");
    console.log("  3. APIs y servicios > Biblioteca > busca 'Gmail API' > Habilitar");
    console.log("  4. APIs y servicios > Credenciales > Crear credenciales > ID de cliente OAuth");
    console.log("  5. Tipo: 'Aplicacion de escritorio'");
    console.log("  6. Descarga el JSON y guardalo como:");
    console.log(`     ${CLIENT_SECRET_PATH}`);
    console.log("");
    process.exit(1);
  }

  // Check if already authorized
  if (fs.existsSync(TOKEN_PATH)) {
    console.log("Ya existe un token en credentials/gmail-token.json");
    console.log("Si quieres re-autorizar, elimina ese archivo primero.");
    console.log("");
    process.exit(0);
  }

  // Load credentials
  const content = fs.readFileSync(CLIENT_SECRET_PATH, "utf8");
  const credentials = JSON.parse(content);
  const creds = credentials.installed || credentials.web;

  if (!creds) {
    console.error("ERROR: Formato de client_secret.json no reconocido.");
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    REDIRECT_URI
  );

  // Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log(`Scope solicitado: ${SCOPES[0]}`);
  console.log("(Google solo permitira LEER emails — escritura bloqueada)");
  console.log("");
  console.log("Abre esta URL en tu navegador para autorizar:");
  console.log("");
  console.log(`  ${authUrl}`);
  console.log("");
  console.log(`Esperando respuesta en http://localhost:${PORT}...`);

  // Start local server to receive OAuth callback
  const token = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400);
          res.end(`Error de autorizacion: ${error}`);
          reject(new Error(error));
          server.close();
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("No se recibio codigo de autorizacion");
          reject(new Error("No authorization code"));
          server.close();
          return;
        }

        const { tokens } = await oAuth2Client.getToken(code);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #128C7E;">Autorizacion completada</h1>
            <p>Gmail conectado en modo <strong>solo lectura</strong>.</p>
            <p>Puedes cerrar esta ventana.</p>
          </body></html>
        `);

        resolve(tokens);
        server.close();
      } catch (err) {
        res.writeHead(500);
        res.end("Error interno");
        reject(err);
        server.close();
      }
    });

    server.listen(PORT, () => {});
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`ERROR: Puerto ${PORT} ya en uso. Cierra la aplicacion que lo usa.`);
      }
      reject(err);
    });
  });

  // Save token
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));

  console.log("");
  console.log("==========================================");
  console.log("  Token guardado correctamente");
  console.log("==========================================");
  console.log("");
  console.log(`  Archivo: ${TOKEN_PATH}`);
  console.log(`  Scope: gmail.readonly (SOLO LECTURA)`);
  console.log(`  Expira: el token se renueva automaticamente`);
  console.log("");
  console.log("  Ahora puedes usar: node scripts/gmail-client.js check");
  console.log("");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
