require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const { calculatePrice } = require('./utils/pricing');
const { priceListEmbed, shopPanelEmbed, statusAnnouncementEmbed, orderSummaryEmbed, draftOrderEmbed, receiptEmbed } = require('./utils/embeds');
const { guessOrderFromTranscript } = require('./utils/orderExtractor');

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  STAFF_LOG_CHANNEL_ID,
  TICKET_CATEGORY_ID,
  STAFF_ROLE_IDS,
  PRICELIST_CHANNEL_ID,
} = process.env;

// Support one or more staff role IDs, comma-separated in .env
const STAFF_ROLE_ID_LIST = (STAFF_ROLE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env — see .env.example');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// In-memory session store: userId -> { service, opts, priceResult }
const sessions = new Map();

// Studio open/closed status, staff-controlled via /status. Resets to 'open' on restart.
let studioStatus = 'open';

const SERVICES = {
  solo: 'Solo Photo',
  couple: 'Couple Photo',
  group: 'Group / Gang Photo',
  family: 'Family Photo',
  video: 'Video Edit (Quote)',
};

// ---------- Slash command definitions ----------
const commands = [
  new SlashCommandBuilder().setName('shop').setDescription('Open the WCKD STUDIO shop panel'),
  new SlashCommandBuilder().setName('pricelist').setDescription('View the full WCKD STUDIO price list'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message as WCKD STUDIO (staff only)')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('The message to send').setRequired(true).setMaxLength(2000)
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel to send in (defaults to the current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('read')
    .setDescription('(Staff only) Scan this ticket and draft an order confirmation/receipt')
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Ticket channel to scan (defaults to the current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('(Staff only) Set WCKD STUDIO as open or closed')
    .addStringOption((opt) =>
      opt
        .setName('state')
        .setDescription('Is the studio open or closed?')
        .setRequired(true)
        .addChoices({ name: 'Open', value: 'open' }, { name: 'Closed', value: 'closed' })
    )
    .addStringOption((opt) =>
      opt.setName('note').setDescription('Optional note, e.g. "back tomorrow 9am"').setRequired(false).setMaxLength(200)
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel to announce in (defaults to the current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Slash commands registered to guild.');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Slash commands registered globally (can take up to 1hr to appear).');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ---------- Helper: build the service select menu ----------
function serviceSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('svc_select')
    .setPlaceholder('Choose a service...')
    .addOptions(
      { label: 'Solo — ₱250', value: 'solo', emoji: '📸' },
      { label: 'Couple — ₱350', value: 'couple', emoji: '📸' },
      { label: 'Group / Gang — from ₱1,000', value: 'group', emoji: '👥' },
      { label: 'Family — ₱500', value: 'family', emoji: '👨‍👩‍👧‍👦' },
      { label: 'Video Edit — DM for Quote', value: 'video', emoji: '🎬' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

// ---------- Helper: build modal per service ----------
function buildModal(service) {
  const modal = new ModalBuilder().setCustomId(`order_modal_${service}`).setTitle(`${SERVICES[service]} — Order Details`);

  const rows = [];

  if (service === 'solo' || service === 'couple') {
    const design = new TextInputBuilder()
      .setCustomId('graphicDesign')
      .setLabel('Add Graphic Design? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('yes or no');
    const tattoos = new TextInputBuilder()
      .setCustomId('tattooCount')
      .setLabel('How many characters have tattoos?')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('0');
    rows.push(new ActionRowBuilder().addComponents(design), new ActionRowBuilder().addComponents(tattoos));
  }

  if (service === 'group') {
    const members = new TextInputBuilder()
      .setCustomId('memberCount')
      .setLabel('How many members? (10 included in base)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g. 12');
    const tattoos = new TextInputBuilder()
      .setCustomId('tattooCount')
      .setLabel('How many characters have tattoos?')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('0');
    const design = new TextInputBuilder()
      .setCustomId('graphicDesign')
      .setLabel('Add Graphic Design? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('yes or no');
    const xml = new TextInputBuilder()
      .setCustomId('xmlCount')
      .setLabel('XML Creation - how many characters?')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('0 (leave 0 if you already have XML)');
    rows.push(
      new ActionRowBuilder().addComponents(members),
      new ActionRowBuilder().addComponents(tattoos),
      new ActionRowBuilder().addComponents(design),
      new ActionRowBuilder().addComponents(xml)
    );
  }

  if (service === 'family') {
    const members = new TextInputBuilder()
      .setCustomId('memberCount')
      .setLabel('How many members? (max 5)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g. 4');
    const tattoos = new TextInputBuilder()
      .setCustomId('tattooCount')
      .setLabel('How many characters have tattoos?')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('0');
    const design = new TextInputBuilder()
      .setCustomId('graphicDesign')
      .setLabel('Add Graphic Design? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('yes or no');
    const xml = new TextInputBuilder()
      .setCustomId('xmlCount')
      .setLabel('XML Creation - how many characters?')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('0 (leave 0 if you already have XML)');
    rows.push(
      new ActionRowBuilder().addComponents(members),
      new ActionRowBuilder().addComponents(tattoos),
      new ActionRowBuilder().addComponents(design),
      new ActionRowBuilder().addComponents(xml)
    );
  }

  if (service === 'video') {
    const details = new TextInputBuilder()
      .setCustomId('projectDetails')
      .setLabel('Describe your video project')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('Length, style, number of clips, deadline, etc.');
    rows.push(new ActionRowBuilder().addComponents(details));
  }

  modal.addComponents(...rows);
  return modal;
}

function yesNo(str) {
  if (!str) return false;
  return /^y(es)?$/i.test(str.trim());
}

function isStaffMember(member) {
  if (!member || STAFF_ROLE_ID_LIST.length === 0) return false;
  return member.roles.cache.some((role) => STAFF_ROLE_ID_LIST.includes(role.id));
}

// ---------- /read: scan a ticket, draft an order, and issue a receipt ----------
// pendingScans: userId -> { channelId, transcriptExcerpt } — set right before showing
// the correction modal, read back when the staff member submits it.
const pendingScans = new Map();
// draftReceipts: userId -> { channelId, service, opts, priceResult, sourceNote } — set
// after the modal is submitted, read back when staff clicks Finalize.
const draftReceipts = new Map();
let receiptCounter = 0;

function nextReceiptId() {
  receiptCounter += 1;
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `WCKD-${datePart}-${String(receiptCounter).padStart(3, '0')}`;
}

async function findTicketCustomer(channel) {
  try {
    const overwrites = channel.permissionOverwrites.cache.filter((ow) => ow.type === 1); // 1 = member overwrite
    for (const ow of overwrites.values()) {
      if (ow.id === client.user.id) continue;
      const member = await channel.guild.members.fetch(ow.id).catch(() => null);
      if (!member || member.user.bot) continue;
      if (isStaffMember(member)) continue;
      return member.user;
    }
  } catch (err) {
    console.error('Could not determine ticket customer:', err);
  }
  return null;
}

function buildStaffReadModal(guess) {
  const modal = new ModalBuilder().setCustomId('read_confirm_modal').setTitle('Confirm Order From Ticket');

  const service = new TextInputBuilder()
    .setCustomId('service')
    .setLabel('Service (solo/couple/group/family/video)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(guess.service !== 'unclear' ? guess.service : '');

  const members = new TextInputBuilder()
    .setCustomId('memberCount')
    .setLabel('Member count (group/family only)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(guess.memberCount ? String(guess.memberCount) : '');

  const tattoos = new TextInputBuilder()
    .setCustomId('tattooCount')
    .setLabel('How many characters have tattoos?')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(guess.tattooCount ? String(guess.tattooCount) : '0');

  const design = new TextInputBuilder()
    .setCustomId('graphicDesign')
    .setLabel('Graphic Design add-on? (yes/no)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(guess.graphicDesign ? 'yes' : 'no');

  const xml = new TextInputBuilder()
    .setCustomId('xmlCount')
    .setLabel('XML Creation - how many characters?')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(guess.xmlCount ? String(guess.xmlCount) : '0');

  modal.addComponents(
    new ActionRowBuilder().addComponents(service),
    new ActionRowBuilder().addComponents(members),
    new ActionRowBuilder().addComponents(tattoos),
    new ActionRowBuilder().addComponents(design),
    new ActionRowBuilder().addComponents(xml)
  );

  return modal;
}

function receiptConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('read_finalize').setLabel('Finalize & Post Receipt').setStyle(ButtonStyle.Success).setEmoji('🧾'),
    new ButtonBuilder().setCustomId('read_discard').setLabel('Discard').setStyle(ButtonStyle.Danger).setEmoji('✖️')
  );
}

function confirmCancelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order_confirm').setLabel('Confirm & Create Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('order_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('✖️')
  );
}

// ---------- Daily price list auto-post (12:00 AM Philippine time = 16:00 UTC) ----------
const PHT_POST_UTC_HOUR = 16; // Asia/Manila is UTC+8 with no DST, so midnight PHT = 16:00 UTC the day before
const PRICELIST_EMBED_TITLE = '🖤 WCKD STUDIO — PRICE LIST';
let lastPriceListMessageId = null;

function msUntilNextUtcHour(hour) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next - now;
}

async function deletePreviousPriceListMessage(channel) {
  // Prefer the ID we tracked in memory from the last post this process made.
  if (lastPriceListMessageId) {
    const msg = await channel.messages.fetch(lastPriceListMessageId).catch(() => null);
    if (msg) await msg.delete().catch((err) => console.error('Failed to delete previous price list message:', err));
    lastPriceListMessageId = null;
    return;
  }

  // Fallback (e.g. after a bot restart, when we don't have it in memory anymore):
  // scan recent history for the bot's own price list embed and delete that.
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return;
  const previous = messages.find((m) => m.author.id === client.user.id && m.embeds[0]?.title === PRICELIST_EMBED_TITLE);
  if (previous) await previous.delete().catch((err) => console.error('Failed to delete previous price list message:', err));
}

async function postDailyPriceList() {
  if (!PRICELIST_CHANNEL_ID) return;
  const channel = await client.channels.fetch(PRICELIST_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('PRICELIST_CHANNEL_ID is set but the channel could not be found/accessed.');
    return;
  }

  await deletePreviousPriceListMessage(channel);

  const sent = await channel.send({ embeds: [priceListEmbed()] }).catch((err) => {
    console.error('Failed to post daily price list:', err);
    return null;
  });
  if (sent) lastPriceListMessageId = sent.id;
}

function scheduleDailyPriceList() {
  if (!PRICELIST_CHANNEL_ID) return;
  const delay = msUntilNextUtcHour(PHT_POST_UTC_HOUR);
  console.log(`Daily price list scheduled — next post in ${Math.round(delay / 1000 / 60)} minutes.`);
  setTimeout(() => {
    postDailyPriceList();
    setInterval(postDailyPriceList, 24 * 60 * 60 * 1000);
  }, delay);
}

// ---------- Client ready ----------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  scheduleDailyPriceList();
});

// ---------- Interaction handling ----------
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'pricelist') {
        return interaction.reply({ embeds: [priceListEmbed()] });
      }
      if (interaction.commandName === 'shop') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('shop_start').setLabel('Start Order').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
          new ButtonBuilder().setCustomId('shop_pricelist').setLabel('View Price List').setStyle(ButtonStyle.Secondary).setEmoji('📋')
        );
        return interaction.reply({ embeds: [shopPanelEmbed(studioStatus)], components: [row] });
      }

      if (interaction.commandName === 'say') {
        if (!interaction.guild) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: "🚫 You don't have permission to use this command.", ephemeral: true });
        }

        const message = interaction.options.getString('message', true);
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (!targetChannel?.isTextBased?.()) {
          return interaction.reply({ content: 'Please choose a text channel.', ephemeral: true });
        }

        await targetChannel.send({ content: message });
        return interaction.reply({ content: `✅ Message sent in ${targetChannel}.`, ephemeral: true });
      }

      if (interaction.commandName === 'read') {
        if (!interaction.guild) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: "🚫 You don't have permission to use this command.", ephemeral: true });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        if (!targetChannel?.isTextBased?.()) {
          return interaction.reply({ content: 'Please choose a text channel.', ephemeral: true });
        }

        let messages;
        try {
          messages = await targetChannel.messages.fetch({ limit: 100 });
        } catch (err) {
          return interaction.reply({
            content:
              "Couldn't read that channel. Make sure the bot's role has **View Channel** and **Read Message History** there (check Ticket V2's permission setup for the ticket category).",
            ephemeral: true,
          });
        }

        const transcript = [...messages.values()]
          .reverse()
          .filter((m) => m.content && !m.author.bot)
          .map((m) => `${m.author.username}: ${m.content}`)
          .join('\n')
          .slice(0, 4000);

        if (!transcript) {
          return interaction.reply({ content: 'No readable messages found in that ticket yet.', ephemeral: true });
        }

        const guess = guessOrderFromTranscript(transcript);
        pendingScans.set(interaction.user.id, { channelId: targetChannel.id });

        return interaction.showModal(buildStaffReadModal(guess));
      }

      if (interaction.commandName === 'status') {
        if (!interaction.guild) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: "🚫 You don't have permission to use this command.", ephemeral: true });
        }

        const state = interaction.options.getString('state', true); // 'open' | 'closed'
        const note = interaction.options.getString('note');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (!targetChannel?.isTextBased?.()) {
          return interaction.reply({ content: 'Please choose a text channel.', ephemeral: true });
        }

        studioStatus = state;

        await client.user
          .setPresence({
            status: state === 'open' ? 'online' : 'idle',
            activities: [{ name: state === 'open' ? 'Open for orders 🟢' : 'Closed 🔴' }],
          })
          .catch((err) => console.error('Failed to update presence:', err));

        const embed = statusAnnouncementEmbed({ status: state, note, staffTag: interaction.user.tag });
        await targetChannel.send({ embeds: [embed] });

        return interaction.reply({ content: `✅ Studio marked **${state.toUpperCase()}** and announced in ${targetChannel}.`, ephemeral: true });
      }
    }

    // Modal: staff correcting the /read guess
    if (interaction.isModalSubmit() && interaction.customId === 'read_confirm_modal') {
      const pending = pendingScans.get(interaction.user.id);
      pendingScans.delete(interaction.user.id);

      if (!pending) {
        return interaction.reply({ content: 'This form expired — please run `/read` again.', ephemeral: true });
      }

      const rawService = interaction.fields.getTextInputValue('service').trim().toLowerCase();
      const serviceMap = { solo: 'solo', couple: 'couple', group: 'group', gang: 'group', family: 'family', video: 'video' };
      const service = serviceMap[rawService];

      if (!service) {
        return interaction.reply({
          content: `Unrecognized service "${rawService}". Please run \`/read\` again and enter one of: solo, couple, group, family, video.`,
          ephemeral: true,
        });
      }

      const opts = {};
      opts.graphicDesign = yesNo(interaction.fields.getTextInputValue('graphicDesign'));
      const tattooRaw = interaction.fields.getTextInputValue('tattooCount');
      opts.tattooCount = tattooRaw ? parseInt(tattooRaw, 10) || 0 : 0;

      if (service === 'group' || service === 'family') {
        const memberRaw = interaction.fields.getTextInputValue('memberCount');
        opts.memberCount = parseInt(memberRaw, 10) || (service === 'group' ? 10 : 5);
        const xmlRaw = interaction.fields.getTextInputValue('xmlCount');
        opts.xmlCount = xmlRaw ? parseInt(xmlRaw, 10) || 0 : 0;
      }

      let priceResult;
      try {
        priceResult = calculatePrice(service, opts);
      } catch (err) {
        return interaction.reply({ content: `Something went wrong: ${err.message}`, ephemeral: true });
      }

      draftReceipts.set(interaction.user.id, {
        channelId: pending.channelId,
        service,
        priceResult,
      });

      const embed = draftOrderEmbed({
        serviceLabel: SERVICES[service],
        breakdown: priceResult.breakdown,
        total: priceResult.total,
        sourceNote: `Scanned from <#${pending.channelId}>`,
      });

      return interaction.reply({ embeds: [embed], components: [receiptConfirmRow()], ephemeral: true });
    }

    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId === 'shop_start') {
        if (studioStatus === 'closed') {
          return interaction.reply({
            content: '🔴 WCKD STUDIO is currently closed and not accepting orders. Please check back later!',
            ephemeral: true,
          });
        }
        return interaction.reply({
          content: 'What would you like to order?',
          components: [serviceSelectRow()],
          ephemeral: true,
        });
      }

      if (interaction.customId === 'shop_pricelist') {
        return interaction.reply({ embeds: [priceListEmbed()], ephemeral: true });
      }

      if (interaction.customId === 'order_cancel') {
        sessions.delete(interaction.user.id);
        return interaction.update({ content: '❌ Order cancelled.', embeds: [], components: [] });
      }

      if (interaction.customId === 'read_discard') {
        draftReceipts.delete(interaction.user.id);
        return interaction.update({ content: '❌ Draft discarded — nothing was posted.', embeds: [], components: [] });
      }

      if (interaction.customId === 'read_finalize') {
        const draft = draftReceipts.get(interaction.user.id);
        if (!draft) {
          return interaction.reply({ content: 'This draft expired — please run `/read` again.', ephemeral: true });
        }

        await interaction.deferUpdate();

        const targetChannel = await client.channels.fetch(draft.channelId).catch(() => null);
        if (!targetChannel) {
          draftReceipts.delete(interaction.user.id);
          return interaction.editReply({ content: 'Could not find that ticket channel anymore — draft discarded.', embeds: [], components: [] });
        }

        const customer = await findTicketCustomer(targetChannel);

        const embed = receiptEmbed({
          receiptId: nextReceiptId(),
          serviceLabel: SERVICES[draft.service],
          breakdown: draft.priceResult.breakdown,
          total: draft.priceResult.total,
          customer,
          issuedBy: interaction.user,
          sourceNote: 'Generated from ticket transcript',
        });

        await targetChannel.send({ embeds: [embed] });
        draftReceipts.delete(interaction.user.id);

        return interaction.editReply({
          content: `✅ Receipt posted in ${targetChannel}.`,
          embeds: [],
          components: [],
        });
      }

      if (interaction.customId === 'order_confirm') {
        const session = sessions.get(interaction.user.id);
        if (!session) {
          return interaction.reply({ content: 'Session expired — please start over with `/shop`.', ephemeral: true });
        }

        await interaction.deferUpdate();

        const { service, priceResult, extraDetails } = session;
        const embed = orderSummaryEmbed({
          user: interaction.user,
          serviceLabel: SERVICES[service],
          breakdown: priceResult.breakdown,
          total: priceResult.total,
          extraDetails,
        });

        // Post to staff log channel, if configured
        if (STAFF_LOG_CHANNEL_ID) {
          const logChannel = await client.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(() => null);
          if (logChannel) {
            await logChannel.send({
              content: `${STAFF_ROLE_ID_LIST.map((id) => `<@&${id}>`).join(' ')} New order from <@${interaction.user.id}>`.trim(),
              embeds: [embed],
            });
          }
        }

        // Create a private ticket channel for this order
        let ticketChannel = null;
        if (interaction.guild) {
          const overwrites = [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
          ];
          for (const roleId of STAFF_ROLE_ID_LIST) {
            overwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
          }

          const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'order';
          ticketChannel = await interaction.guild.channels
            .create({
              name: `order-${safeName}`,
              type: ChannelType.GuildText,
              parent: TICKET_CATEGORY_ID || undefined,
              permissionOverwrites: overwrites,
            })
            .catch(() => null);

          if (ticketChannel) {
            await ticketChannel.send({
              content: `${STAFF_ROLE_ID_LIST.map((id) => `<@&${id}> `).join('')}<@${interaction.user.id}> welcome to your WCKD STUDIO order ticket! A staff member will assist you shortly.`,
              embeds: [embed],
            });
          }
        }

        sessions.delete(interaction.user.id);

        return interaction.editReply({
          content: ticketChannel
            ? `✅ Order confirmed! Head to ${ticketChannel} to continue with staff.`
            : '✅ Order confirmed! Staff have been notified.',
          embeds: [embed],
          components: [],
        });
      }
    }

    // Select menu (service choice)
    if (interaction.isStringSelectMenu() && interaction.customId === 'svc_select') {
      const service = interaction.values[0];

      if (!SERVICES[service]) {
        return interaction.update({ content: 'Unknown service.', components: [] });
      }

      return interaction.showModal(buildModal(service));
    }

    // Modal submissions
    if (interaction.isModalSubmit() && interaction.customId.startsWith('order_modal_')) {
      const service = interaction.customId.replace('order_modal_', '');

      if (service === 'video') {
        const projectDetails = interaction.fields.getTextInputValue('projectDetails');
        const priceResult = calculatePrice('video');
        sessions.set(interaction.user.id, { service, priceResult, extraDetails: projectDetails });

        const embed = orderSummaryEmbed({
          user: interaction.user,
          serviceLabel: SERVICES[service],
          breakdown: [],
          total: null,
          extraDetails: projectDetails,
        });

        return interaction.reply({ embeds: [embed], components: [confirmCancelRow()], ephemeral: true });
      }

      const opts = {};
      opts.graphicDesign = yesNo(interaction.fields.getTextInputValue('graphicDesign'));
      const tattooRaw = interaction.fields.getTextInputValue('tattooCount');
      opts.tattooCount = tattooRaw ? parseInt(tattooRaw, 10) || 0 : 0;

      if (service === 'group' || service === 'family') {
        const memberRaw = interaction.fields.getTextInputValue('memberCount');
        opts.memberCount = parseInt(memberRaw, 10) || (service === 'group' ? 10 : 5);
      }

      if (service === 'group' || service === 'family') {
        const xmlRaw = interaction.fields.getTextInputValue('xmlCount');
        opts.xmlCount = xmlRaw ? parseInt(xmlRaw, 10) || 0 : 0;
      }

      let priceResult;
      try {
        priceResult = calculatePrice(service, opts);
      } catch (err) {
        return interaction.reply({ content: `Something went wrong: ${err.message}`, ephemeral: true });
      }

      sessions.set(interaction.user.id, { service, opts, priceResult, extraDetails: null });

      const embed = orderSummaryEmbed({
        user: interaction.user,
        serviceLabel: SERVICES[service],
        breakdown: priceResult.breakdown,
        total: priceResult.total,
        extraDetails: null,
      });

      return interaction.reply({ embeds: [embed], components: [confirmCancelRow()], ephemeral: true });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong handling that — please try again.', ephemeral: true }).catch(() => {});
    }
  }
});

registerCommands().then(() => client.login(DISCORD_TOKEN));
