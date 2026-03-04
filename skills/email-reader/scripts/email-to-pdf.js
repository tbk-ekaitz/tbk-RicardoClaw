#!/usr/bin/env node
/**
 * email-to-pdf.js — Convierte un email a PDF (SOLO LECTURA)
 *
 * SEGURIDAD: Usa IMAP en modo EXAMINE (readOnly: true) — imposible modificar emails.
 * PRIVACIDAD: El PDF se genera en /tmp como archivo temporal. No se envia a terceros.
 *             El PDF debe eliminarse tras su envio por WhatsApp.
 *             No se persiste ningun dato de email en disco permanente.
 *
 * Uso: node email-to-pdf.js <uid> [--output path]
 */

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const htmlPdf = require("html-pdf-node");
const fs = require("fs");
const path = require("path");

function getConfig() {
  const required = ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASS"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(JSON.stringify({
      error: true,
      message: `Variables faltantes: ${missing.join(", ")}`,
    }));
    process.exit(1);
  }
  return {
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10),
    secure: process.env.IMAP_TLS !== "false",
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
    disableAutoIdle: true,
  };
}

function buildHtmlDocument(email) {
  const fromName = email.from?.name || email.from?.address || "Desconocido";
  const fromAddr = email.from?.address || "";
  const toAddr = email.to?.address || "";
  const subject = email.subject || "(sin asunto)";
  const date = email.date ? new Date(email.date).toLocaleString("es-ES") : "";

  // Use original HTML if available, otherwise wrap plain text
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
    .body-content {
      margin-top: 16px;
    }
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
      <strong>De:</strong> ${escapeHtml(fromName)} &lt;${escapeHtml(fromAddr)}&gt;<br>
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
    Generado por OpenClaw Email Reader &bull; ${new Date().toLocaleString("es-ES")}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function main() {
  // Load .env
  try {
    require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
  } catch (e) {}

  const args = process.argv.slice(2);
  const uid = args[0];

  if (!uid) {
    console.error("Uso: email-to-pdf.js <uid> [--output ruta]");
    process.exit(1);
  }

  const outputFlag = args.indexOf("--output");
  const mailbox = process.env.IMAP_MAILBOX || "INBOX";

  const client = new ImapFlow(getConfig());
  try {
    await client.connect();
    // SOLO LECTURA: EXAMINE en vez de SELECT — el servidor rechaza cualquier escritura
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      const source = await client.download(String(uid), undefined, { uid: true });
      if (!source || !source.content) {
        console.error(JSON.stringify({ error: true, message: `Email UID ${uid} no encontrado` }));
        process.exit(1);
      }
      const parsed = await simpleParser(source.content);

      const email = {
        from: parsed.from?.value?.[0] || {},
        to: parsed.to?.value?.[0] || {},
        subject: parsed.subject || "(sin asunto)",
        date: parsed.date,
        text: parsed.text || "",
        html: parsed.html || "",
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          size: a.size,
        })),
      };

      const html = buildHtmlDocument(email);

      const options = {
        format: "A4",
        margin: { top: "15mm", bottom: "15mm", left: "10mm", right: "10mm" },
      };

      const pdfBuffer = await htmlPdf.generatePdf({ content: html }, options);

      // Determine output path
      const safeName = (email.subject || "email").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
      const outputPath = outputFlag >= 0 && args[outputFlag + 1]
        ? args[outputFlag + 1]
        : path.join("/tmp", `email_${uid}_${safeName}.pdf`);

      fs.writeFileSync(outputPath, pdfBuffer);

      // Programar auto-limpieza del PDF temporal tras 5 minutos
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
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    error: true,
    message: `Error generando PDF: ${err.message}`,
  }));
  process.exit(1);
});
