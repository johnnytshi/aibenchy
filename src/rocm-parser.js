const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Parse ROCm artifacts from the S3 index page
 * @returns {Promise<Array>} Array of artifact objects
 */
async function parseRocmArtifacts() {
  const url = 'https://therock-nightly-tarball.s3.amazonaws.com/index.html';
  
  try {
    console.log('Fetching ROCm artifacts from:', url);
    const response = await axios.get(url);
    const html = response.data;
    
    const artifacts = [];
    
    // Extract the JavaScript array of files from the HTML
    // The format is: const files = [{name: "filename.tar.gz", mtime: 123}, ...]
    // Use [\s\S] instead of . with /s flag for better compatibility
    const filesArrayMatch = html.match(/const files = (\[[\s\S]*?\]);/);
    
    if (!filesArrayMatch) {
      console.error('Could not find files array in HTML');
      return artifacts;
    }
    
    try {
      // Parse the JSON array
      const filesData = JSON.parse(filesArrayMatch[1]);
      console.log(`Parsed ${filesData.length} file entries from the index`);
      
      // Process each file
      filesData.forEach(fileObj => {
        const filename = fileObj.name;
        
        // Only process therock-dist tarball files
        if (filename.startsWith('therock-dist') && filename.endsWith('.tar.gz')) {
          const fullUrl = `${url.replace('/index.html', '')}/${filename}`;
          const artifact = parseArtifactInfo(fullUrl, filename);
          if (artifact) {
            // Add modification time
            artifact.mtime = fileObj.mtime;
            artifacts.push(artifact);
          }
        }
      });
      
      console.log(`Found ${artifacts.length} ROCm artifacts`);
    } catch (parseError) {
      console.error('Error parsing files JSON:', parseError.message);
    }
    
    return artifacts;
    
  } catch (error) {
    console.error('Error fetching ROCm artifacts:', error.message);
    throw error;
  }
}

/**
 * Parse artifact information from filename
 * @param {string} url - The full URL
 * @param {string} filename - The filename/text
 * @returns {Object} Parsed artifact information
 */
function parseArtifactInfo(url, filename) {
  // Examples: 
  // therock-dist-linux-gfx110X-all-7.10.0a20251030.tar.gz
  // therock-dist-linux-gfx101X-dgpu-7.10.0a20251022.tar.gz
  // therock-dist-windows-gfx1151-7.0.0rc20250630.tar.gz (no variant!)
  // therock-dist-linux-gfx1151-ADHOCBUILD-7.0.0rc20250625.tar.gz
  
  // Remove .tar.gz extension and therock-dist- prefix
  const cleaned = filename.replace(/^therock-dist-/, '').replace(/\.tar\.gz$/, '');
  const parts = cleaned.split('-');
  
  if (parts.length < 3) {
    return null;
  }
  
  const platform = parts[0]; // linux, windows
  let gpu, variant, version;
  
  // Try to identify the version (contains digits and dots)
  let versionIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+\.\d+\./.test(parts[i])) {
      versionIndex = i;
      break;
    }
  }
  
  if (versionIndex === -1) {
    return null;
  }
  
  version = parts[versionIndex];
  
  // Everything between platform and version
  const middleParts = parts.slice(1, versionIndex);
  
  if (middleParts.length === 1) {
    // Format: platform-gpu-version (no variant)
    gpu = middleParts[0];
    variant = 'default';
  } else if (middleParts.length === 2) {
    // Format: platform-gpu-variant-version
    gpu = middleParts[0];
    variant = middleParts[1];
  } else {
    // More complex format, last part before version is likely variant
    gpu = middleParts.slice(0, -1).join('-');
    variant = middleParts[middleParts.length - 1];
  }
  
  // Parse version further (e.g., 7.10.0a20251030)
  const versionMatch = version.match(/(\d+\.\d+\.\d+)(.*)/);
  const rocmVersion = versionMatch ? versionMatch[1] : version;
  const buildTag = versionMatch ? versionMatch[2] : '';
  
  // Extract date from build tag if present (e.g., a20251030)
  let buildDate = null;
  const dateMatch = buildTag.match(/(\d{8})/);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    // Format: YYYYMMDD
    buildDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  
  return {
    filename,
    url,
    platform,           // linux, windows
    gpu,               // gfx110X, gfx90X, gfx120X, etc.
    variant,           // all, dcgpu, dgpu, default, ADHOCBUILD
    rocmVersion,       // 7.10.0
    buildTag,          // a20251030, rc20251030, etc.
    buildDate,         // 2025-10-30
    fullVersion: version
  };
}

/**
 * Filter artifacts by criteria
 * @param {Array} artifacts - Array of artifact objects
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered artifacts
 */
function filterArtifacts(artifacts, filters = {}) {
  let filtered = artifacts;
  
  if (filters.platform) {
    filtered = filtered.filter(a => a.platform === filters.platform);
  }
  
  if (filters.gpu) {
    filtered = filtered.filter(a => a.gpu === filters.gpu);
  }
  
  if (filters.variant) {
    filtered = filtered.filter(a => a.variant === filters.variant);
  }
  
  if (filters.rocmVersion) {
    filtered = filtered.filter(a => a.rocmVersion === filters.rocmVersion);
  }
  
  if (filters.latest) {
    // Group by platform/gpu/variant and get the latest build date
    const grouped = {};
    
    filtered.forEach(artifact => {
      const key = `${artifact.platform}-${artifact.gpu}-${artifact.variant}`;
      
      if (!grouped[key] || (artifact.buildDate && artifact.buildDate > grouped[key].buildDate)) {
        grouped[key] = artifact;
      }
    });
    
    filtered = Object.values(grouped);
  }
  
  return filtered;
}

/**
 * Get unique values for a field
 * @param {Array} artifacts - Array of artifact objects
 * @param {string} field - Field name to get unique values for
 * @returns {Array} Unique values sorted
 */
function getUniqueValues(artifacts, field) {
  const values = new Set(artifacts.map(a => a[field]).filter(Boolean));
  return Array.from(values).sort();
}

module.exports = {
  parseRocmArtifacts,
  parseArtifactInfo,
  filterArtifacts,
  getUniqueValues
};
