// Optional: run `npm run deploy` to (re)register slash commands without starting the bot.
// index.js already does this automatically every time it boots, so this is only
// needed if you want to push command changes without restarting the bot process.
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const commands = [
  new SlashCommandBuilder().setName('shop').setDescription('Open the WCKD STUDIO shop panel'),
  new SlashCommandBuilder().setName('pricelist').setDescription('View the full WCKD STUDIO price list'),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log('Successfully registered slash commands.');
  } catch (err) {
    console.error(err);
  }
})();
