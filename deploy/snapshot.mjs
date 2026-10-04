// SQLite's online backup API makes a consistent copy while the index is live.
// Seven daily slots; raw EML files remain independently readable on the NAS.
import {createRequire} from 'node:module';
const Database=createRequire(import.meta.resolve('@amberchest/core'))('better-sqlite3');
import {mkdir,copyFile,rename} from 'node:fs/promises';
const day=new Date().getUTCDay();
const destination=`/archive/.amberchest-state/day-${day}`;
await mkdir(destination,{recursive:true,mode:0o700});
const db=new Database('/config/archive.db',{readonly:true});
try {
  await db.backup(`${destination}/archive.db.new`);
  const copy=new Database(`${destination}/archive.db.new`,{readonly:true});
  try {if(copy.pragma('quick_check',{simple:true})!=='ok') throw new Error('Snapshot integrity check failed');}
  finally {copy.close();}
  await rename(`${destination}/archive.db.new`,`${destination}/archive.db`);
  await copyFile('/config/config.enc',`${destination}/config.enc.new`);
  await rename(`${destination}/config.enc.new`,`${destination}/config.enc`);
  console.log('Index and encrypted configuration snapshot verified');
} finally {db.close();}
