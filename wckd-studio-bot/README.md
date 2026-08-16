# WCKD STUDIO Discord Shop Bot
# made by koba 

A Discord bot (Node.js + discord.js v14) for **WCKD STUDIO**. It posts your price
list, walks customers through a guided order flow with buttons/select menus/modals,
auto-calculates the total based on your pricing rules, and opens a private ticket
channel with a full order summary for staff.

## Features

- `/pricelist` — posts the full, formatted price list.
- `/shop` — posts a shop panel with a **Start Order** button.
- Guided order flow: pick a service (Solo / Couple / Group-Gang / Family / Video Edit)
  → fill out a short form → get an instant price breakdown → confirm.
- Automatic pricing logic matching your rules exactly:
  - Solo ₱250, Couple ₱350, Family ₱500 (max 5), Group ₱1,000 (max 10, +₱30/extra member)
  - Graphic Design add-on per service
  - Tattoos +₱50/character
  - XML Creation +₱100/character (Group orders)
  - Video Edit routes straight to a "DM for Quote" ticket with the customer's project details
- On confirm, the bot:
  - Posts the order to a staff log channel (optional)
  - Creates a private ticket channel (`#order-username`) visible only to the customer,
    your staff role, and the bot
  - Pings your staff role in the ticket

## Setup

1. **Create the bot application**
   - Go to https://discord.com/developers/applications → New Application
   - Bot tab → Add Bot → copy the **Token**
   - General Information tab → copy the **Application ID** (this is `CLIENT_ID`)
   - OAuth2 → URL Generator → scopes: `bot`, `applications.commands`
     → bot permissions: `Send Messages`, `Manage Channels`, `Embed Links`,
     `Read Message History`, `View Channels` → use the generated URL to invite
     the bot to your server.

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `DISCORD_TOKEN` — your bot token
   - `CLIENT_ID` — your application ID
   - `GUILD_ID` — your server ID (right-click server icon → Copy Server ID;
     enable Developer Mode first in User Settings → Advanced)
   - `STAFF_LOG_CHANNEL_ID` — channel where every new order gets posted (optional)
   - `TICKET_CATEGORY_ID` — category new ticket channels are created under (optional)
   - `STAFF_ROLE_IDS` — role(s) pinged + given access on new tickets (optional).
     For multiple roles, separate the IDs with commas, e.g.
     `STAFF_ROLE_IDS=123456789012345678,987654321098765432`

4. **Run it**
   ```bash
   npm start
   ```
   Slash commands register automatically on boot (instantly if `GUILD_ID` is set).

5. In your server, run `/shop` in whichever channel you want the order panel in,
   and `/pricelist` anywhere you want the price list posted.

## Deploying on Railway

1. Push this folder to a GitHub repo (`.env` is git-ignored on purpose — never commit it).
2. Railway → New Project → Deploy from GitHub repo.
3. Railway auto-detects Node.js and runs `npm install` + `npm start`.
4. In the Railway project's **Variables** tab, add the same keys as `.env.example`
   (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `STAFF_LOG_CHANNEL_ID`,
   `TICKET_CATEGORY_ID`, `STAFF_ROLE_IDS`).
5. Set the service type to a **worker/background process** (not a web service) —
   this bot doesn't listen on a port, so it doesn't need a public domain. The
   included `Procfile` (`worker: node index.js`) signals this if Railway asks.
6. Deploy, then check the Deploy Logs for `Logged in as YourBot#1234`.

## Customizing prices

All pricing logic lives in `utils/pricing.js` — every rule is a plain, commented
`if` block, so bumping a price or changing the extra-member fee is a one-line edit.
The displayed price list text lives in `utils/embeds.js`.

## Notes

- Bot only needs the `Guilds` intent — it doesn't read message content, so no
  privileged intents need to be enabled in the Developer Portal.
- Order data is kept in memory only while a customer is filling out the modal;
  nothing is persisted to disk/database. If you want order history saved
  long-term, the ticket channel + staff log channel serve as the record, or you
  can extend `index.js` to write to a database before deleting the session.
