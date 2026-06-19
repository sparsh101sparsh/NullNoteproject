const fs = require('fs');
const file = 'src/sidepanel/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace handleInput
content = content.replace(
  /const handleInput = \(\) => \{\n\s*if \(editorRef\.current\) \{\n\s*const textVal = editorRef\.current\.textContent\?\.trim\(\) \|\| '';\n\s*const hasMedia = editorRef\.current\.querySelectorAll\('img, \.marker-badge'\)\.length > 0;\n\s*setIsEditorEmpty\(textVal === '' && !hasMedia\);\n\s*\}/,
  `const handleInput = () => {
    if (editorRef.current) {
      const textVal = editorRef.current.textContent?.trim() || '';
      const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge, [data-type="marker"], [data-type="screenshot"]').length > 0;
      // If there's any content, it's not empty. Also check if innerHTML is just empty p tags
      const isEmptyHtml = editorRef.current.innerHTML === '<p><br></p>' || editorRef.current.innerHTML.trim() === '';
      setIsEditorEmpty((textVal === '' && !hasMedia) && isEmptyHtml);
    }`
);

// Replace loadDoc check
content = content.replace(
  /const textVal = editorRef\.current\.textContent\?\.trim\(\) \|\| '';\n\s*const hasMedia = editorRef\.current\.querySelectorAll\('img, \.marker-badge'\)\.length > 0;\n\s*setIsEditorEmpty\(textVal === '' && !hasMedia\);/,
  `const textVal = editorRef.current.textContent?.trim() || '';
        const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge, [data-type="marker"], [data-type="screenshot"]').length > 0;
        const isEmptyHtml = editorRef.current.innerHTML === '<p><br></p>' || editorRef.current.innerHTML.trim() === '';
        setIsEditorEmpty((textVal === '' && !hasMedia) && isEmptyHtml);`
);

fs.writeFileSync(file, content);
