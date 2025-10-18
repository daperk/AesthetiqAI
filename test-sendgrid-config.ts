#!/usr/bin/env tsx

// Test SendGrid configuration
console.log('\n🧪 Testing SendGrid Configuration\n');
console.log('=====================================\n');

// Check environment variables
const hasSendGrid = !!process.env.SENDGRID_API_KEY;
const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@aesthiq.app';
const sendGridFromName = process.env.SENDGRID_FROM_NAME || 'Aesthiq';
const debugMode = process.env.NODE_ENV === 'development';

console.log('📧 SendGrid Environment Variables:');
console.log('-----------------------------------');
console.log(`✓ SENDGRID_API_KEY: ${hasSendGrid ? '✅ SET' : '❌ NOT SET'}`);
console.log(`✓ FROM_EMAIL: ${sendGridFromEmail}`);
console.log(`✓ FROM_NAME: ${sendGridFromName}`);
console.log(`✓ Debug Mode: ${debugMode ? 'Enabled' : 'Disabled'}`);
console.log('');

if (!hasSendGrid) {
  console.log('⚠️  Configuration Status: INCOMPLETE');
  console.log('   - SendGrid API key is not configured');
  console.log('   - Patient invitations will be created but emails will not be sent');
  console.log('\n📝 To Enable Email Sending:');
  console.log('   1. Set SENDGRID_API_KEY environment variable');
  console.log('   2. (Optional) Set SENDGRID_FROM_EMAIL for custom sender');
  console.log('   3. Ensure sender email is verified in SendGrid');
} else {
  console.log('✅ Configuration Status: READY');
  console.log('   - SendGrid is configured and ready to send emails');
  console.log('\n⚠️  Important Notes:');
  console.log('   1. Ensure the sender email is verified in SendGrid');
  console.log('   2. Check that your SendGrid account has sending credits');
  console.log('   3. For production, use a dedicated sender domain');
}

console.log('\n🔍 Current Configuration Summary:');
console.log('----------------------------------');
console.log('When a patient invitation is sent:');
console.log(`  • Patient record: Will ALWAYS be created`);
console.log(`  • Email sending: ${hasSendGrid ? 'Will attempt to send' : 'Will be skipped'}`);
console.log(`  • From address: ${sendGridFromEmail}`);
console.log(`  • From name: ${sendGridFromName}`);
console.log(`  • Error handling: Graceful - patient creation succeeds even if email fails`);

console.log('\n=====================================');
console.log('Configuration test complete!\n');