#!/usr/bin/env node
/**
 * imap-client.js — Cliente IMAP para el skill email-reader de OpenClaw
 *
 * Comandos:
 *   check [--limit N] [--format whatsapp]     Ver emails no leidos
 *   fetch <uid> [--format whatsapp]            Leer un email completo
 *   search --query "texto" [--limit N]         Buscar emails
 *   list-mailboxes [--format whatsapp]         Listar carpetas
 *   mark-read <uid> [uid2 uid3...]             Marcar como leido
 */

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { formatEmailList, formatSingleEmail, formatMailboxes } = require("./email-formatter");

// --- Config from environment ---
function getConfig() {
  const required = ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASS"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(JSON.stringify({
      error: true,
      message: `Variables de entorno faltantes: ${missing.join(", ")}. Revisa tu archivo .env`,
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
  };
}

function getMailbox() {
  return process.env.IMAP_MAILBOX || "INBOX";
}

// --- IMAP connection helper ---
async function withClient(fn) {
  const client = new ImapFlow(getConfig());
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

// --- Commands ---

async function checkInbox(limit = 5, format = "json") {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(getMailbox());
    try {
      const messages = [];
      // Fetch latest unseen messages
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = searchResult.slice(-limit).reverse();

      if (uids.length === 0) {
        const result = { count: 0, emails: [], message: "No hay emails no leidos" };
        if (format === "whatsapp") {
          console.log(formatEmailList(result));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        return;
      }

      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
        });
        messages.push({
          uid: msg.uid,
          from: msg.envelope.from?.[0] || {},
          to: msg.envelope.to?.[0] || {},
          subject: msg.envelope.subject || "(sin asunto)",
          date: msg.envelope.date,
          flags: [...(msg.flags || [])],
          hasAttachments: hasAttachments(msg.bodyStructure),
          attachmentCount: countAttachments(msg.bodyStructure),
        });
      }

      const result = { count: messages.length, totalUnseen: searchResult.length, emails: messages };

      if (format === "whatsapp") {
        console.log(formatEmailList(result));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } finally {
      lock.release();
    }
  });
}

async function fetchEmail(uid, format = "json") {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(getMailbox());
    try {
      const source = await client.download(String(uid), undefined, { uid: true });
      if (!source || !source.content) {
        const err = { error: true, message: `Email con UID ${uid} no encontrado` };
        console.log(format === "whatsapp" ? `\u26a0\ufe0f ${err.message}` : JSON.stringify(err));
        return;
      }

      const parsed = await simpleParser(source.content);

      const email = {
        uid,
        from: parsed.from?.value?.[0] || {},
        to: parsed.to?.value?.[0] || {},
        cc: parsed.cc?.value || [],
        subject: parsed.subject || "(sin asunto)",
        date: parsed.date,
        text: parsed.text || "",
        html: parsed.html || "",
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "adjunto",
          size: a.size,
          contentType: a.contentType,
        })),
      };

      if (format === "whatsapp") {
        console.log(formatSingleEmail(email));
      } else {
        console.log(JSON.stringify(email, null, 2));
      }
    } finally {
      lock.release();
    }
  });
}

async function searchEmails(query, limit = 5, format = "json") {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(getMailbox());
    try {
      // Search in subject and from
      const criteria = {
        or: [
          { subject: query },
          { from: query },
          { body: query },
        ],
      };

      const searchResult = await client.search(criteria, { uid: true });
      const uids = searchResult.slice(-limit).reverse();

      if (uids.length === 0) {
        const result = { count: 0, query, emails: [], message: `No se encontraron emails para "${query}"` };
        if (format === "whatsapp") {
          console.log(formatEmailList(result, query));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        return;
      }

      const messages = [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
        });
        messages.push({
          uid: msg.uid,
          from: msg.envelope.from?.[0] || {},
          to: msg.envelope.to?.[0] || {},
          subject: msg.envelope.subject || "(sin asunto)",
          date: msg.envelope.date,
          flags: [...(msg.flags || [])],
          hasAttachments: hasAttachments(msg.bodyStructure),
          attachmentCount: countAttachments(msg.bodyStructure),
        });
      }

      const result = { count: messages.length, totalResults: searchResult.length, query, emails: messages };

      if (format === "whatsapp") {
        console.log(formatEmailList(result, query));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } finally {
      lock.release();
    }
  });
}

async function listMailboxes(format = "json") {
  return withClient(async (client) => {
    const mailboxes = await client.list();
    const result = mailboxes.map((m) => ({
      path: m.path,
      name: m.name,
      specialUse: m.specialUse || null,
      delimiter: m.delimiter,
    }));

    if (format === "whatsapp") {
      console.log(formatMailboxes(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  });
}

async function markRead(uids) {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(getMailbox());
    try {
      for (const uid of uids) {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
      const result = { success: true, marked: uids, message: `${uids.length} email(s) marcado(s) como leido(s)` };
      console.log(JSON.stringify(result, null, 2));
    } finally {
      lock.release();
    }
  });
}

// --- Helpers ---

function hasAttachments(structure) {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) {
    return structure.childNodes.some(hasAttachments);
  }
  return false;
}

function countAttachments(structure) {
  if (!structure) return 0;
  let count = 0;
  if (structure.disposition === "attachment") count++;
  if (structure.childNodes) {
    for (const child of structure.childNodes) {
      count += countAttachments(child);
    }
  }
  return count;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// --- CLI ---

async function main() {
  // Load .env from skill directory
  try {
    const path = require("path");
    const dotenvPath = path.resolve(__dirname, "..", ".env");
    require("dotenv").config({ path: dotenvPath });
    // Also try project root .env
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
  } catch (e) {
    // dotenv not critical if env vars set externally
  }

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
        const uid = flags._positional?.[0] || flags.uid;
        if (!uid) {
          console.error('Uso: imap-client.js fetch <uid> [--format whatsapp]');
          process.exit(1);
        }
        await fetchEmail(uid, format);
        break;
      }
      case "search": {
        const query = flags.query;
        if (!query) {
          console.error('Uso: imap-client.js search --query "texto" [--limit N]');
          process.exit(1);
        }
        await searchEmails(query, limit, format);
        break;
      }
      case "list-mailboxes":
        await listMailboxes(format);
        break;
      case "mark-read": {
        const uids = flags._positional || [];
        if (uids.length === 0) {
          console.error("Uso: imap-client.js mark-read <uid1> [uid2 uid3...]");
          process.exit(1);
        }
        await markRead(uids);
        break;
      }
      default:
        console.error(`Comando desconocido: ${command}`);
        console.error("Comandos: check, fetch, search, list-mailboxes, mark-read");
        process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({
      error: true,
      message: `Error de conexion IMAP: ${err.message}`,
    }));
    process.exit(1);
  }
}

main();
