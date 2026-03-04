/**
 * email-formatter.js — Formateador de emails para WhatsApp (SOLO LECTURA)
 *
 * SEGURIDAD: Este modulo es un formateador puro — recibe datos y devuelve strings.
 * No realiza conexiones de red, no escribe en disco, no modifica estado.
 *
 * PRIVACIDAD: No persiste, cachea ni registra ningun dato de email.
 * Todo el procesamiento es en memoria y de un solo uso.
 *
 * Convierte datos crudos de email a texto con formato rico de WhatsApp:
 * - *negrita* para remitentes y asuntos
 * - _cursiva_ para metadatos
 * - Separadores visuales
 * - Iconos unicode
 * - Listas numeradas para navegacion
 */

const { convert } = require("html-to-text");

const SEPARATOR = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
const MAX_BODY_LENGTH = 3000;

const NUMBER_EMOJIS = ["1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3", "4\ufe0f\u20e3", "5\ufe0f\u20e3", "6\ufe0f\u20e3", "7\ufe0f\u20e3", "8\ufe0f\u20e3", "9\ufe0f\u20e3", "\ud83d\udd1f"];

const FOLDER_ICONS = {
  "INBOX": "\ud83d\udce5",
  "\\Sent": "\ud83d\udce4",
  "\\Drafts": "\ud83d\udcdd",
  "\\Trash": "\ud83d\uddd1\ufe0f",
  "\\Junk": "\u26a0\ufe0f",
  "\\Flagged": "\u2b50",
  "\\Important": "\ud83c\udff7\ufe0f",
  "\\All": "\ud83d\udcda",
};

/**
 * Format a list of emails for WhatsApp
 */
function formatEmailList(result, searchQuery = null) {
  const lines = [];

  if (result.count === 0) {
    if (searchQuery) {
      lines.push(`\ud83d\udd0d *Sin resultados* para _"${searchQuery}"_`);
      lines.push(SEPARATOR);
      lines.push('_Prueba con otro termino de busqueda_');
    } else {
      lines.push("\u2728 *Bandeja limpia* \u2014 no hay emails no leidos");
      lines.push(SEPARATOR);
      lines.push('_Escribe "buscar X" para buscar emails_');
    }
    return lines.join("\n");
  }

  // Header
  if (searchQuery) {
    lines.push(`\ud83d\udd0d *Resultados para* _"${searchQuery}"_ \u2014 ${result.count} encontrado${result.count !== 1 ? "s" : ""}`);
    if (result.totalResults > result.count) {
      lines.push(`_Mostrando ${result.count} de ${result.totalResults} totales_`);
    }
  } else {
    lines.push(`\ud83d\udcec *Bandeja de Entrada* \u2014 ${result.count} no leido${result.count !== 1 ? "s" : ""}`);
    if (result.totalUnseen > result.count) {
      lines.push(`_Mostrando ${result.count} de ${result.totalUnseen} totales_`);
    }
  }
  lines.push(SEPARATOR);
  lines.push("");

  // Email list
  result.emails.forEach((email, i) => {
    const num = i < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[i] : `${i + 1}.`;
    const senderName = email.from.name || email.from.address || "Desconocido";
    const isImportant = email.flags?.includes("\\Flagged");

    lines.push(`${num} ${isImportant ? "\u2b50 " : ""}*${senderName}*`);
    lines.push(`   _${email.subject}_`);

    const meta = [];
    if (email.hasAttachments) {
      meta.push(`\ud83d\udcce ${email.attachmentCount} adjunto${email.attachmentCount !== 1 ? "s" : ""}`);
    }
    meta.push(`_${formatRelativeTime(email.date)}_`);
    lines.push(`   ${meta.join(" \u00b7 ")}`);
    lines.push("");
  });

  // Footer
  lines.push(SEPARATOR);
  lines.push('_Responde con "leer N" para abrir_');
  if (!searchQuery) {
    lines.push('_"buscar X" para filtrar_');
  }

  return lines.join("\n");
}

/**
 * Format a single email for WhatsApp
 */
function formatSingleEmail(email) {
  const lines = [];
  const senderName = email.from.name || email.from.address || "Desconocido";

  // Header
  lines.push(`\ud83d\udce7 *Email de ${senderName}*`);
  lines.push(SEPARATOR);
  lines.push(`*De:* ${email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}`);
  lines.push(`*Para:* ${email.to.name ? `${email.to.name} <${email.to.address}>` : email.to.address || ""}`);
  if (email.cc && email.cc.length > 0) {
    lines.push(`*CC:* ${email.cc.map((c) => c.address).join(", ")}`);
  }
  lines.push(`*Fecha:* _${formatDate(email.date)}_`);
  lines.push(`*Asunto:* _${email.subject}_`);
  lines.push(SEPARATOR);
  lines.push("");

  // Body
  let body = email.text || "";
  if (!body && email.html) {
    body = htmlToPlainText(email.html);
  }
  body = body.trim();

  if (body.length > MAX_BODY_LENGTH) {
    lines.push(body.substring(0, MAX_BODY_LENGTH));
    lines.push("");
    lines.push("_[...contenido truncado...]_");
    lines.push('_Escribe "pdf" para recibir el email completo como documento_');
  } else if (body) {
    lines.push(body);
  } else {
    lines.push("_(email sin contenido de texto)_");
  }

  lines.push("");

  // Attachments
  if (email.attachments && email.attachments.length > 0) {
    lines.push(SEPARATOR);
    const attachList = email.attachments
      .map((a) => `${a.filename} _(${formatBytes(a.size)})_`)
      .join(", ");
    lines.push(`\ud83d\udcce *Adjuntos:* ${attachList}`);
  }

  // Footer
  lines.push(SEPARATOR);
  lines.push('_"siguiente" \u00b7 "correo" \u00b7 "buscar X"_');

  return lines.join("\n");
}

/**
 * Format mailbox list for WhatsApp
 */
function formatMailboxes(mailboxes) {
  const lines = [];
  lines.push("\ud83d\udcc1 *Carpetas de correo*");
  lines.push(SEPARATOR);

  for (const mb of mailboxes) {
    const icon = FOLDER_ICONS[mb.specialUse] || FOLDER_ICONS[mb.path] || "\ud83d\udcc2";
    const name = mb.name || mb.path;
    lines.push(`${icon} ${name}`);
  }

  lines.push(SEPARATOR);
  return lines.join("\n");
}

// --- Helpers ---

function htmlToPlainText(html) {
  return convert(html, {
    wordwrap: 80,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
  });
}

function formatRelativeTime(date) {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD < 7) return `hace ${diffD}d`;
  return formatDate(date);
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

module.exports = {
  formatEmailList,
  formatSingleEmail,
  formatMailboxes,
  htmlToPlainText,
  formatRelativeTime,
  formatDate,
  formatBytes,
  SEPARATOR,
  MAX_BODY_LENGTH,
};
