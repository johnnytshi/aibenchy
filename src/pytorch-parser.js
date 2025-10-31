const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Parse packages from a specific package directory
 * @param {string} gpuArch - GPU architecture (e.g., 'gfx1151')
 * @param {string} packageName - Package name (e.g., 'torch', 'torchvision')
 * @returns {Promise<Array>} Array of package information
 */
async function parsePackageVersions(gpuArch, packageName) {
  const packageUrl = `https://rocm.nightlies.amd.com/v2/${gpuArch}/${packageName}/`;
  const baseUrl = `https://rocm.nightlies.amd.com/v2/${gpuArch}/`;
  
  try {
    const response = await axios.get(packageUrl);
    const html = response.data;
    
    const $ = cheerio.load(html);
    const packages = [];
    
    // Find all links to .whl files
    $('a').each((i, element) => {
      let href = $(element).attr('href');
      
      if (href && href.includes('.whl')) {
        // Decode URL encoding (e.g., %2B -> +)
        href = decodeURIComponent(href);
        
        // Remove ../ prefix if present
        const filename = href.replace(/^\.\.\//, '');
        
        // Only process if it's a wheel file
        if (filename.endsWith('.whl')) {
          const packageInfo = parsePackageName(filename);
          if (packageInfo) {
            packages.push({
              ...packageInfo,
              url: baseUrl + encodeURIComponent(filename).replace(/%2B/g, '+'),
              filename: filename
            });
          }
        }
      }
    });
    
    return packages;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return []; // Package not available for this architecture
    }
    throw error;
  }
}

/**
 * Parse PyTorch packages from ROCm nightlies repository
 * @param {string} gpuArch - GPU architecture (e.g., 'gfx1151')
 * @param {Array<string>} packageNames - Package names to fetch (default: torch, torchvision, torchaudio)
 * @returns {Promise<Array>} Array of PyTorch package information
 */
async function parsePyTorchPackages(gpuArch, packageNames = ['torch', 'torchvision', 'torchaudio']) {
  const baseUrl = `https://rocm.nightlies.amd.com/v2/${gpuArch}/`;
  
  try {
    console.log(`Fetching PyTorch packages for ${gpuArch}...`);
    
    // Verify the architecture exists
    await axios.head(baseUrl);
    
    const allPackages = [];
    
    // Fetch each package
    for (const pkgName of packageNames) {
      console.log(`  Fetching ${pkgName}...`);
      const packages = await parsePackageVersions(gpuArch, pkgName);
      allPackages.push(...packages);
    }
    
    return allPackages;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`GPU architecture ${gpuArch} not found in ROCm nightlies. Check https://rocm.nightlies.amd.com/v2/ for available architectures.`);
    }
    throw error;
  }
}

/**
 * Parse Python wheel filename to extract package information
 * Example: torch-2.6.0.dev20241030+rocm6.3-cp311-cp311-linux_x86_64.whl
 * @param {string} filename - Wheel filename
 * @returns {Object|null} Package information or null
 */
function parsePackageName(filename) {
  // Pattern: packagename-version-pythonversion-abi-platform.whl
  const match = filename.match(/^([a-zA-Z0-9_]+)-([^-]+)-([^-]+)-([^-]+)-([^.]+)\.whl$/);
  
  if (!match) {
    return null;
  }
  
  const [, packageName, version, pythonVersion, abi, platform] = match;
  
  // Extract ROCm version from version string
  // Example: 2.6.0.dev20241030+rocm6.3
  const rocmMatch = version.match(/\+rocm([0-9.]+)/);
  const rocmVersion = rocmMatch ? rocmMatch[1] : null;
  
  // Extract base version (without dev/rocm suffix)
  const versionMatch = version.match(/^([0-9.]+)/);
  const baseVersion = versionMatch ? versionMatch[1] : version;
  
  // Extract dev date if present
  const devMatch = version.match(/\.dev([0-9]+)/);
  const devDate = devMatch ? devMatch[1] : null;
  
  // Parse Python version (e.g., cp311 -> 3.11)
  const pyVersionMatch = pythonVersion.match(/cp([0-9])([0-9]+)/);
  const pythonVersionFormatted = pyVersionMatch 
    ? `${pyVersionMatch[1]}.${pyVersionMatch[2]}` 
    : pythonVersion;
  
  return {
    package: packageName,
    version: version,
    baseVersion: baseVersion,
    rocmVersion: rocmVersion,
    devDate: devDate,
    pythonVersion: pythonVersionFormatted,
    pythonTag: pythonVersion,
    abi: abi,
    platform: platform
  };
}

/**
 * Compare semantic versions
 * @param {string} versionA - Version string (e.g., "2.10.0")
 * @param {string} versionB - Version string
 * @returns {number} -1 if A < B, 1 if A > B, 0 if equal
 */
function compareVersions(versionA, versionB) {
  const partsA = versionA.split('.').map(x => parseInt(x) || 0);
  const partsB = versionB.split('.').map(x => parseInt(x) || 0);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    
    if (a > b) return 1;
    if (a < b) return -1;
  }
  
  return 0;
}

/**
 * Get unique PyTorch versions grouped by package
 * @param {Array} packages - Array of package info
 * @returns {Object} Grouped packages by name
 */
function groupPackagesByName(packages) {
  const grouped = {};
  
  packages.forEach(pkg => {
    if (!grouped[pkg.package]) {
      grouped[pkg.package] = [];
    }
    grouped[pkg.package].push(pkg);
  });
  
  // Sort each package's versions (newest first)
  Object.keys(grouped).forEach(pkgName => {
    grouped[pkgName].sort((a, b) => {
      // First, compare base versions semantically (2.10 > 2.7)
      const versionCompare = compareVersions(b.baseVersion, a.baseVersion);
      if (versionCompare !== 0) {
        return versionCompare;
      }
      
      // If base versions are equal, sort by ROCm version
      if (a.rocmVersion && b.rocmVersion) {
        const rocmCompare = compareVersions(b.rocmVersion, a.rocmVersion);
        if (rocmCompare !== 0) {
          return rocmCompare;
        }
      }
      
      // If ROCm versions are equal, sort by build date
      if (a.devDate && b.devDate) {
        return b.devDate.localeCompare(a.devDate);
      }
      
      // Last resort: string comparison
      return b.version.localeCompare(a.version);
    });
  });
  
  return grouped;
}

/**
 * Get latest version of each package
 * @param {Array} packages - Array of package info
 * @returns {Array} Latest version of each package
 */
function getLatestVersions(packages) {
  const grouped = groupPackagesByName(packages);
  const latest = [];
  
  Object.keys(grouped).forEach(pkgName => {
    if (grouped[pkgName].length > 0) {
      latest.push(grouped[pkgName][0]);
    }
  });
  
  return latest;
}

/**
 * Filter packages by Python version
 * @param {Array} packages - Array of package info
 * @param {string} pythonVersion - Python version (e.g., '3.11')
 * @returns {Array} Filtered packages
 */
function filterByPythonVersion(packages, pythonVersion) {
  return packages.filter(pkg => pkg.pythonVersion === pythonVersion);
}

/**
 * Filter packages by platform
 * @param {Array} packages - Array of package info
 * @param {string} platform - Platform (e.g., 'linux', 'windows')
 * @returns {Array} Filtered packages
 */
function filterByPlatform(packages, platform) {
  return packages.filter(pkg => {
    if (platform === 'linux') {
      return pkg.platform && pkg.platform.includes('linux');
    } else if (platform === 'windows') {
      return pkg.platform && pkg.platform.includes('win');
    }
    return true;
  });
}

/**
 * Get unique Python versions available
 * @param {Array} packages - Array of package info
 * @returns {Array} Sorted array of Python versions
 */
function getAvailablePythonVersions(packages) {
  const versions = new Set();
  packages.forEach(pkg => {
    if (pkg.pythonVersion) {
      versions.add(pkg.pythonVersion);
    }
  });
  return Array.from(versions).sort();
}

module.exports = {
  parsePyTorchPackages,
  parsePackageVersions,
  parsePackageName,
  groupPackagesByName,
  getLatestVersions,
  filterByPythonVersion,
  filterByPlatform,
  getAvailablePythonVersions
};
