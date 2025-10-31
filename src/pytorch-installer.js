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
 */
async function installPyTorchPackages(projectPath, gpuArch, packages) {
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
    console.log('\n✅ Packages installed successfully');
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

module.exports = {
  isUvInstalled,
  getPythonVersion,
  initializeUvProject,
  installPyTorchPackages,
  updatePyTorchPackages,
  isProjectInitialized,
  getInstalledPackages
};
