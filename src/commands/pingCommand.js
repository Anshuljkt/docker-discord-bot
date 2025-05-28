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
      // Reply with a defer
      console.log(`[PingCommand] Deferring reply...`);
      interaction.deferReply();
      
      // Sleep for 4 seconds to simulate processing time
      // console.log(`[PingCommand] Simulating processing delay...`);
      // await new Promise(resolve => setTimeout(resolve, 4000));
      const responseTime = Date.now() - startTime;
      const apiLatency = interaction.client.ws.ping;
      
      console.log(`[PingCommand] Response latency: ${responseTime}ms`);
      console.log(`[PingCommand] API latency: ${apiLatency}ms`);
      
      // Edit the response with the final ping information
      console.log(`[PingCommand] Updating reply with final result...`);
      await interaction.editReply(`Pong! Response time: ${responseTime}ms, API latency: ${apiLatency}ms`);
      console.log(`[PingCommand] Ping command completed successfully`);
      
    } catch (error) {
      console.error(`[PingCommand] Error executing ping command:`, error);
      console.error(`[PingCommand] Error stack:`, error.stack);
      
      try {
        // Simplified error handling - just try to respond if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'Error executing ping command', 
            ephemeral: true 
          });
        }
      } catch (replyError) {
        console.error(`[PingCommand] Error sending error reply:`, replyError);
      }
    }
  }
};
