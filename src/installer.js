const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

/**
 * Download a file with progress
 * @param {string} url - URL to download
 * @param {string} destPath - Destination file path
 */
async function downloadFile(url, destPath) {
  console.log(`\nDownloading: ${path.basename(destPath)}`);
  console.log(`From: ${url}`);
  
  const writer = fs.createWriteStream(destPath);
  
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    onDownloadProgress: (progressEvent) => {
      const percentCompleted = progressEvent.total 
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      
      if (progressEvent.total) {
        const downloaded = (progressEvent.loaded / 1024 / 1024).toFixed(2);
        const total = (progressEvent.total / 1024 / 1024).toFixed(2);
        process.stdout.write(`\rProgress: ${percentCompleted}% (${downloaded}MB / ${total}MB)`);
      } else {
        const downloaded = (progressEvent.loaded / 1024 / 1024).toFixed(2);
        process.stdout.write(`\rDownloaded: ${downloaded}MB`);
      }
    }
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log('\n✅ Download complete');
      resolve();
    });
    writer.on('error', reject);
  });
}

/**
 * Extract tar.gz file
 * @param {string} tarPath - Path to tar.gz file
 * @param {string} destDir - Destination directory
 */
function extractTarGz(tarPath, destDir) {
  console.log(`\nExtracting to: ${destDir}`);
  
  try {
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Extract with tar
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, {
      stdio: 'inherit'
    });
    
    console.log('✅ Extraction complete');
    return true;
  } catch (error) {
    console.error('❌ Extraction failed:', error.message);
    return false;
  }
}

/**
 * Check if directory requires sudo access
 * @param {string} dir - Directory path
 * @returns {boolean}
 */
function requiresSudo(dir) {
  try {
    // Try to access the directory
    fs.accessSync(dir, fs.constants.W_OK);
    return false;
  } catch (error) {
    return true;
  }
}

/**
 * Install ROCm to specified directory
 * @param {string} tarPath - Path to downloaded tar.gz
 * @param {string} installDir - Installation directory (default: /opt/rocm)
 * @param {Object} buildInfo - Optional build information to save
 */
async function installRocm(tarPath, installDir = '/opt/rocm', buildInfo = null) {
  console.log('\n=== Installing ROCm ===\n');
  
  const needsSudo = requiresSudo(path.dirname(installDir));
  
  if (needsSudo) {
    console.log('⚠️  Installation to /opt/rocm requires sudo privileges');
    console.log('You may be prompted for your password\n');
  }
  
  // Create temporary extraction directory
  // Use home directory instead of /tmp to avoid tmpfs space issues
  const tempDir = path.join(process.env.HOME, '.cache', 'aibenchy', `rocm-extract-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Extract to temp directory first
    console.log('Step 1: Extracting archive...');
    if (!extractTarGz(tarPath, tempDir)) {
      throw new Error('Extraction failed');
    }
    
    // Check what was extracted
    const extractedDirs = fs.readdirSync(tempDir);
    if (extractedDirs.length === 0) {
      throw new Error('No files extracted');
    }
    
    // Determine the extracted path
    // If there's a single directory, use that. Otherwise, use tempDir directly (files extracted to .)
    let extractedPath;
    if (extractedDirs.length === 1 && fs.statSync(path.join(tempDir, extractedDirs[0])).isDirectory()) {
      // Single directory - use it
      extractedPath = path.join(tempDir, extractedDirs[0]);
    } else {
      // Multiple files/dirs extracted directly - use tempDir
      extractedPath = tempDir;
    }
    console.log(`Extracted to: ${extractedPath}`);
    
    // Backup existing ROCm if it exists
    if (fs.existsSync(installDir)) {
      const backupDir = `${installDir}.backup.${Date.now()}`;
      console.log(`\nStep 2: Backing up existing installation to ${backupDir}`);
      
      const backupCmd = needsSudo 
        ? `sudo mv "${installDir}" "${backupDir}"`
        : `mv "${installDir}" "${backupDir}"`;
      
      execSync(backupCmd, { stdio: 'inherit' });
    }
    
    // Move to final installation directory
    console.log(`\nStep 3: Installing to ${installDir}`);
    
    let installCmd;
    if (extractedPath === tempDir) {
      // Files extracted directly to tempDir - move contents to installDir
      installCmd = needsSudo
        ? `sudo mkdir -p "${installDir}" && sudo cp -r "${tempDir}"/. "${installDir}"/`
        : `mkdir -p "${installDir}" && cp -r "${tempDir}"/. "${installDir}"/`;
    } else {
      // Extracted to a subdirectory - move the directory
      installCmd = needsSudo
        ? `sudo mkdir -p "${path.dirname(installDir)}" && sudo mv "${extractedPath}" "${installDir}"`
        : `mkdir -p "${path.dirname(installDir)}" && mv "${extractedPath}" "${installDir}"`;
    }
    
    execSync(installCmd, { stdio: 'inherit' });
    
    // Set permissions
    if (needsSudo) {
      console.log('\nStep 4: Setting permissions...');
      execSync(`sudo chmod -R 755 "${installDir}"`, { stdio: 'inherit' });
    }
    
    // Save build metadata if provided
    if (buildInfo) {
      console.log('\nStep 5: Saving build metadata...');
      const metadataPath = path.join(installDir, '.info', 'build-info.json');
      const metadata = {
        filename: buildInfo.filename || path.basename(tarPath),
        rocmVersion: buildInfo.rocmVersion || 'unknown',
        buildDate: buildInfo.buildDate || 'unknown',
        buildTag: buildInfo.buildTag || 'unknown',
        gpu: buildInfo.gpu || 'unknown',
        variant: buildInfo.variant || 'default',
        installedAt: new Date().toISOString(),
        url: buildInfo.url || ''
      };
      
      const metadataContent = JSON.stringify(metadata, null, 2);
      if (needsSudo) {
        // Write to temp file and move with sudo
        const tempMetadata = path.join(tempDir, 'build-info.json');
        fs.writeFileSync(tempMetadata, metadataContent);
        execSync(`sudo mkdir -p "${path.dirname(metadataPath)}" && sudo mv "${tempMetadata}" "${metadataPath}"`, { stdio: 'inherit' });
      } else {
        fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
        fs.writeFileSync(metadataPath, metadataContent);
      }
    }
    
    console.log('\n✅ ROCm installation complete!');
    
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    return true;
  } catch (error) {
    console.error('\n❌ Installation failed:', error.message);
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return false;
  }
}

/**
 * Setup environment variables for ROCm
 * @param {string} installDir - ROCm installation directory
 */
function setupEnvironment(installDir = '/opt/rocm') {
  console.log('\n=== Environment Setup ===\n');
  
  const envVars = [
    `export ROCM_PATH="${installDir}"`,
    `export PATH="${installDir}/bin:$PATH"`,
    `export LD_LIBRARY_PATH="${installDir}/lib:$LD_LIBRARY_PATH"`,
  ];
  
  console.log('Add these lines to your shell configuration (~/.bashrc or ~/.config/fish/config.fish):\n');
  envVars.forEach(line => console.log(`  ${line}`));
  
  console.log('\nOr run this command to add to your current shell session:');
  console.log(`\n  source <(cat << 'EOF'\n${envVars.join('\n')}\nEOF\n  )`);
  
  // For fish shell
  const fishVars = [
    `set -gx ROCM_PATH "${installDir}"`,
    `set -gx PATH "${installDir}/bin" $PATH`,
    `set -gx LD_LIBRARY_PATH "${installDir}/lib" $LD_LIBRARY_PATH`,
  ];
  
  console.log('\n\nFor Fish shell users:\n');
  fishVars.forEach(line => console.log(`  ${line}`));
}

/**
 * Verify ROCm installation
 * @param {string} installDir - ROCm installation directory
 */
function verifyInstallation(installDir = '/opt/rocm') {
  console.log('\n=== Verifying Installation ===\n');
  
  try {
    const rocminfoPath = path.join(installDir, 'bin', 'rocminfo');
    
    if (!fs.existsSync(rocminfoPath)) {
      console.log('⚠️  rocminfo not found. Installation may be incomplete.');
      return false;
    }
    
    console.log('Running rocminfo...\n');
    execSync(`${rocminfoPath}`, { stdio: 'inherit' });
    
    console.log('\n✅ ROCm is working correctly!');
    return true;
  } catch (error) {
    console.log('\n⚠️  Could not verify installation:', error.message);
    return false;
  }
}

module.exports = {
  downloadFile,
  extractTarGz,
  installRocm,
  setupEnvironment,
  verifyInstallation,
  requiresSudo
};
