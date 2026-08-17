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
const { priceListEmbed, shopPanelEmbed, orderSummaryEmbed } = require('./utils/embeds');

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  STAFF_LOG_CHANNEL_ID,
  TICKET_CATEGORY_ID,
  STAFF_ROLE_IDS,
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
      { label: 'Family — ₱600', value: 'family', emoji: '👨‍👩‍👧‍👦' },
      { label: 'Group / Gang — from ₱1,000', value: 'group', emoji: '👥' },
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

function confirmCancelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order_confirm').setLabel('Confirm & Create Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('order_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('✖️')
  );
}

// ---------- Client ready ----------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
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
        return interaction.reply({ embeds: [shopPanelEmbed()], components: [row] });
      }
    }

    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId === 'shop_start') {
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
