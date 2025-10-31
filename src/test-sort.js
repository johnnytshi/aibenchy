const { parsePyTorchPackages, filterByPlatform, filterByPythonVersion, groupPackagesByName } = require('./pytorch-parser');

(async () => {
  console.log('Fetching torch packages...');
  const all = await parsePyTorchPackages('gfx1151', ['torch']);
  const linux = filterByPlatform(all, 'linux');
  const py313 = filterByPythonVersion(linux, '3.13');
  const rocmFiltered = py313.filter(p => p.rocmVersion && p.rocmVersion.startsWith('7.10.0'));
  const grouped = groupPackagesByName(rocmFiltered);
  
  console.log('\nFirst 10 torch versions after grouping and filtering:');
  grouped.torch.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i+1}. ${p.version.padEnd(40)} (base: ${p.baseVersion}, rocm: ${p.rocmVersion})`);
  });
})();
