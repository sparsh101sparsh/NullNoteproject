import { HtmlToDocxService } from '@packback/html-to-docx';
import * as fs from 'fs';

async function run() {
  const html = `<!DOCTYPE html>
    <html>
    <body>
      <div class="editor-content">
        <p>This is a test document with some text using packback/html-to-docx.</p>
      </div>
    </body>
    </html>`;
  
  try {
    const service = new HtmlToDocxService();
    // It returns a docx Document object probably? Let me check
    const docBlob = await service.generateDocxFromHtml(html, {
      title: 'Test Document',
    });
    
    fs.writeFileSync('test2.docx', docBlob as any);
    console.log('Saved test2.docx. Size:', fs.statSync('test2.docx').size);
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
