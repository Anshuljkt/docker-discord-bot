/**
 * dd-bot - A Discord Bot to control Docker containers
 * Docker Service to interact with Docker API
 */

const Docker = require('dockerode');

class DockerService {
  constructor(settings) {
    // Connect to Docker socket
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.containers = [];
    this.updateInterval = null;
    this.settings = settings;
  }

  /**
   * Helper method to log messages and optionally add to output array
   * @param {string} message - Message to log
   * @param {Array} outputArray - Optional output array to append to
   * @param {string} level - Log level: 'log', 'error', 'warn'
   */
  logAndOutput(message, outputArray = null, level = 'log') {
    // Log to console
    switch (level) {
      case 'error':
        console.error(`[DockerService] ${message}`);
        break;
      case 'warn':
        console.warn(`[DockerService] ${message}`);
        break;
      default:
        console.log(`[DockerService] ${message}`);
        break;
    }

    // Add to output array if provided
    if (outputArray && Array.isArray(outputArray)) {
      outputArray.push(message);
    }
  }

  /**
   * Initialize the Docker service
   */
  async init() {
    await this.dockerUpdate();
    // Set up periodic updates
    this.updateInterval = setInterval(() => this.dockerUpdate(), 60000); // Update every minute
  }

  /**
   * Update container list from Docker API
   */
  async dockerUpdate() {
    try {
      this.containers = await this.docker.listContainers({ all: true });
      console.log(`Updated container list: ${this.containers.length} containers found`);

      // Debug first container if available
      if (this.containers.length > 0) {
        console.log(`First container details: ID=${this.containers[0].Id.substring(0, 12)}, State=${this.containers[0].State}, Status=${this.containers[0].Status}`);
      }

      return this.containers;
    } catch (error) {
      console.error(`Error updating containers: ${error.message}`);
      return [];
    }
  }

  /**
   * Get container by ID or name
   * @param {string} idOrName - Container ID or name
   * @returns {Object|null} Container object or null if not found
   */
  getContainer(idOrName) {
    const container = this.containers.find(c =>
      c.Id === idOrName ||
      c.Names.some(name => name.replace('/', '') === idOrName),
    );

    return container ? this.docker.getContainer(container.Id) : null;
  }

  /**
   * Start a container
   * @param {string} id - Container ID or name
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCommandStart(id) {
    const output = [];

    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }

      // Get the container name for better logging
      const containerInfo = this.containers.find(c => c.Id === container.id);
      const containerName = containerInfo ? containerInfo.Names[0].replace('/', '') : id;

      this.logAndOutput(`Attempting to start container: ${containerName}`, output);

      // Inspect the container before starting
      const inspectData = await container.inspect();
      this.logAndOutput(`Container state before start: ${JSON.stringify(inspectData.State)}`);

      if (inspectData.State.Running) {
        this.logAndOutput(`Container ${containerName} is already running`, output);
        return { success: true, output: output.join('\n') };
      }

      this.logAndOutput(`Starting container ${containerName}...`, output);
      await container.start();
      this.logAndOutput(`Start command sent to ${containerName}`, output);

      // Inspect the container after starting
      const afterInspect = await container.inspect();
      this.logAndOutput(`Container state after start: ${JSON.stringify(afterInspect.State)}`);

      await this.dockerUpdate();

      if (afterInspect.State.Running) {
        this.logAndOutput(`✓ Container ${containerName} started successfully`, output);
        return { success: true, output: output.join('\n') };
      } else {
        this.logAndOutput(`✗ Container ${containerName} failed to start`, output, 'error');
        return { success: false, output: output.join('\n') };
      }
    } catch (error) {
      const errorMessage = `Error starting container ${id}: ${error.message}`;
      this.logAndOutput(errorMessage, output, 'error');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Stop a container
   * @param {string} id - Container ID or name
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCommandStop(id) {
    const output = [];

    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }

      // Get the container name for better logging
      const containerInfo = this.containers.find(c => c.Id === container.id);
      const containerName = containerInfo ? containerInfo.Names[0].replace('/', '') : id;

      this.logAndOutput(`Attempting to stop container: ${containerName}`, output);

      // Inspect the container before stopping
      const inspectData = await container.inspect();
      this.logAndOutput(`Container state before stop: ${JSON.stringify(inspectData.State)}`);

      if (!inspectData.State.Running) {
        this.logAndOutput(`Container ${containerName} is already stopped`, output);
        return { success: true, output: output.join('\n') };
      }

      this.logAndOutput(`Stopping container ${containerName}...`, output);
      await container.stop();
      this.logAndOutput(`Stop command sent to ${containerName}`, output);

      // Inspect the container after stopping
      const afterInspect = await container.inspect();
      this.logAndOutput(`Container state after stop: ${JSON.stringify(afterInspect.State)}`);

      await this.dockerUpdate();

      if (!afterInspect.State.Running) {
        this.logAndOutput(`✓ Container ${containerName} stopped successfully`, output);
        return { success: true, output: output.join('\n') };
      } else {
        this.logAndOutput(`✗ Container ${containerName} failed to stop`, output, 'error');
        return { success: false, output: output.join('\n') };
      }
    } catch (error) {
      const errorMessage = `Error stopping container ${id}: ${error.message}`;
      this.logAndOutput(errorMessage, output, 'error');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Restart a container
   * @param {string} id - Container ID or name
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCommandRestart(id) {
    const output = [];

    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }

      // Get the container name for better logging
      const containerInfo = this.containers.find(c => c.Id === container.id);
      const containerName = containerInfo ? containerInfo.Names[0].replace('/', '') : id;

      this.logAndOutput(`Attempting to restart container: ${containerName}`, output);

      // Inspect the container before restarting
      const inspectData = await container.inspect();
      this.logAndOutput(`Container state before restart: ${JSON.stringify(inspectData.State)}`);

      this.logAndOutput(`Restarting container ${containerName}...`, output);
      await container.restart();
      this.logAndOutput(`Restart command sent to ${containerName}`, output);

      // Inspect the container after restarting
      const afterInspect = await container.inspect();
      this.logAndOutput(`Container state after restart: ${JSON.stringify(afterInspect.State)}`);

      await this.dockerUpdate();

      if (afterInspect.State.Running) {
        this.logAndOutput(`✓ Container ${containerName} restarted successfully`, output);
        return { success: true, output: output.join('\n') };
      } else {
        this.logAndOutput(`✗ Container ${containerName} failed to restart`, output, 'error');
        return { success: false, output: output.join('\n') };
      }
    } catch (error) {
      const errorMessage = `Error restarting container ${id}: ${error.message}`;
      this.logAndOutput(errorMessage, output, 'error');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Execute a command inside a container
   * @param {string} id - Container ID or name
   * @param {string} command - Command to execute
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCommandExec(id, command) {
    const output = [];

    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }

      // Get the container name for better logging
      const containerInfo = this.containers.find(c => c.Id === container.id);
      const containerName = containerInfo ? containerInfo.Names[0].replace('/', '') : id;

      this.logAndOutput(`Attempting to execute command in container: ${containerName}`, output);
      this.logAndOutput(`Command: ${command}`, output);

      // Check if container is running
      const inspectData = await container.inspect();
      if (!inspectData.State.Running) {
        throw new Error(`Container '${containerName}' is not running`);
      }

      this.logAndOutput(`Executing command in ${containerName}...`, output);

      const exec = await container.exec({
        // Use bash for command execution with proper argument parsing
        Cmd: ['bash', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start();

      const commandResult = await new Promise((resolve, reject) => {
        let stdoutOutput = '';
        let stderrOutput = '';

        // Handle stdout data
        stream.on('data', (chunk) => {
          stdoutOutput += chunk.toString();
        });

        // Handle stderr data if available
        stream.stderr?.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });

        // Handle stream end
        stream.on('end', () => {
          // If there's stderr output, include it in the result
          const commandOutput = stderrOutput ?
            `STDOUT:\n${stdoutOutput}\nSTDERR:\n${stderrOutput}` :
            stdoutOutput;
          resolve(commandOutput);
        });

        // Handle errors
        stream.on('error', (err) => {
          reject(err);
        });
      });

      this.logAndOutput(`✓ Command executed successfully in ${containerName}`, output);
      this.logAndOutput(`Command output:\n${commandResult}`, output);

      return { success: true, output: output.join('\n') };
    } catch (error) {
      const errorMessage = `Error executing command in container ${id}: ${error.message}`;
      this.logAndOutput(errorMessage, output, 'error');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Special command for fixing Jellyfin and related services
   * @param {Function} progressCallback - Optional callback for real-time progress updates
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCustomCommandJellyfinFix(progressCallback = null) {
    const output = [];
    const containers = ['jellyfin', 'jellystat', 'jellystat-db'];

    const updateProgress = (message) => {
      this.logAndOutput(message, output);
      if (progressCallback) {
        progressCallback(output.join('\n'));
      }
    };

    updateProgress(`Containers to restart: ${containers.join(', ')}`);

    // Stop containers
    updateProgress('Stopping containers...');

    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (container) {
        updateProgress(`Stopping ${containerName}...`);
        const stopResult = await this.dockerCommandStop(container.Id);
        // stopResult is now an object with success and output
        if (!stopResult.success) {
          updateProgress(`Failed to stop ${containerName}: ${stopResult.output}`, 'error');
        }
      }
    }

    // Wait for containers to stop with retries
    updateProgress('Waiting for containers to stop...');
    let allStopped = false;

    for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
      updateProgress(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking container status...`);
      await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
      await this.dockerUpdate();

      allStopped = true;
      for (const containerName of containers) {
        const container = this.getContainerByName(containerName);
        if (container && container.State === 'running') {
          updateProgress(`${containerName} is still running... (State: ${container.State}, Status: ${container.Status})`);
          allStopped = false;
          break;
        }
      }

      if (allStopped) {
        updateProgress('All containers stopped successfully.');
        break;
      }
    }

    // Start Jellyfin first
    updateProgress('Starting Jellyfin...');

    const jellyfin = this.getContainerByName('jellyfin');
    if (jellyfin) {
      const startResult = await this.dockerCommandStart(jellyfin.Id);
      if (!startResult.success) {
        updateProgress(`Failed to start Jellyfin: ${startResult.output}`, 'error');
        return { success: false, output: output.join('\n') };
      }

      // Wait for Jellyfin to start with retries
      updateProgress('Waiting for Jellyfin to start...');
      let jellyfinStarted = false;

      for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
        updateProgress(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking Jellyfin status...`);
        await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
        await this.dockerUpdate();

        const updatedJellyfin = this.getContainerByName('jellyfin');
        if (updatedJellyfin && updatedJellyfin.State === 'running') {
          updateProgress('Jellyfin started successfully.');
          jellyfinStarted = true;
          break;
        }
      }

      if (!jellyfinStarted) {
        updateProgress('Failed to start Jellyfin after retries.', 'error');
        return { success: false, output: output.join('\n') };
      }
    } else {
      updateProgress('Jellyfin container not found.', 'error');
      return { success: false, output: output.join('\n') };
    }

    // Wait additional time for Jellyfin to fully initialize
    updateProgress('Waiting for Jellyfin to initialize...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    // Start remaining containers
    updateProgress('Starting remaining containers...');

    for (const containerName of ['jellystat-db', 'jellystat']) {
      const container = this.getContainerByName(containerName);
      if (container) {
        updateProgress(`Starting ${containerName}...`);
        const startResult = await this.dockerCommandStart(container.Id);
        if (!startResult.success) {
          updateProgress(`Failed to start ${containerName}: ${startResult.output}`, 'error');
        }
      }
    }

    // Final check
    updateProgress('Performing final status check...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    await this.dockerUpdate();

    let allRunning = true;
    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (!container || container.State !== 'running') {
        updateProgress(`${containerName} is not running.`, 'warn');
        allRunning = false;
      }
    }

    if (allRunning) {
      updateProgress('✓ All containers are running successfully.');
      return { success: true, output: output.join('\n') };
    } else {
      updateProgress('✗ Not all containers are running. jfFix may not have succeeded completely.', 'warn');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Execute a fail2ban command (ban or unban) on an IP address
   * @param {string} action - Action to perform ('ban' or 'unban')
   * @param {string} ipAddress - IP address to ban/unban
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCustomCommandFail2Ban(action, ipAddress) {
    const output = [];

    try {
      // IP address validation for both IPv4 and IPv6
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^(?:[0-9a-fA-F]{1,4}:)*::[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*$|^(?:[0-9a-fA-F]{1,4}:)*:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*$|^::ffff:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      const isValidIPv4 = ipv4Regex.test(ipAddress);
      const isValidIPv6 = ipv6Regex.test(ipAddress);
      
      if (!isValidIPv4 && !isValidIPv6) {
        throw new Error(`Invalid IP address format: ${ipAddress}. Must be a valid IPv4 or IPv6 address.`);
      }

      // Validate action
      if (!['ban', 'unban'].includes(action)) {
        throw new Error(`Invalid action: ${action}. Must be 'ban' or 'unban'.`);
      }

      const ipType = isValidIPv4 ? 'IPv4' : 'IPv6';
      this.logAndOutput(`Attempting to ${action} ${ipType} address: ${ipAddress}`, output);

      // Find the fail2ban container
      const fail2banContainer = this.getContainerByName('fail2ban');
      if (!fail2banContainer) {
        throw new Error('fail2ban container not found');
      }

      this.logAndOutput(`Found fail2ban container`, output);

      // Check if fail2ban container is running
      if (fail2banContainer.State !== 'running') {
        throw new Error('fail2ban container is not running');
      }

      this.logAndOutput(`Executing ${action} command for IP: ${ipAddress}`, output);

      // Execute the fail2ban-client command
      const command = `fail2ban-client ${action} ${ipAddress}`;
      const execResult = await this.dockerCommandExec(fail2banContainer.Id, command);

      if (execResult.success) {
        this.logAndOutput(`✓ Successfully executed ${action} command for ${ipAddress}`, output);
        this.logAndOutput(`Command output: ${execResult.output}`, output);
        return { success: true, output: output.join('\n') };
      } else {
        this.logAndOutput(`✗ Failed to execute ${action} command for ${ipAddress}`, output, 'error');
        this.logAndOutput(`Error output: ${execResult.output}`, output, 'error');
        return { success: false, output: output.join('\n') };
      }
    } catch (error) {
      const errorMessage = `Error ${action}ning IP ${ipAddress}: ${error.message}`;
      this.logAndOutput(errorMessage, output, 'error');
      return { success: false, output: output.join('\n') };
    }
  }

  /**
   * Ban an IP address using fail2ban
   * @param {string} ipAddress - IP address to ban
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCustomCommandBanIP(ipAddress) {
    return this.dockerCustomCommandFail2Ban('ban', ipAddress);
  }

  /**
   * Unban an IP address using fail2ban
   * @param {string} ipAddress - IP address to unban
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCustomCommandUnbanIP(ipAddress) {
    return this.dockerCustomCommandFail2Ban('unban', ipAddress);
  }

  /**
   * Helper to get container by name
   * @param {string} name - Container name
   * @returns {Object|null} Container object or null
   */
  getContainerByName(name) {
    return this.containers.find(container =>
      container.Names.some(containerName => containerName.replace('/', '') === name),
    );
  }

  /**
   * Get container information
   * @returns {Array<Object>} Array of container information objects
   */
  getContainerInfo() {
    return this.containers.map(container => {
      // Format container information
      const name = container.Names[0].replace('/', '');
      const state = container.State;
      const status = container.Status;

      return {
        id: container.Id.substring(0, 12), // Short ID
        name,
        state,
        status,
        image: container.Image,
      };
    });
  }

  /**
   * Check if a container is running
   * @param {Object} container - Container object from dockerode
   * @returns {boolean} True if running, false otherwise
   */
  isContainerRunning(container) {
    // Possible state values: "created", "running", "paused", "restarting", "exited", "dead"
    return container.State === 'running';
  }
}

// Export the class rather than an instance to allow proper initialization with settings
module.exports = { DockerService };
