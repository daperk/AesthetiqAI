#!/usr/bin/env tsx

import 'dotenv/config';

async function testPatientInvitation() {
  console.log('\n🧪 Testing Patient Invitation System\n');
  console.log('=====================================\n');
  
  // Check SendGrid configuration
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL || 'notifications@aesthiq.app';
  
  console.log('📧 SendGrid Configuration:');
  console.log(`   - API Key: ${hasSendGrid ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   - From Email: ${sendGridFromEmail}`);
  console.log('');
  
  if (!hasSendGrid) {
    console.warn('⚠️  Warning: SENDGRID_API_KEY is not configured.');
    console.log('   Emails will not be sent, but invitations will still be created.\n');
  }
  
  // Test data
  const testPatient = {
    email: `test_${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'Patient',
    phone: '+1234567890'
  };
  
  console.log('🧑 Test Patient Data:');
  console.log(`   - Name: ${testPatient.firstName} ${testPatient.lastName}`);
  console.log(`   - Email: ${testPatient.email}`);
  console.log(`   - Phone: ${testPatient.phone}\n`);
  
  try {
    // First, we need to login as a clinic admin
    console.log('🔐 Logging in as clinic admin...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emailOrUsername: 'admin',
        password: 'admin123'
      })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }
    
    const loginData = await loginResponse.json();
    const cookies = loginResponse.headers.get('set-cookie');
    
    console.log('✅ Login successful\n');
    
    // Now send the invitation
    console.log('📮 Sending patient invitation...');
    const inviteResponse = await fetch('http://localhost:5000/api/patients/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      },
      body: JSON.stringify(testPatient)
    });
    
    if (!inviteResponse.ok) {
      const errorData = await inviteResponse.json();
      throw new Error(`Invitation failed: ${inviteResponse.status} - ${errorData.message}`);
    }
    
    const inviteData = await inviteResponse.json();
    
    console.log('\n📋 Invitation Response:');
    console.log('   Success:', inviteData.success ? '✅' : '❌');
    console.log('   Message:', inviteData.message);
    console.log('   Email Sent:', inviteData.emailSent ? '✅' : '❌');
    
    if (inviteData.emailError) {
      console.log('   Email Error:', inviteData.emailError.message);
    }
    
    if (inviteData.invitationLink) {
      console.log('   Invitation Link:', inviteData.invitationLink);
    }
    
    if (inviteData.client) {
      console.log('\n👤 Created Client Record:');
      console.log('   - ID:', inviteData.client.id);
      console.log('   - Name:', `${inviteData.client.firstName} ${inviteData.client.lastName}`);
      console.log('   - Email:', inviteData.client.email);
      console.log('   - Status:', inviteData.client.status);
    }
    
    console.log('\n');
    
    if (inviteData.emailSent) {
      console.log('✅ SUCCESS: Email invitation was sent successfully!');
      console.log('   Check the patient\'s email inbox for the invitation.');
    } else if (inviteData.success) {
      console.log('⚠️  PARTIAL SUCCESS: Patient was invited but email was not sent.');
      console.log('   This could be due to SendGrid configuration issues.');
      console.log('   The patient can still register using the invitation link.');
    } else {
      console.log('❌ FAILED: Could not create patient invitation.');
    }
    
  } catch (error: any) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n=====================================');
  console.log('Test Complete!\n');
}

// Run the test
testPatientInvitation().catch(console.error);