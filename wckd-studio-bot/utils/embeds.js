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
          '**GROUP / GANG** — starts at ₱1,000',
          '↳ Max. 10 members',
          '↳ +₱30 per extra member',
          '↳ +₱50 per character with tattoos',
          '↳ +₱500 Graphic Design',
          '↳ XML available? Send it with your order.',
          '',
          '**FAMILY** — ₱500',
          '↳ Max. 5 members',
          '↳ +₱250 Graphic Design',
        ].join('\n'),
      },
      {
        name: '🎬 Video Edit',
        value: 'DM for Quote\n↳ Pricing depends on project complexity.',
      },
      {
        name: '🎨 Add-ons',
        value: ['Tattoos — +₱50 / character', 'XML Creation — +₱100 / character'].join('\n'),
      }
    )
    .setFooter({
      text: 'Prices may vary depending on the complexity of your request. Major revisions or additional requests may cost extra.',
    });
}

function shopPanelEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🖤 WCKD STUDIO')
    .setDescription(
      "Welcome to **WCKD STUDIO**! Click **Start Order** below to place an order and we'll walk you through it.\n\nUse `/pricelist` any time to see full pricing."
    );
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

module.exports = { priceListEmbed, shopPanelEmbed, orderSummaryEmbed, BRAND_COLOR };
