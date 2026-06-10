const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(path.join(__dirname, 'src'), []);
let markdownContent = '# NullNote Codebase\n\n';

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(__dirname, file);
  markdownContent += `## ${relativePath}\n\n\`\`\`typescript\n${content}\n\`\`\`\n\n`;
});

fs.writeFileSync('codebase.md', markdownContent);
console.log('Successfully combined all code into codebase.md');
