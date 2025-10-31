const axios = require('axios');

async function debug() {
  const url = 'https://therock-nightly-tarball.s3.amazonaws.com/index.html';
  
  try {
    const response = await axios.get(url);
    const html = response.data;
    
    console.log('First 2000 characters of HTML:');
    console.log(html.substring(0, 2000));
    
    console.log('\n\n--- Trying to extract files array ---');
    
    // Try to extract the files array
    const filesArrayMatch = html.match(/const files = (\[.*?\]);/s);
    
    if (filesArrayMatch) {
      console.log('Found files array match!');
      console.log('Length of match:', filesArrayMatch[1].length);
      
      try {
        const filesData = JSON.parse(filesArrayMatch[1]);
        console.log(`Parsed ${filesData.length} files`);
        console.log('\nFirst 5 files:');
        filesData.slice(0, 5).forEach(f => console.log(`  ${f.name}`));
      } catch (e) {
        console.log('Error parsing JSON:', e.message);
        console.log('First 500 chars of matched string:');
        console.log(filesArrayMatch[1].substring(0, 500));
      }
    } else {
      console.log('No files array match found');
      
      // Try a less greedy match
      const altMatch = html.match(/const files = (\[[\s\S]*?\]);/);
      if (altMatch) {
        console.log('Found with alternative pattern');
        console.log('First 500 chars:', altMatch[1].substring(0, 500));
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debug();
