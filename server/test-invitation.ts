#!/usr/bin/env tsx

import 'dotenv/config';

async function testPatientInvitation() {
  console.log('\n🧪 Testing Patient Invitation System\n');
  console.log('=====================================\n');
  
  // Check SendGrid configuration
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@aesthiq.app';
  const sendGridFromName = process.env.SENDGRID_FROM_NAME || 'Aesthiq';
  
  console.log('📧 SendGrid Configuration:');
  console.log(`   - API Key: ${hasSendGrid ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   - From Email: ${sendGridFromEmail}`);
  console.log(`   - From Name: ${sendGridFromName}`);
  console.log(`   - Debug Mode: ${process.env.NODE_ENV === 'development' ? 'Enabled' : 'Disabled'}`);
  console.log('');
  
  if (!hasSendGrid) {
    console.warn('⚠️  Warning: SENDGRID_API_KEY is not configured.');
    console.log('   Patient records will still be created, but emails will not be sent.');
    console.log('   To enable emails, set the SENDGRID_API_KEY environment variable.');
    console.log('   Optionally, set SENDGRID_FROM_EMAIL for a custom sender address.\n');
  } else {
    console.log('✅ SendGrid is configured and ready to send emails.');
    console.log('   NOTE: Ensure the sender email is verified in SendGrid.\n');
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
    
    // Patient Information
    if (inviteData.patient) {
      console.log('\n👤 Patient Record Created:');
      console.log('   - ID:', inviteData.patient.id);
      console.log('   - Name:', `${inviteData.patient.firstName} ${inviteData.patient.lastName}`);
      console.log('   - Email:', inviteData.patient.email);
      console.log('   - Phone:', inviteData.patient.phone || 'Not provided');
      console.log('   - Status:', inviteData.patient.status);
      console.log('   - Created:', inviteData.patient.createdAt);
    }
    
    // Invitation Details
    if (inviteData.invitation) {
      console.log('\n🎫 Invitation Details:');
      console.log('   - Link:', inviteData.invitation.link);
      console.log('   - Sent To:', inviteData.invitation.sentTo);
    }
    
    // Email Status
    if (inviteData.emailStatus) {
      console.log('\n📧 Email Status:');
      console.log('   - Sent:', inviteData.emailStatus.sent ? '✅ Yes' : '❌ No');
      console.log('   - Message:', inviteData.emailStatus.message);
      
      if (inviteData.emailStatus.error) {
        console.log('   - Error Code:', inviteData.emailStatus.error.code);
        console.log('   - Error Details:', inviteData.emailStatus.error.details);
      }
      
      if (inviteData.emailStatus.debugInfo) {
        console.log('   - Debug Info:', JSON.stringify(inviteData.emailStatus.debugInfo, null, 2));
      }
    }
    
    console.log('\n=====================================');
    
    // Final Summary
    if (inviteData.emailStatus?.sent) {
      console.log('✅ COMPLETE SUCCESS: Patient invited and email sent!');
      console.log('   The patient should receive the invitation email shortly.');
    } else if (inviteData.success) {
      console.log('⚠️  PARTIAL SUCCESS: Patient invited but email not sent.');
      if (inviteData.emailStatus?.error?.code === 'NO_CONFIG') {
        console.log('   Reason: SendGrid is not configured.');
        console.log('   Action: Set SENDGRID_API_KEY to enable email sending.');
      } else {
        console.log('   Reason:', inviteData.emailStatus?.error?.message || 'Unknown email error');
        console.log('   Action: Check SendGrid configuration and sender verification.');
      }
      console.log('   Note: The patient record was created successfully.');
      console.log('   Share this link with the patient:', inviteData.invitation?.link);
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