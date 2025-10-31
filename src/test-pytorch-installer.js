const { installPyTorchPackages } = require('./pytorch-installer');

// Test what command is generated
const projectPath = '/tmp/test-pytorch';
const gpuArch = 'gfx1151';
const packages = [
  { name: 'torch', version: '2.9.0+rocm7.10.0a20251030' }
];

console.log('Testing command generation...\n');
console.log('Project:', projectPath);
console.log('GPU:', gpuArch);
console.log('Packages:', packages);
console.log('\n--- This should show "uv pip install" not "uv add" ---\n');
