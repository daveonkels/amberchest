import { afterEach, describe, expect, it } from 'vitest';
import { assertFastmail, assertPrivateAccount } from '../src/privacy.js';
import { messageToPrintableHtml } from '../src/export/pdf.js';
import { selectionForSync } from '../src/sync/folders.js';
import { accountSettingsSchema } from '../src/config/schema.js';
import type { MessageContent } from '../src/search/message.js';

afterEach(()=>{delete process.env.AMBERCHEST_PRIVATE_BACKUP; delete process.env.AMBERCHEST_ARCHIVE_DIR;});
describe('mail privacy',()=>{
 it('requires TLS, certificate validation and the exact Fastmail destination',()=>{
  process.env.AMBERCHEST_PRIVATE_BACKUP='true';
  const good={host:'imap.fastmail.com',port:993,security:'tls',rejectUnauthorized:true};
  expect(()=>assertFastmail(good)).not.toThrow();
  for(const patch of [{host:'imap.fastmail.com.attacker.test'},{port:143},{security:'none'},{rejectUnauthorized:false},{accessToken:'token'}]) expect(()=>assertFastmail({...good,...patch})).toThrow();
  expect(()=>assertPrivateAccount({...good,settings:{deletedHandling:'mirror'}})).toThrow();
  expect(()=>assertPrivateAccount({...good,settings:{deletedRetentionDays:30}})).toThrow();
 });
 it('never renders active email HTML in PDF export',()=>{
  const message={subject:'<script>bad()</script>',date:'2026-01-01',folderPath:'Inbox',attachments:[],html:'<img srcset="https://attacker.test/track"><style>@import "https://attacker.test/x";</style><meta http-equiv="refresh" content="0;url=https://attacker.test">',text:'Safe plain text'} as unknown as MessageContent;
  const html=messageToPrintableHtml(message);
  expect(html).not.toContain('https://attacker.test');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Safe plain text');
  expect(html).toContain('Content-Security-Policy');
 });
 it('keeps automatically discovered folders selected on subsequent backups',()=>{
  const account={selectedFolders:['INBOX'],settings:accountSettingsSchema.parse({autoSelectNewFolders:true})};
  const remote=['INBOX','New','Excluded'].map(path=>({path,name:path,delimiter:'/',specialUse:null,noSelect:false,messageCount:0,sizeBytes:null}));
  expect(selectionForSync(account,[{path:'INBOX',selected:1},{path:'Excluded',selected:0}],remote)).toEqual(['INBOX','New']);
  expect(selectionForSync(account,[{path:'INBOX',selected:1},{path:'New',selected:1},{path:'Excluded',selected:0}],remote)).toEqual(['INBOX','New']);
 });
});
