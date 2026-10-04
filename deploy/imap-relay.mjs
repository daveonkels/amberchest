// Fixed-destination TCP relay. TLS stays end-to-end between AmberChest and
// Fastmail: this process has no mailbox credentials or archive mounts.
import net from 'node:net';
const listenHost = process.env.RELAY_BIND;
if (!listenHost) throw new Error('RELAY_BIND is required');
const server = net.createServer(client => {
  const upstream = net.connect({host:'imap.fastmail.com',port:993});
  client.setTimeout(15*60*1000);
  upstream.setTimeout(15*60*1000);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error',close).on('timeout',close).on('close',()=>upstream.destroy());
  upstream.on('error',close).on('timeout',close).on('close',()=>client.destroy());
  client.pipe(upstream); upstream.pipe(client);
});
server.maxConnections=8;
server.listen(993,listenHost);
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
