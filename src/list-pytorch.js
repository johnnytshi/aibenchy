#!/usr/bin/env node

const { detectSystem } = require('./system-detect');
const { 
  parsePyTorchPackages, 
  groupPackagesByName, 
  getAvailablePythonVersions,
  filterByPythonVersion,
  filterByPlatform
} = require('./pytorch-parser');

async function listPyTorchVersions() {
  console.log('\n=== PyTorch Version Finder ===\n');
  
  // Detect system
  const systemInfo = detectSystem();
  
  console.log('System Information:');
  console.log(`  Platform: ${systemInfo.platform}`);
  console.log(`  GPU: ${systemInfo.gpuArch || 'Not detected'}`);
  
  if (!systemInfo.detected) {
    console.error('\n❌ No AMD GPU detected. Cannot determine compatible PyTorch builds.');
    process.exit(1);
  }
  
  console.log('\n');
  
  try {
    // Fetch PyTorch packages
    const allPackages = await parsePyTorchPackages(systemInfo.gpuArch);
    
    // Filter by platform
    const packages = filterByPlatform(allPackages, systemInfo.platform);
    
    console.log(`\n=== Available PyTorch Packages for ${systemInfo.gpuArch} ===\n`);
    console.log(`Total packages found: ${allPackages.length} (${packages.length} for ${systemInfo.platform})\n`);
    
    // Group by package name
    const grouped = groupPackagesByName(packages);
    const packageNames = Object.keys(grouped).sort();
    
    console.log('Available packages:');
    packageNames.forEach(name => {
      console.log(`  • ${name} (${grouped[name].length} versions)`);
    });
    
    // Get available Python versions
    const pythonVersions = getAvailablePythonVersions(packages);
    console.log(`\nSupported Python versions: ${pythonVersions.join(', ')}`);
    
    // Show torch versions for each Python version
    console.log('\n=== Torch Versions by Python Version ===\n');
    
    pythonVersions.forEach(pyVer => {
      const filtered = filterByPythonVersion(packages, pyVer);
      const torchPackages = filtered.filter(pkg => pkg.package === 'torch');
      
      if (torchPackages.length > 0) {
        console.log(`Python ${pyVer}:`);
        console.log(`  Total torch versions: ${torchPackages.length}`);
        
        // Show latest 5 versions
        const latest = torchPackages.slice(0, 5);
        console.log(`  Latest versions:`);
        latest.forEach((pkg, idx) => {
          const devDateFormatted = pkg.devDate 
            ? `${pkg.devDate.slice(0, 4)}-${pkg.devDate.slice(4, 6)}-${pkg.devDate.slice(6, 8)}`
            : 'N/A';
          console.log(`    ${idx + 1}. ${pkg.version} (ROCm ${pkg.rocmVersion}, ${devDateFormatted})`);
        });
        
        if (torchPackages.length > 5) {
          console.log(`    ... and ${torchPackages.length - 5} more versions`);
        }
        console.log('');
      }
    });
    
    // Show recommendation
    const torchPackages = packages.filter(pkg => pkg.package === 'torch');
    if (torchPackages.length > 0) {
      const latest = torchPackages[0];
      console.log('=== Recommendation ===\n');
      console.log(`Latest PyTorch version: ${latest.version}`);
      console.log(`Python version: ${latest.pythonVersion}`);
      console.log(`ROCm version: ${latest.rocmVersion}`);
      console.log(`\nInstall command:`);
      console.log(`  python -m pip install \\`);
      console.log(`    --index-url https://rocm.nightlies.amd.com/v2/${systemInfo.gpuArch}/ \\`);
      console.log(`    --pre torch torchvision torchaudio`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  listPyTorchVersions().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = { listPyTorchVersions };
