try {
  require('node-pty');
  console.log('OK');
} catch(e) {
  console.log('FAIL:' + e.message);
}
process.exit(0);
