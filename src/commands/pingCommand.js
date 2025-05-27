/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Checks if the bot is responsive'),

  async execute(interaction) {
    console.log(`[PingCommand] Executing ping command for user: ${interaction.user.tag} (${interaction.user.id})`);
    console.log(`[PingCommand] Guild: ${interaction.guild?.name || 'DM'} (${interaction.guildId || 'N/A'})`);
    console.log(`[PingCommand] Channel: ${interaction.channelId}`);
    
    try {
      console.log(`[PingCommand] Sending initial reply...`);
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      console.log(`[PingCommand] Initial reply sent successfully`);
      
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      console.log(`[PingCommand] Calculated latency: ${latency}ms`);
      console.log(`[PingCommand] API latency: ${interaction.client.ws.ping}ms`);
      
      console.log(`[PingCommand] Editing reply with final result...`);
      await interaction.editReply(`Pong! Bot latency: ${latency}ms, API latency: ${interaction.client.ws.ping}ms`);
      console.log(`[PingCommand] Ping command completed successfully`);
      
    } catch (error) {
      console.error(`[PingCommand] Error executing ping command:`, error);
      console.error(`[PingCommand] Error stack:`, error.stack);
      
      try {
        if (!interaction.replied) {
          await interaction.reply({ content: 'Error executing ping command', ephemeral: true });
        } else {
          await interaction.followUp({ content: 'Error completing ping command', ephemeral: true });
        }
      } catch (replyError) {
        console.error(`[PingCommand] Error sending error reply:`, replyError);
      }
    }
  }
};
