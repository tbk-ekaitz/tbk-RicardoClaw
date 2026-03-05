#!/usr/bin/env node
/**
 * email-to-pdf.js — Convierte un email a PDF (SOLO LECTURA)
 *
 * SEGURIDAD: Usa Gmail API con scope gmail.readonly.
 *            Google RECHAZA cualquier escritura (HTTP 403).
 * PRIVACIDAD: El PDF se genera en /tmp como archivo temporal.
 *             Se auto-elimina a los 5 minutos.
 *             No se persiste ningun dato de email en disco permanente.
 *
 * Uso: node email-to-pdf.js <message-id> [--output path]
 */

const { google } = require("googleapis");
const htmlPdf = require("html-pdf-node");
const fs = require("fs");
const path = require("path");
const { htmlToPlainText } = require("./email-formatter");

const CREDENTIALS_DIR = path.resolve(__dirname, "..", "credentials");
const TOKEN_PATH = path.join(CREDENTIALS_DIR, "gmail-token.json");
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, "client_secret.json");

function getAuthClient() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.error(JSON.stringify({ error: true, message: "client_secret.json no encontrado" }));
    process.exit(1);
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error(JSON.stringify({ error: true, message: "Token OAuth no encontrado. Ejecuta: node scripts/oauth-setup.js" }));
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
  const c = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(c.client_id, c.client_secret, c.redirect_uris?.[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));

  oAuth2Client.on("tokens", (newTokens) => {
    const current = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...newTokens }, null, 2));
  });

  return oAuth2Client;
}

function extractBody(payload) {
  const result = { text: "", html: "" };
  if (!payload) return result;

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    result.text = Buffer.from(payload.body.data, "base64url").toString("utf8");
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    result.html = Buffer.from(payload.body.data, "base64url").toString("utf8");
    result.text = htmlToPlainText(result.html);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data && !result.text) {
        result.text = Buffer.from(part.body.data, "base64url").toString("utf8");
      } else if (part.mimeType === "text/html" && part.body?.data && !result.html) {
        result.html = Buffer.from(part.body.data, "base64url").toString("utf8");
        if (!result.text) result.text = htmlToPlainText(result.html);
      } else if (part.parts) {
        const nested = extractBody(part);
        if (!result.text && nested.text) result.text = nested.text;
        if (!result.html && nested.html) result.html = nested.html;
      }
    }
  }
  return result;
}

function buildHtmlDocument(email) {
  const fromName = email.from || "Desconocido";
  const toAddr = email.to || "";
  const subject = email.subject || "(sin asunto)";
  const date = email.date ? new Date(email.date).toLocaleString("es-ES") : "";

  const body = email.html || `<pre style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(email.text || "")}</pre>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
      font-size: 14px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #25D366;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 18px;
      margin: 0 0 8px 0;
      color: #128C7E;
    }
    .meta {
      font-size: 12px;
      color: #666;
      line-height: 1.8;
    }
    .meta strong { color: #333; }
    .body-content { margin-top: 16px; }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #999;
    }
    .attachments {
      margin-top: 16px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 6px;
    }
    .attachments h3 { font-size: 13px; margin: 0 0 6px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(subject)}</h1>
    <div class="meta">
      <strong>De:</strong> ${escapeHtml(fromName)}<br>
      <strong>Para:</strong> ${escapeHtml(toAddr)}<br>
      <strong>Fecha:</strong> ${escapeHtml(date)}
    </div>
  </div>
  <div class="body-content">
    ${body}
  </div>
  ${email.attachments?.length ? `
  <div class="attachments">
    <h3>\ud83d\udcce Adjuntos (${email.attachments.length}):</h3>
    ${email.attachments.map((a) => `<div>${escapeHtml(a.filename || "adjunto")} (${formatBytes(a.size)})</div>`).join("")}
  </div>` : ""}
  <div class="footer">
    Generado por OpenClaw Email Reader (solo lectura) &bull; ${new Date().toLocaleString("es-ES")}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function main() {
  try {
    require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
  } catch (e) {}

  const args = process.argv.slice(2);
  const messageId = args[0];

  if (!messageId) {
    console.error("Uso: email-to-pdf.js <message-id> [--output ruta]");
    process.exit(1);
  }

  const outputFlag = args.indexOf("--output");

  const auth = getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = msg.data.payload?.headers || [];
  const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const body = extractBody(msg.data.payload);

  const attachments = [];
  function walkParts(part) {
    if (part.filename && part.filename.length > 0) {
      attachments.push({ filename: part.filename, size: part.body?.size || 0 });
    }
    if (part.parts) part.parts.forEach(walkParts);
  }
  walkParts(msg.data.payload);

  const email = {
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject") || "(sin asunto)",
    date: getHeader("Date"),
    text: body.text,
    html: body.html,
    attachments,
  };

  const html = buildHtmlDocument(email);
  const options = { format: "A4", margin: { top: "15mm", bottom: "15mm", left: "10mm", right: "10mm" } };
  const pdfBuffer = await htmlPdf.generatePdf({ content: html }, options);

  const safeName = (email.subject || "email").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
  const outputPath = outputFlag >= 0 && args[outputFlag + 1]
    ? args[outputFlag + 1]
    : path.join("/tmp", `email_${messageId.substring(0, 12)}_${safeName}.pdf`);

  fs.writeFileSync(outputPath, pdfBuffer);

  // Auto-limpieza del PDF temporal tras 5 minutos
  setTimeout(() => {
    try { fs.unlinkSync(outputPath); } catch (e) { /* ya eliminado */ }
  }, 5 * 60 * 1000).unref();

  console.log(JSON.stringify({
    success: true,
    path: outputPath,
    size: formatBytes(pdfBuffer.length),
    subject: email.subject,
    message: `PDF generado: ${outputPath} (se eliminara automaticamente en 5 min)`,
  }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: true, message: `Error generando PDF: ${err.message}` }));
  process.exit(1);
});
