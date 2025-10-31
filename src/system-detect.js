const { execSync } = require('child_process');
const os = require('os');

/**
 * Detect the operating system platform
 * @returns {string} 'linux' or 'windows'
 */
function detectPlatform() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    return 'linux';
  } else if (platform === 'win32') {
    return 'windows';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Detect AMD GPU architecture using multiple methods
 * @returns {string|null} GPU architecture (e.g., 'gfx1100', 'gfx90a') or null if not found
 */
function detectGpuArch() {
  // Method 1: Try rocminfo (most accurate if ROCm is installed)
  try {
    const output = execSync('rocminfo', { encoding: 'utf8' });
    
    // Look for "Name:" line that contains gfx
    // Example: "Name:                    gfx1100"
    const match = output.match(/Name:\s+(gfx[0-9a-f]+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch (error) {
    // rocminfo not available, continue to other methods
  }
  
  // Method 2: Try lspci with device IDs (works without ROCm installed)
  try {
    // Get lspci output with device IDs
    const output = execSync('lspci -nn | grep -i "vga\\|display\\|3d"', { 
      encoding: 'utf8',
      shell: '/bin/bash'
    });
    
    // Look for AMD/ATI GPU
    if (/AMD|ATI/i.test(output)) {
      // Extract device ID in format [1002:XXXX]
      const deviceIdMatch = output.match(/\[1002:([0-9a-f]{4})\]/i);
      
      if (deviceIdMatch) {
        const deviceId = deviceIdMatch[1].toLowerCase();
        const arch = mapDeviceIdToArch(deviceId);
        
        if (arch) {
          return arch;
        }
      }
      
      // Fallback: Try to identify by GPU name
      const gpuInfo = output.toLowerCase();
      
      // Map common GPU names to architectures
      const gpuMappings = [
        // RDNA 3.5 (Strix Point/Halo)
        { pattern: /strix (point|halo)/, arch: 'gfx1151' },
        { pattern: /radeon 8[0-9]{3}/, arch: 'gfx1151' }, // Radeon 8xxx series
        
        // RDNA 3 (gfx11xx)
        { pattern: /radeon rx 7[0-9]{3}/, arch: 'gfx1100' },
        { pattern: /radeon 7[0-9]{2}m/, arch: 'gfx1100' },
        
        // RDNA 2 (gfx103x)
        { pattern: /radeon rx 6[0-9]{3}/, arch: 'gfx1030' },
        { pattern: /radeon 6[0-9]{2}m/, arch: 'gfx1030' },
        
        // RDNA (gfx101x)
        { pattern: /radeon rx 5[0-9]{3}/, arch: 'gfx1010' },
        { pattern: /radeon 5[0-9]{2}m/, arch: 'gfx1010' },
        
        // Vega
        { pattern: /radeon vii/, arch: 'gfx906' },
        { pattern: /vega [0-9]+/, arch: 'gfx900' },
        
        // CDNA
        { pattern: /instinct mi300/, arch: 'gfx950' },
        { pattern: /instinct mi250/, arch: 'gfx90a' },
        { pattern: /instinct mi210/, arch: 'gfx90a' },
        { pattern: /instinct mi100/, arch: 'gfx908' },
      ];
      
      for (const mapping of gpuMappings) {
        if (mapping.pattern.test(gpuInfo)) {
          return mapping.arch;
        }
      }
      
      return 'unknown-amd';
    }
  } catch (error) {
    // lspci not available or no GPU found
  }
  
  return null;
}

/**
 * Map AMD device ID to GPU architecture
 * @param {string} deviceId - Device ID (e.g., '1586')
 * @returns {string|null} GPU architecture or null
 */
function mapDeviceIdToArch(deviceId) {
  // Comprehensive device ID to architecture mapping
  const deviceMappings = {
    // RDNA 3.5 (Strix Point/Halo) - gfx1150/gfx1151
    '1586': 'gfx1151', // Strix Halo
    '1587': 'gfx1151', // Strix Halo
    '15bf': 'gfx1150', // Strix Point
    '15c8': 'gfx1150', // Strix Point
    
    // RDNA 3 (Navi 3x) - gfx11xx
    '744c': 'gfx1100', // Navi 31 (RX 7900 XTX/XT)
    '7448': 'gfx1101', // Navi 32 (RX 7800 XT/7700 XT)
    '7478': 'gfx1102', // Navi 33 (RX 7600)
    
    // RDNA 2 (Navi 2x) - gfx103x
    '73a5': 'gfx1030', // Navi 21 (RX 6900/6800)
    '73bf': 'gfx1030', // Navi 21
    '73df': 'gfx1031', // Navi 22 (RX 6700)
    '73ef': 'gfx1032', // Navi 23 (RX 6600)
    '73ff': 'gfx1032', // Navi 23
    
    // RDNA (Navi 1x) - gfx101x
    '731f': 'gfx1010', // Navi 10 (RX 5700)
    '7340': 'gfx1012', // Navi 14 (RX 5500)
    '7360': 'gfx1010', // Navi 12
    
    // Vega - gfx90x
    '66af': 'gfx906', // Radeon VII
    '687f': 'gfx900', // Vega 10
    '69af': 'gfx906', // Vega 20
    
    // CDNA - gfx90x/94x/950
    '738c': 'gfx908', // MI100
    '740c': 'gfx90a', // MI200 (MI210/MI250)
    '740f': 'gfx90a', // MI200
    '7400': 'gfx950', // MI300
  };
  
  return deviceMappings[deviceId] || null;
}

/**
 * Map detected GPU architecture to ROCm package GPU family
 * @param {string} detectedArch - Detected GPU architecture (e.g., 'gfx1100')
 * @returns {Array<string>} Array of possible ROCm package GPU families
 */
function mapArchToRocmGpu(detectedArch) {
  if (!detectedArch || detectedArch === 'unknown-amd') {
    return [];
  }
  
  // Map specific architectures to ROCm package GPU families
  const archMappings = {
    'gfx1100': ['gfx110X', 'gfx1100'],
    'gfx1101': ['gfx110X', 'gfx1101'],
    'gfx1102': ['gfx110X', 'gfx1102'],
    'gfx1103': ['gfx110X', 'gfx1103'],
    'gfx1150': ['gfx1150'],
    'gfx1151': ['gfx1151'],
    'gfx1200': ['gfx120X', 'gfx1200'],
    'gfx1201': ['gfx120X', 'gfx1201'],
    'gfx1030': ['gfx103X', 'gfx1030'],
    'gfx1031': ['gfx103X', 'gfx1031'],
    'gfx1032': ['gfx103X', 'gfx1032'],
    'gfx1010': ['gfx101X', 'gfx1010'],
    'gfx1011': ['gfx101X', 'gfx1011'],
    'gfx1012': ['gfx101X', 'gfx1012'],
    'gfx906': ['gfx90X', 'gfx906'],
    'gfx908': ['gfx90X', 'gfx908'],
    'gfx90a': ['gfx90X', 'gfx94X', 'gfx90a'],
    'gfx940': ['gfx94X', 'gfx940'],
    'gfx941': ['gfx94X', 'gfx941'],
    'gfx942': ['gfx94X', 'gfx942'],
    'gfx950': ['gfx950'],
  };
  
  return archMappings[detectedArch] || [];
}

/**
 * Get system information
 * @returns {Object} System detection results
 */
function detectSystem() {
  const platform = detectPlatform();
  const gpuArch = detectGpuArch();
  const rocmGpuFamilies = mapArchToRocmGpu(gpuArch);
  
  return {
    platform,
    gpuArch,
    rocmGpuFamilies,
    detected: gpuArch !== null,
    osInfo: {
      type: os.type(),
      release: os.release(),
      arch: os.arch()
    }
  };
}

/**
 * Find compatible ROCm artifacts for the current system
 * @param {Array} artifacts - Array of ROCm artifacts
 * @param {Object} systemInfo - System detection results
 * @param {Object} options - Filter options
 * @returns {Array} Compatible artifacts
 */
function findCompatibleArtifacts(artifacts, systemInfo, options = {}) {
  if (!systemInfo.detected) {
    console.warn('GPU not detected, cannot filter by compatibility');
    return artifacts;
  }
  
  let compatible = artifacts.filter(artifact => {
    // Match platform
    if (artifact.platform !== systemInfo.platform) {
      return false;
    }
    
    // Match GPU family
    if (systemInfo.rocmGpuFamilies.length > 0) {
      const artifactGpu = artifact.gpu.toLowerCase();
      const matchesGpu = systemInfo.rocmGpuFamilies.some(family => 
        artifactGpu.includes(family.toLowerCase())
      );
      
      if (!matchesGpu) {
        return false;
      }
    }
    
    return true;
  });
  
  // Apply additional filters
  if (options.variant) {
    compatible = compatible.filter(a => a.variant === options.variant);
  }
  
  if (options.rocmVersion) {
    compatible = compatible.filter(a => a.rocmVersion === options.rocmVersion);
  }
  
  if (options.latest) {
    // Group by GPU/variant and get the latest
    const grouped = {};
    
    compatible.forEach(artifact => {
      const key = `${artifact.gpu}-${artifact.variant}`;
      
      if (!grouped[key] || (artifact.buildDate && artifact.buildDate > grouped[key].buildDate)) {
        grouped[key] = artifact;
      }
    });
    
    compatible = Object.values(grouped);
  }
  
  return compatible;
}

module.exports = {
  detectPlatform,
  detectGpuArch,
  mapArchToRocmGpu,
  detectSystem,
  findCompatibleArtifacts,
  mapDeviceIdToArch
};
