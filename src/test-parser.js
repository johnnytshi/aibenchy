#!/usr/bin/env node

const { parseRocmArtifacts, filterArtifacts, getUniqueValues } = require('./rocm-parser');

async function main() {
  try {
    console.log('Testing ROCm parser...\n');
    
    // Parse all artifacts
    const artifacts = await parseRocmArtifacts();
    
    console.log('\n--- Sample Artifacts ---');
    console.log(JSON.stringify(artifacts.slice(0, 3), null, 2));
    
    console.log('\n--- Available Platforms ---');
    console.log(getUniqueValues(artifacts, 'platform'));
    
    console.log('\n--- Available GPUs ---');
    console.log(getUniqueValues(artifacts, 'gpu'));
    
    console.log('\n--- Available Variants ---');
    console.log(getUniqueValues(artifacts, 'variant'));
    
    console.log('\n--- Available ROCm Versions ---');
    console.log(getUniqueValues(artifacts, 'rocmVersion'));
    
    console.log('\n--- Latest Linux Builds ---');
    const latestLinux = filterArtifacts(artifacts, {
      platform: 'linux',
      latest: true
    });
    console.log(`Found ${latestLinux.length} latest Linux builds:`);
    latestLinux.slice(0, 5).forEach(a => {
      console.log(`  ${a.gpu} (${a.variant}): ${a.rocmVersion} - ${a.buildDate}`);
    });
    
    console.log('\n--- Filter Example: Linux, gfx110X, latest ---');
    const filtered = filterArtifacts(artifacts, {
      platform: 'linux',
      gpu: 'gfx110X',
      latest: true
    });
    console.log(JSON.stringify(filtered, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
