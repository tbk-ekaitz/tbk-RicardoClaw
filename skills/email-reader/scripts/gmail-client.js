#!/usr/bin/env node
/**
 * gmail-client.js — Cliente Gmail REST API SOLO LECTURA
 *
 * SEGURIDAD: Este cliente usa el scope OAuth "gmail.readonly".
 * Google RECHAZA en servidor (HTTP 403) cualquier operacion de escritura:
 * - No puede enviar emails
 * - No puede eliminar emails
 * - No puede modificar etiquetas/flags
 * - No puede mover emails
 * - No puede crear borradores
 * Incluso si se anadiera codigo para escribir, Google lo bloquearia.
 *
 * PRIVACIDAD: Los datos de email se procesan en memoria y se envian a stdout.
 * No se persisten en disco, logs, ni bases de datos. Sin telemetria.
 * El token OAuth se almacena localmente en credentials/gmail-token.json.
 *
 * Comandos:
 *   check [--limit N] [--format whatsapp]     Ver emails no leidos
 *   fetch <id> [--format whatsapp]             Leer un email completo
 *   search --query "texto" [--limit N]         Buscar emails
 *   list-labels [--format whatsapp]            Listar etiquetas/carpetas
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { formatEmailList, formatSingleEmail, formatMailboxes, htmlToPlainText } = require("./email-formatter");

// Scope SOLO LECTURA — Google rechaza cualquier escritura con este scope
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const CREDENTIALS_DIR = path.resolve(__dirname, "..", "credentials");
const TOKEN_PATH = path.join(CREDENTIALS_DIR, "gmail-token.json");
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, "client_secret.json");

// --- Auth ---

function loadClientCredentials() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.error(JSON.stringify({
      error: true,
      message: `Archivo ${CLIENT_SECRET_PATH} no encontrado. Descargalo desde Google Cloud Console (OAuth 2.0 Client ID > Download JSON).`,
    }));
    process.exit(1);
  }
  const content = fs.readFileSync(CLIENT_SECRET_PATH, "utf8");
  const credentials = JSON.parse(content);
  return credentials.installed || credentials.web;
}

function loadSavedToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const content = fs.readFileSync(TOKEN_PATH, "utf8");
  return JSON.parse(content);
}

function saveToken(token) {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function getAuthClient() {
  const creds = loadClientCredentials();
  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris?.[0] || "http://localhost:3000/oauth2callback"
  );

  const token = loadSavedToken();
  if (!token) {
    console.error(JSON.stringify({
      error: true,
      message: "Token OAuth no encontrado. Ejecuta primero: node scripts/oauth-setup.js",
    }));
    process.exit(1);
  }

  oAuth2Client.setCredentials(token);

  // Auto-refresh expired tokens
  oAuth2Client.on("tokens", (newTokens) => {
    const updated = { ...token, ...newTokens };
    saveToken(updated);
  });

  return oAuth2Client;
}

function getGmail(auth) {
  return google.gmail({ version: "v1", auth });
}

// --- Commands (TODAS solo lectura) ---

async function checkInbox(limit = 5, format = "json") {
  const auth = await getAuthClient();
  const gmail = getGmail(auth);

  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: limit,
  });

  const messageRefs = res.data.messages || [];

  if (messageRefs.length === 0) {
    const result = { count: 0, emails: [], message: "No hay emails no leidos" };
    if (format === "whatsapp") {
      console.log(formatEmailList(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  const messages = [];
  for (const ref of messageRefs) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: ref.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });

    const headers = msg.data.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    const fromRaw = getHeader("From");
    const fromParsed = parseEmailAddress(fromRaw);

    messages.push({
      id: msg.data.id,
      uid: msg.data.id,
      from: fromParsed,
      to: parseEmailAddress(getHeader("To")),
      subject: getHeader("Subject") || "(sin asunto)",
      date: new Date(getHeader("Date") || msg.data.internalDate),
      flags: (msg.data.labelIds || []).includes("STARRED") ? ["\\Flagged"] : [],
      hasAttachments: hasAttachmentsParts(msg.data.payload),
      attachmentCount: countAttachmentsParts(msg.data.payload),
    });
  }

  const result = {
    count: messages.length,
    totalUnseen: res.data.resultSizeEstimate || messages.length,
    emails: messages,
  };

  if (format === "whatsapp") {
    console.log(formatEmailList(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function fetchEmail(messageId, format = "json") {
  const auth = await getAuthClient();
  const gmail = getGmail(auth);

  try {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = msg.data.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    const body = extractBody(msg.data.payload);
    const attachments = extractAttachmentInfo(msg.data.payload);

    const email = {
      uid: msg.data.id,
      id: msg.data.id,
      from: parseEmailAddress(getHeader("From")),
      to: parseEmailAddress(getHeader("To")),
      cc: getHeader("Cc") ? getHeader("Cc").split(",").map((e) => parseEmailAddress(e.trim())) : [],
      subject: getHeader("Subject") || "(sin asunto)",
      date: new Date(getHeader("Date") || msg.data.internalDate),
      text: body.text || "",
      html: body.html || "",
      attachments,
    };

    if (format === "whatsapp") {
      console.log(formatSingleEmail(email));
    } else {
      console.log(JSON.stringify(email, null, 2));
    }
  } catch (err) {
    if (err.code === 404) {
      const errMsg = { error: true, message: `Email con ID ${messageId} no encontrado` };
      console.log(format === "whatsapp" ? `\u26a0\ufe0f ${errMsg.message}` : JSON.stringify(errMsg));
    } else {
      throw err;
    }
  }
}

async function searchEmails(query, limit = 5, format = "json") {
  const auth = await getAuthClient();
  const gmail = getGmail(auth);

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: limit,
  });

  const messageRefs = res.data.messages || [];

  if (messageRefs.length === 0) {
    const result = { count: 0, query, emails: [], message: `No se encontraron emails para "${query}"` };
    if (format === "whatsapp") {
      console.log(formatEmailList(result, query));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  const messages = [];
  for (const ref of messageRefs) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: ref.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });

    const headers = msg.data.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    messages.push({
      id: msg.data.id,
      uid: msg.data.id,
      from: parseEmailAddress(getHeader("From")),
      to: parseEmailAddress(getHeader("To")),
      subject: getHeader("Subject") || "(sin asunto)",
      date: new Date(getHeader("Date") || msg.data.internalDate),
      flags: (msg.data.labelIds || []).includes("STARRED") ? ["\\Flagged"] : [],
      hasAttachments: hasAttachmentsParts(msg.data.payload),
      attachmentCount: countAttachmentsParts(msg.data.payload),
    });
  }

  const result = {
    count: messages.length,
    totalResults: res.data.resultSizeEstimate || messages.length,
    query,
    emails: messages,
  };

  if (format === "whatsapp") {
    console.log(formatEmailList(result, query));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function listLabels(format = "json") {
  const auth = await getAuthClient();
  const gmail = getGmail(auth);

  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = (res.data.labels || []).map((l) => ({
    path: l.id,
    name: l.name,
    specialUse: mapLabelToSpecialUse(l.id),
    type: l.type,
  }));

  // Sort: system labels first, then user labels
  labels.sort((a, b) => {
    if (a.type === "system" && b.type !== "system") return -1;
    if (a.type !== "system" && b.type === "system") return 1;
    return a.name.localeCompare(b.name);
  });

  if (format === "whatsapp") {
    console.log(formatMailboxes(labels));
  } else {
    console.log(JSON.stringify(labels, null, 2));
  }
}

// --- NO HAY FUNCIONES DE ESCRITURA ---
// gmail.users.messages.send, .delete, .modify, .trash, .untrash,
// gmail.users.drafts.create — NINGUNA existe en este cliente.
// Aunque se anadieran, Google las rechazaria con HTTP 403 porque
// el token OAuth solo tiene el scope gmail.readonly.

// --- Helpers ---

function parseEmailAddress(raw) {
  if (!raw) return { name: "", address: "" };
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, "").trim(), address: match[2] };
  }
  return { name: "", address: raw.trim() };
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
        if (!result.text) {
          result.text = htmlToPlainText(result.html);
        }
      } else if (part.parts) {
        const nested = extractBody(part);
        if (!result.text && nested.text) result.text = nested.text;
        if (!result.html && nested.html) result.html = nested.html;
      }
    }
  }

  return result;
}

function extractAttachmentInfo(payload) {
  const attachments = [];
  if (!payload) return attachments;

  function walk(part) {
    if (part.filename && part.filename.length > 0 && part.body) {
      attachments.push({
        filename: part.filename,
        size: part.body.size || 0,
        contentType: part.mimeType || "application/octet-stream",
      });
    }
    if (part.parts) {
      for (const sub of part.parts) walk(sub);
    }
  }

  walk(payload);
  return attachments;
}

function hasAttachmentsParts(payload) {
  return extractAttachmentInfo(payload).length > 0;
}

function countAttachmentsParts(payload) {
  return extractAttachmentInfo(payload).length;
}

function mapLabelToSpecialUse(labelId) {
  const map = {
    INBOX: "INBOX",
    SENT: "\\Sent",
    DRAFT: "\\Drafts",
    TRASH: "\\Trash",
    SPAM: "\\Junk",
    STARRED: "\\Flagged",
    IMPORTANT: "\\Important",
  };
  return map[labelId] || null;
}

// --- CLI ---

async function main() {
  // Load .env
  try {
    require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
  } catch (e) {}

  const args = process.argv.slice(2);
  const command = args[0];

  // Parse flags
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
      if (flags[key] !== true) i++;
    } else if (!flags._positional) {
      flags._positional = [args[i]];
    } else {
      flags._positional.push(args[i]);
    }
  }

  const format = flags.format || "json";
  const limit = parseInt(flags.limit, 10) || 5;

  try {
    switch (command) {
      case "check":
        await checkInbox(limit, format);
        break;
      case "fetch": {
        const id = flags._positional?.[0] || flags.id;
        if (!id) {
          console.error("Uso: gmail-client.js fetch <message-id> [--format whatsapp]");
          process.exit(1);
        }
        await fetchEmail(id, format);
        break;
      }
      case "search": {
        const query = flags.query;
        if (!query) {
          console.error('Uso: gmail-client.js search --query "texto" [--limit N]');
          process.exit(1);
        }
        await searchEmails(query, limit, format);
        break;
      }
      case "list-labels":
      case "list-mailboxes":
        await listLabels(format);
        break;
      default:
        console.error(`Comando desconocido: ${command}`);
        console.error("Comandos disponibles (solo lectura): check, fetch, search, list-labels");
        process.exit(1);
    }
  } catch (err) {
    if (err.code === 403) {
      console.error(JSON.stringify({
        error: true,
        message: "Permiso denegado por Google. Verifica que el token OAuth tiene el scope gmail.readonly.",
      }));
    } else {
      console.error(JSON.stringify({
        error: true,
        message: `Error Gmail API: ${err.message}`,
      }));
    }
    process.exit(1);
  }
}

main();
