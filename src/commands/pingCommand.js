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
    
    const startTime = Date.now();
    
    try {
      console.log(`[PingCommand] Deferring reply to avoid timeout...`);
      // Use deferReply to prevent timeout issues
      await interaction.deferReply();
      console.log(`[PingCommand] Reply deferred successfully`);
      
      const deferTime = Date.now();
      const deferLatency = deferTime - startTime;
      
      console.log(`[PingCommand] Defer latency: ${deferLatency}ms`);
      console.log(`[PingCommand] API latency: ${interaction.client.ws.ping}ms`);
      
      console.log(`[PingCommand] Editing reply with final result...`);
      await interaction.editReply(`Pong! Defer latency: ${deferLatency}ms, API latency: ${interaction.client.ws.ping}ms`);
      console.log(`[PingCommand] Ping command completed successfully`);
      
    } catch (error) {
      console.error(`[PingCommand] Error executing ping command:`, error);
      console.error(`[PingCommand] Error stack:`, error.stack);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply('Error executing ping command');
        } else if (!interaction.replied) {
          await interaction.reply({ content: 'Error executing ping command', flags: 64 }); // 64 = ephemeral flag
        } else {
          await interaction.followUp({ content: 'Error completing ping command', flags: 64 });
        }
      } catch (replyError) {
        console.error(`[PingCommand] Error sending error reply:`, replyError);
      }
    }
  }
};
