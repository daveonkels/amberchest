import {expect,it} from 'vitest';
import {extractText} from '../src/search/text.js';

function pdfFixture(): Buffer {
  const stream='BT /F1 12 Tf 20 100 Td (Recoverable attachment text) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source='%PDF-1.4\n';
  const offsets=[0];
  for(const [i,object] of objects.entries()){offsets.push(Buffer.byteLength(source));source+=`${i+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(source);
  source+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

it('extracts PDF attachment text across repeated document lifecycles',async()=>{
  const pdf=pdfFixture();
  for(let i=0;i<3;i++)expect(await extractText(pdf,'application/pdf','fixture.pdf')).toBe('Recoverable attachment text');
});
