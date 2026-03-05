# Telegram Claude Bridge

A Telegram bot that connects to Claude via the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), with access to [Apple MCP servers](https://github.com/griches/apple-mcp) for controlling native macOS apps.

Send a message on Telegram, get a response from Claude — with full access to your Notes, Messages, Contacts, Reminders, Calendar, Maps, and Mail.

## Setup

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 2. Get your chat ID

1. Message your new bot
2. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find your `chat.id` in the response

### 3. Install

```bash
git clone https://github.com/griches/telegram-claude-bridge.git
cd telegram-claude-bridge
npm install
```

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-telegram-chat-id
APPLE_MCP_DIR=/path/to/apple-mcp
MODEL=claude-sonnet-4-6
USER_NAME=Your Name
USER_PHONE=+441234567890
USER_EMAIL=you@example.com
```

You also need an `ANTHROPIC_API_KEY` environment variable set (or in `.env`).

### 5. Run

```bash
npm start
```

## Requirements

- **macOS** (Apple MCP servers use AppleScript)
- **Node.js** 22+ (Messages server uses `node:sqlite`)
- **[Apple MCP servers](https://github.com/griches/apple-mcp)** cloned and built locally
- **Anthropic API key**

## Features

- Session reuse — MCP servers stay warm between messages, so follow-up queries are faster
- Automatic session reset after 10 messages to prevent context bloat
- Typing indicator while Claude is thinking
- Streams responses as they arrive
- Safety modes — delete operations require confirmation before executing
- Configurable model (Haiku, Sonnet, or Opus)

## How it works

The bot long-polls the Telegram API for incoming messages, pipes them to Claude via the Agent SDK with all 7 Apple MCP servers attached, and streams the response back to Telegram. Sessions are reused across messages so MCP server processes don't need to restart each time.

## License

MIT
