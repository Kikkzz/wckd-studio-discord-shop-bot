const { EmbedBuilder } = require('discord.js');
const { peso } = require('./pricing');

const BRAND_COLOR = 0x8b5cf6; // purple

function priceListEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🖤 WCKD STUDIO — PRICE LIST')
    .addFields(
      {
        name: '📸 Photo Services',
        value: [
          '**SOLO** — ₱250',
          '↳ +₱250 Graphic Design',
          '',
          '**COUPLE** — ₱350',
          '↳ +₱250 Graphic Design',
          '',
          '**FAMILY** — ₱600',
          '↳ Max. 5 members',
          '↳ +₱50 for XML Creation',
          '↳ +₱50 additional for Tattoos in character',
          '↳ +₱250 Graphic Design',
          '',
          '**GROUP / GANG** — starts at ₱1,000',
          '↳ Max. 10 members',
          '↳ +₱50 for XML Creation',
          '↳ +₱100 per extra member with tattoos',
          '↳ +₱500 Graphic Design',
        ].join('\n'),
      },
      {
        name: '🎬 Video Edit',
        value: 'DM for Quote\n↳ Pricing depends on project complexity.',
      },
      {
        name: '🎨 Add-ons',
        value: ['Tattoos — +₱50 / character', 'XML Creation — +₱50 / character'].join('\n'),
      }
    )
    .setFooter({
      text: 'Prices may vary depending on the complexity of your request. Major revisions or additional requests may cost extra.',
    });
}

function shopPanelEmbed(status = 'open') {
  const isOpen = status === 'open';
  const embed = new EmbedBuilder()
    .setColor(isOpen ? 0x22c55e : 0xef4444)
    .setTitle('🖤 WCKD STUDIO')
    .setDescription(
      "Welcome to **WCKD STUDIO**!\n\n Use `/pricelist` any time to see full pricing of our service!"
    )
    .addFields({ name: 'Status', value: isOpen ? '🟢 Open — now accepting orders' : '🔴 Closed — not accepting orders right now' });
  return embed;
}

function statusAnnouncementEmbed({ status, note, staffTag }) {
  const isOpen = status === 'open';
  const embed = new EmbedBuilder()
    .setColor(isOpen ? 0x22c55e : 0xef4444)
    .setTitle(isOpen ? '🟢 WCKD STUDIO is now OPEN' : '🔴 WCKD STUDIO is now CLOSED')
    .setDescription(isOpen ? "We're accepting orders! Run `/shop` to place one." : "We're not accepting orders right now — check back soon.")
    .setTimestamp();

  if (note) {
    embed.addFields({ name: 'Note', value: note.slice(0, 1024) });
  }
  if (staffTag) {
    embed.setFooter({ text: `Updated by ${staffTag}` });
  }

  return embed;
}

function orderSummaryEmbed({ user, serviceLabel, breakdown, total, extraDetails }) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`🧾 Order Summary — ${serviceLabel}`)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setTimestamp();

  if (total === null) {
    embed.setDescription('This is a **quote request**. A staff member will DM you with pricing based on your project details.');
  } else {
    const lines = breakdown.map(([label, cost]) => `${label} — ${peso(cost)}`);
    embed.addFields({ name: 'Breakdown', value: lines.join('\n') || 'N/A' });
    embed.addFields({ name: 'Total', value: `**${peso(total)}**` });
  }

  if (extraDetails) {
    embed.addFields({ name: 'Details Provided', value: extraDetails.slice(0, 1024) });
  }

  return embed;
}

function draftOrderEmbed({ serviceLabel, breakdown, total, sourceNote }) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`📝 Draft Order — ${serviceLabel}`)
    .setDescription('Review the details below. If anything is wrong, cancel and run `/read` again — the next form will let you fix it.')
    .setTimestamp();

  if (total === null) {
    embed.addFields({ name: 'Note', value: 'Video Edit is a quote — no fixed price to calculate.' });
  } else {
    const lines = breakdown.map(([label, cost]) => `${label} — ${peso(cost)}`);
    embed.addFields({ name: 'Breakdown', value: lines.join('\n') || 'N/A' });
    embed.addFields({ name: 'Total', value: `**${peso(total)}**` });
  }

  if (sourceNote) {
    embed.setFooter({ text: sourceNote });
  }

  return embed;
}

function receiptEmbed({ receiptId, serviceLabel, breakdown, total, customer, issuedBy, sourceNote }) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🧾 WCKD STUDIO — Official Receipt')
    .addFields({ name: 'Receipt No.', value: receiptId, inline: true }, { name: 'Service', value: serviceLabel, inline: true })
    .setTimestamp();

  if (customer) {
    embed.addFields({ name: 'Customer', value: `<@${customer.id}>`, inline: true });
  }

  if (total === null) {
    embed.addFields({ name: 'Note', value: 'Quote request — final price to be confirmed by staff.' });
  } else {
    const lines = breakdown.map(([label, cost]) => `${label} — ${peso(cost)}`);
    embed.addFields({ name: 'Breakdown', value: lines.join('\n') || 'N/A' });
    embed.addFields({ name: 'Total', value: `**${peso(total)}**` });
  }

  if (issuedBy) {
    embed.setFooter({ text: `Issued by ${issuedBy.tag}${sourceNote ? ` • ${sourceNote}` : ''}` });
  }

  return embed;
}

module.exports = { priceListEmbed, shopPanelEmbed, statusAnnouncementEmbed, orderSummaryEmbed, draftOrderEmbed, receiptEmbed, BRAND_COLOR };
