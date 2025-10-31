const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Check if uv is installed
 * @returns {boolean}
 */
function isUvInstalled() {
  try {
    execSync('uv --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get current Python version
 * @returns {string|null} Python version (e.g., '3.11')
 */
function getPythonVersion() {
  try {
    const output = execSync('python --version', { encoding: 'utf8' });
    const match = output.match(/Python ([0-9]+\.[0-9]+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

/**
 * Initialize a new uv project
 * @param {string} projectPath - Path to project directory
 * @param {string} pythonVersion - Python version (e.g., '3.11')
 */
function initializeUvProject(projectPath, pythonVersion) {
  console.log(`\nInitializing uv project at: ${projectPath}`);
  
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }
  
  process.chdir(projectPath);
  
  // Initialize uv project
  try {
    execSync(`uv init --python ${pythonVersion}`, { stdio: 'inherit' });
    console.log('✅ Project initialized');
  } catch (error) {
    console.error('Failed to initialize project:', error.message);
    throw error;
  }
}

/**
 * Install PyTorch packages with uv
 * @param {string} projectPath - Path to project directory
 * @param {string} gpuArch - GPU architecture (e.g., 'gfx1151')
 * @param {Array<Object>} packages - Array of package objects with {name, version}
 * @param {Object} options - Installation options
 */
async function installPyTorchPackages(projectPath, gpuArch, packages, options = {}) {
  console.log('\n=== Installing PyTorch Packages ===\n');
  
  process.chdir(projectPath);
  
  const indexUrl = `https://rocm.nightlies.amd.com/v2/${gpuArch}/`;
  
  // Build package specifications
  const packageSpecs = packages.map(pkg => {
    if (pkg.version) {
      // Use exact version if specified
      return `${pkg.name}==${pkg.version}`;
    }
    return pkg.name;
  });
  
  console.log(`Installing packages: ${packageSpecs.join(', ')}`);
  console.log(`Using index: ${indexUrl}\n`);
  
  try {
    // Ensure we're in a uv environment and use uv pip install
    // This works better with PyTorch nightlies than uv add
    const cmd = `uv pip install --index-url ${indexUrl} --prerelease allow --upgrade ${packageSpecs.join(' ')}`;
    console.log(`Running: ${cmd}\n`);
    execSync(cmd, { stdio: 'inherit' });
    console.log('\n✅ PyTorch packages installed successfully');
    
    // Install flash-attn if requested
    if (options.installFlashAttn) {
      console.log('\n=== Installing Flash Attention ===\n');
      try {
        const version = options.flashAttnVersion && options.flashAttnVersion !== 'latest' 
          ? `==${options.flashAttnVersion}` 
          : '';
        const flashAttnCmd = `uv pip install flash-attn${version} --no-build-isolation`;
        console.log(`Running: ${flashAttnCmd}\n`);
        execSync(flashAttnCmd, { stdio: 'inherit' });
        console.log('\n✅ Flash Attention installed successfully');
      } catch (error) {
        console.error('\n⚠️  Flash Attention installation failed:', error.message);
        console.error('You can try installing it manually later with:');
        const version = options.flashAttnVersion && options.flashAttnVersion !== 'latest' 
          ? `==${options.flashAttnVersion}` 
          : '';
        console.error(`  uv pip install flash-attn${version} --no-build-isolation`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Installation failed:', error.message);
    console.error('\nTip: Make sure your project has a valid pyproject.toml');
    return false;
  }
}

/**
 * Update PyTorch packages to specific versions
 * @param {string} projectPath - Path to project directory
 * @param {string} gpuArch - GPU architecture
 * @param {Array<Object>} packages - Array of package objects
 */
async function updatePyTorchPackages(projectPath, gpuArch, packages) {
  console.log('\n=== Updating PyTorch Packages ===\n');
  
  process.chdir(projectPath);
  
  const indexUrl = `https://rocm.nightlies.amd.com/v2/${gpuArch}/`;
  
  for (const pkg of packages) {
    try {
      console.log(`Updating ${pkg.name} to ${pkg.version}...`);
      const cmd = `uv pip install --index-url ${indexUrl} --prerelease allow --upgrade ${pkg.name}==${pkg.version}`;
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ ${pkg.name} updated\n`);
    } catch (error) {
      console.error(`❌ Failed to update ${pkg.name}:`, error.message);
    }
  }
  
  return true;
}

/**
 * Check if project is initialized (has pyproject.toml or uv.lock)
 * @param {string} projectPath - Path to project directory
 * @returns {boolean}
 */
function isProjectInitialized(projectPath) {
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  return fs.existsSync(pyprojectPath);
}

/**
 * Get installed package versions from uv
 * @param {string} projectPath - Path to project directory
 * @returns {Object} Map of package name to version
 */
function getInstalledPackages(projectPath) {
  try {
    process.chdir(projectPath);
    const output = execSync('uv pip list --format json', { encoding: 'utf8' });
    const packages = JSON.parse(output);
    
    const packageMap = {};
    packages.forEach(pkg => {
      packageMap[pkg.name] = pkg.version;
    });
    
    return packageMap;
  } catch (error) {
    return {};
  }
}

/**
 * Setup environment variables for ROCm and Flash Attention
 * @param {string} projectPath - Path to project directory
 * @param {Object} options - Environment options
 */
function setupEnvironmentVariables(projectPath, options = {}) {
  console.log('\n=== Environment Variables Setup ===\n');
  
  const envVars = [
    '# ROCm Environment Variables',
    'export ROCM_PATH="/opt/rocm"',
    'export PATH="$ROCM_PATH/bin:$PATH"',
    'export LD_LIBRARY_PATH="$ROCM_PATH/lib:$LD_LIBRARY_PATH"',
  ];
  
  if (options.hasFlashAttn) {
    envVars.push('');
    envVars.push('# Flash Attention for AMD GPUs');
    envVars.push('export FLASH_ATTENTION_TRITON_AMD_ENABLE=1');
    envVars.push('export HSA_OVERRIDE_GFX_VERSION="11.0.0"  # Adjust based on your GPU');
  }
  
  // Create .env file in project directory
  const envFilePath = path.join(projectPath, '.env');
  const envContent = envVars.join('\n') + '\n';
  
  try {
    fs.writeFileSync(envFilePath, envContent);
    console.log(`✅ Environment variables saved to: ${envFilePath}\n`);
    console.log('Add these to your shell configuration (~/.bashrc or ~/.config/fish/config.fish):\n');
    envVars.forEach(line => console.log(`  ${line}`));
    console.log('\nOr source the .env file:');
    console.log(`  source ${envFilePath}  # bash/zsh`);
    console.log(`  source ${envFilePath}  # fish\n`);
  } catch (error) {
    console.error('⚠️  Could not write .env file:', error.message);
    console.log('\nManually add these to your shell configuration:\n');
    envVars.forEach(line => console.log(`  ${line}`));
    console.log('');
  }
}

module.exports = {
  isUvInstalled,
  getPythonVersion,
  initializeUvProject,
  installPyTorchPackages,
  updatePyTorchPackages,
  isProjectInitialized,
  getInstalledPackages,
  setupEnvironmentVariables
};
