#!/usr/bin/env node

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key.trim()] = rest.join("=").trim();
  }
} catch {
  // .env is optional if vars are set externally
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID);
const APPLE_MCP_DIR = process.env.APPLE_MCP_DIR;
const USER_NAME = process.env.USER_NAME || "User";
const USER_PHONE = process.env.USER_PHONE || "";
const USER_EMAIL = process.env.USER_EMAIL || "";

if (!BOT_TOKEN || !ALLOWED_CHAT_ID) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  process.exit(1);
}

if (!APPLE_MCP_DIR) {
  console.error("Missing APPLE_MCP_DIR — path to your apple-mcp directory");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// MCP server definitions — paths resolved from APPLE_MCP_DIR
const MCP_SERVERS = {
  "apple-notes": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "notes/build/index.js")],
  },
  "apple-messages": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "messages/build/index.js")],
  },
  "apple-contacts": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "contacts/build/index.js")],
  },
  "apple-reminders": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "reminders/build/index.js")],
  },
  "apple-calendar": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "calendar/build/index.js")],
  },
  "apple-maps": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "maps/build/index.js")],
  },
  "apple-mail": {
    command: "node",
    args: [resolve(APPLE_MCP_DIR, "mail/build/index.js")],
  },
};

const SYSTEM_PROMPT = `You are ${USER_NAME}'s personal assistant, accessible via Telegram.
You have access to Apple MCP tools for: Notes, Messages, Contacts, Reminders, Calendar, Maps, and Mail.
Key info about ${USER_NAME}:
${USER_PHONE ? `- Phone: ${USER_PHONE}` : ""}
${USER_EMAIL ? `- Email: ${USER_EMAIL}` : ""}
Today's date: ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
Keep responses concise — this is a chat message, not an essay.`;

let offset = 0;
let processing = false;

async function telegram(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text) {
  for (let i = 0; i < text.length; i += 4096) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: text.slice(i, i + 4096),
    });
  }
}

async function runClaude(prompt) {
  let result = "";
  const start = Date.now();

  for await (const message of query({
    prompt,
    options: {
      model: "claude-sonnet-4-6",
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: MCP_SERVERS,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: APPLE_MCP_DIR,
      maxTurns: 10,
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result;
      const cost = message.total_cost_usd
        ? ` | $${message.total_cost_usd.toFixed(4)}`
        : "";
      console.log(
        `  Done in ${((Date.now() - start) / 1000).toFixed(1)}s${cost}`
      );
    }

    if (
      message.type === "result" &&
      message.subtype === "error_during_execution"
    ) {
      throw new Error(message.errors?.join(", ") || "Unknown error");
    }
  }

  return result;
}

async function poll() {
  while (true) {
    try {
      const res = await fetch(
        `${API}/getUpdates?offset=${offset}&timeout=30`,
        { signal: AbortSignal.timeout(40000) }
      );
      const data = await res.json();
      const updates = data.result || [];

      for (const update of updates) {
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg?.text) continue;

        if (msg.chat.id !== ALLOWED_CHAT_ID) {
          console.log(`Blocked message from unknown chat: ${msg.chat.id}`);
          continue;
        }

        if (processing) {
          await sendMessage(
            msg.chat.id,
            "Still working on your last request, hang on..."
          );
          continue;
        }

        processing = true;
        const text = msg.text.trim();
        console.log(`[${new Date().toLocaleTimeString()}] Received: ${text}`);

        await telegram("sendChatAction", {
          chat_id: msg.chat.id,
          action: "typing",
        });

        try {
          const response = await runClaude(text);
          await sendMessage(msg.chat.id, response || "(done, no output)");
          console.log(
            `[${new Date().toLocaleTimeString()}] Response sent (${response.length} chars)`
          );
        } catch (err) {
          console.error("Claude error:", err.message);
          await sendMessage(
            msg.chat.id,
            `Something went wrong: ${err.message}`
          );
        } finally {
          processing = false;
        }
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

console.log("Telegram bridge started — listening for messages...");
console.log(`Model: claude-sonnet-4-6`);
console.log(`MCP servers: ${Object.keys(MCP_SERVERS).join(", ")}`);
poll();
