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
   * @returns {Promise<{success: boolean, output: string}>} Success status and command output
   */
  async dockerCustomCommandJellyfinFix() {
    const output = [];
    const containers = ['jellyfin', 'jellystat', 'jellystat-db'];

    this.logAndOutput(`Containers to restart: ${containers.join(', ')}`, output);

    // Stop containers
    this.logAndOutput('Stopping containers...', output);

    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (container) {
        this.logAndOutput(`Stopping ${containerName}...`, output);
        const stopResult = await this.dockerCommandStop(container.Id);
        // stopResult is now an object with success and output
        if (!stopResult.success) {
          this.logAndOutput(`Failed to stop ${containerName}: ${stopResult.output}`, output, 'error');
        }
      }
    }

    // Wait for containers to stop with retries
    this.logAndOutput('Waiting for containers to stop...', output);
    let allStopped = false;

    for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
      this.logAndOutput(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking container status...`);
      await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
      await this.dockerUpdate();

      allStopped = true;
      for (const containerName of containers) {
        const container = this.getContainerByName(containerName);
        if (container && container.State === 'running') {
          this.logAndOutput(`${containerName} is still running... (State: ${container.State}, Status: ${container.Status})`);
          allStopped = false;
          break;
        }
      }

      if (allStopped) {
        this.logAndOutput('All containers stopped successfully.', output);
        break;
      }
    }

    // Start Jellyfin first
    this.logAndOutput('Starting Jellyfin...', output);

    const jellyfin = this.getContainerByName('jellyfin');
    if (jellyfin) {
      const startResult = await this.dockerCommandStart(jellyfin.Id);
      if (!startResult.success) {
        this.logAndOutput(`Failed to start Jellyfin: ${startResult.output}`, output, 'error');
        return { success: false, output: output.join('\n') };
      }

      // Wait for Jellyfin to start with retries
      this.logAndOutput('Waiting for Jellyfin to start...', output);
      let jellyfinStarted = false;

      for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
        this.logAndOutput(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking Jellyfin status...`);
        await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
        await this.dockerUpdate();

        const updatedJellyfin = this.getContainerByName('jellyfin');
        if (updatedJellyfin && updatedJellyfin.State === 'running') {
          this.logAndOutput('Jellyfin started successfully.', output);
          jellyfinStarted = true;
          break;
        }
      }

      if (!jellyfinStarted) {
        this.logAndOutput('Failed to start Jellyfin after retries.', output, 'error');
        return { success: false, output: output.join('\n') };
      }
    } else {
      this.logAndOutput('Jellyfin container not found.', output, 'error');
      return { success: false, output: output.join('\n') };
    }

    // Wait additional time for Jellyfin to fully initialize
    this.logAndOutput('Waiting for Jellyfin to initialize...', output);
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    // Start remaining containers
    this.logAndOutput('Starting remaining containers...', output);

    for (const containerName of ['jellystat-db', 'jellystat']) {
      const container = this.getContainerByName(containerName);
      if (container) {
        this.logAndOutput(`Starting ${containerName}...`, output);
        const startResult = await this.dockerCommandStart(container.Id);
        if (!startResult.success) {
          this.logAndOutput(`Failed to start ${containerName}: ${startResult.output}`, output, 'error');
        }
      }
    }

    // Final check
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    await this.dockerUpdate();

    let allRunning = true;
    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (!container || container.State !== 'running') {
        this.logAndOutput(`${containerName} is not running.`, output, 'warn');
        allRunning = false;
      }
    }

    if (allRunning) {
      this.logAndOutput('✓ All containers are running successfully.', output);
      return { success: true, output: output.join('\n') };
    } else {
      this.logAndOutput('✗ Not all containers are running. jfFix may not have succeeded completely.', output, 'warn');
      return { success: false, output: output.join('\n') };
    }
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
