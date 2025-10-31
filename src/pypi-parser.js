const axios = require('axios');

/**
 * Fetch available versions of a package from PyPI
 * @param {string} packageName - Package name (e.g., 'flash-attn')
 * @returns {Promise<Array>} Array of version strings
 */
async function fetchPyPiVersions(packageName) {
  try {
    const response = await axios.get(`https://pypi.org/pypi/${packageName}/json`);
    const versions = Object.keys(response.data.releases);
    
    // Filter out pre-releases and sort versions
    const stableVersions = versions.filter(v => {
      // Keep only versions that have files
      const release = response.data.releases[v];
      return release && release.length > 0;
    });
    
    // Sort versions in descending order
    return stableVersions.sort((a, b) => {
      return compareVersions(b, a); // Reverse order for descending
    });
  } catch (error) {
    console.error(`Failed to fetch versions for ${packageName}:`, error.message);
    return [];
  }
}

/**
 * Compare semantic versions
 * @param {string} versionA - Version string
 * @param {string} versionB - Version string
 * @returns {number} -1 if A < B, 1 if A > B, 0 if equal
 */
function compareVersions(versionA, versionB) {
  // Remove 'v' prefix if present
  const cleanA = versionA.replace(/^v/, '');
  const cleanB = versionB.replace(/^v/, '');
  
  const partsA = cleanA.split(/[.-]/).map(x => parseInt(x) || 0);
  const partsB = cleanB.split(/[.-]/).map(x => parseInt(x) || 0);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    
    if (a > b) return 1;
    if (a < b) return -1;
  }
  
  return 0;
}

/**
 * Get package info from PyPI
 * @param {string} packageName - Package name
 * @returns {Promise<Object>} Package info
 */
async function fetchPackageInfo(packageName) {
  try {
    const response = await axios.get(`https://pypi.org/pypi/${packageName}/json`);
    return {
      name: response.data.info.name,
      version: response.data.info.version,
      summary: response.data.info.summary,
      homepage: response.data.info.home_page,
      versions: Object.keys(response.data.releases)
    };
  } catch (error) {
    console.error(`Failed to fetch info for ${packageName}:`, error.message);
    return null;
  }
}

module.exports = {
  fetchPyPiVersions,
  fetchPackageInfo,
  compareVersions
};
