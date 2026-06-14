const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  const og = c;
  
  c = c.replace(/Content Items\./g, 'contentItems.');
  c = c.replace(/Content Items,/g, 'contentItems,');
  c = c.replace(/Content Items\)/g, 'contentItems)');
  c = c.replace(/Content Items;/g, 'contentItems;');
  c = c.replace(/Content Items\]/g, 'contentItems]');
  c = c.replace(/allContent Items/g, 'allContentItems');
  c = c.replace(/Content Items=/g, 'contentItems=');
  c = c.replace(/Content Items:/g, 'contentItems:');
  
  c = c.replace(/, Content Items }/g, ', contentItems }');
  c = c.replace(/\{ Content Items,/g, '{ contentItems,');
  c = c.replace(/Content Items\.length/g, 'contentItems.length');
  c = c.replace(/Content Items \?/g, 'contentItems ?');
  c = c.replace(/Content Items\.map/g, 'contentItems.map');
  c = c.replace(/Content Items\.filter/g, 'contentItems.filter');
  
  c = c.replace(/<Content Items/g, '<ContentItems');
  c = c.replace(/<\/Content Items>/g, '</ContentItems>');
  
  c = c.replace(/from "\.\/routes\/Content Items"/g, 'from "./routes/content"');
  
  if (c !== og) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('Fixed', file);
  }
});
