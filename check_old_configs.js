const DatabaseService = require('./services/DatabaseService');

async function checkOldConfigs() {
  try {
    await DatabaseService.init();
    
    const oldConfigs = await DatabaseService.all('SELECT * FROM config WHERE key = ?', ['email_recipients']);
    console.log('Found old email_recipients configs:', oldConfigs.length);
    
    if (oldConfigs.length > 0) {
      console.log('Details:', oldConfigs);
      console.log('\nTo clean these up, you can run:');
      console.log("DELETE FROM config WHERE key = 'email_recipients';");
    } else {
      console.log('No old email_recipients configs found.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

checkOldConfigs();
