#!/usr/bin/env node

const { detectSystem, findCompatibleArtifacts } = require('./system-detect');
const { parseRocmArtifacts, getUniqueValues } = require('./rocm-parser');

async function main() {
  try {
    console.log('=== System Detection ===\n');
    
    // Detect system
    const systemInfo = detectSystem();
    
    console.log('Platform:', systemInfo.platform);
    console.log('OS:', `${systemInfo.osInfo.type} ${systemInfo.osInfo.release}`);
    console.log('Architecture:', systemInfo.osInfo.arch);
    
    if (systemInfo.detected) {
      console.log('\n✅ AMD GPU Detected!');
      console.log('GPU Architecture:', systemInfo.gpuArch);
      console.log('Compatible ROCm GPU Families:', systemInfo.rocmGpuFamilies.join(', '));
    } else {
      console.log('\n⚠️  AMD GPU not detected');
      console.log('Note: Install ROCm drivers or ensure GPU is properly connected');
    }
    
    console.log('\n=== Fetching ROCm Artifacts ===\n');
    
    // Fetch all artifacts
    const allArtifacts = await parseRocmArtifacts();
    
    if (!systemInfo.detected) {
      console.log('\nCannot determine compatible ROCm versions without GPU detection.');
      console.log('Available platforms:', getUniqueValues(allArtifacts, 'platform'));
      console.log('Available GPUs:', getUniqueValues(allArtifacts, 'gpu'));
      return;
    }
    
    console.log('\n=== Compatible ROCm Builds ===\n');
    
    // Find compatible artifacts
    const compatible = findCompatibleArtifacts(allArtifacts, systemInfo);
    
    if (compatible.length === 0) {
      console.log('❌ No compatible ROCm builds found for your system');
      return;
    }
    
    console.log(`Found ${compatible.length} compatible builds\n`);
    
    // Get available versions
    const versions = getUniqueValues(compatible, 'rocmVersion');
    console.log('Available ROCm Versions:');
    versions.forEach(v => console.log(`  - ${v}`));
    
    // Get available variants
    const variants = getUniqueValues(compatible, 'variant');
    console.log('\nAvailable Variants:');
    variants.forEach(v => console.log(`  - ${v}`));
    
    // Show latest builds for each version
    console.log('\n=== Latest Builds by Version ===\n');
    
    for (const version of versions) {
      const versionBuilds = findCompatibleArtifacts(allArtifacts, systemInfo, {
        rocmVersion: version,
        latest: true
      });
      
      if (versionBuilds.length > 0) {
        console.log(`ROCm ${version}:`);
        versionBuilds.forEach(build => {
          console.log(`  • ${build.gpu} (${build.variant})`);
          console.log(`    ${build.filename}`);
          console.log(`    Build: ${build.buildDate} (${build.buildTag})`);
          console.log(`    URL: ${build.url}`);
          console.log();
        });
      }
    }
    
    // Recommend the latest stable version
    const latestStable = compatible
      .filter(a => !a.buildTag.includes('ADHOCBUILD'))
      .sort((a, b) => {
        // Sort by version, then by date
        if (a.rocmVersion !== b.rocmVersion) {
          return b.rocmVersion.localeCompare(a.rocmVersion);
        }
        return (b.buildDate || '').localeCompare(a.buildDate || '');
      })[0];
    
    if (latestStable) {
      console.log('\n=== Recommendation ===\n');
      console.log('Latest stable build for your system:');
      console.log(`  ROCm ${latestStable.rocmVersion} (${latestStable.buildDate})`);
      console.log(`  GPU: ${latestStable.gpu}`);
      console.log(`  Variant: ${latestStable.variant}`);
      console.log(`  File: ${latestStable.filename}`);
      console.log(`  URL: ${latestStable.url}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
