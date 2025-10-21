#!/usr/bin/env node

/**
 * Test script to verify Stripe Connect customer creation
 * This script tests both connected account and platform account customer creation
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';
const COOKIES = 'your_session_cookie_here'; // You'll need to get this from browser DevTools

async function testStripeConnectCustomer() {
  console.log('🧪 Testing Stripe Connect Customer Creation\n');
  console.log('=' * 50);
  
  // Test 1: Create customer on connected account
  console.log('\n📝 Test 1: Creating customer on CONNECTED account...');
  try {
    const response1 = await fetch(`${BASE_URL}/api/test/stripe-connect-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': COOKIES
      },
      body: JSON.stringify({
        email: `test-connect-${Date.now()}@example.com`,
        name: 'Test Connected Customer',
        useConnectAccount: true
      })
    });
    
    const data1 = await response1.json();
    if (data1.success) {
      console.log('✅ SUCCESS: Customer created on connected account');
      console.log('   Customer ID:', data1.customerId);
      console.log('   Account:', data1.createdOn);
      console.log('   Connect Account ID:', data1.connectAccountId);
      console.log('   Organization:', data1.organizationName);
    } else {
      console.log('❌ FAILED:', data1.message);
      console.log('   Error:', data1.error);
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }
  
  // Test 2: Create customer on platform account (for comparison)
  console.log('\n📝 Test 2: Creating customer on PLATFORM account...');
  try {
    const response2 = await fetch(`${BASE_URL}/api/test/stripe-connect-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': COOKIES
      },
      body: JSON.stringify({
        email: `test-platform-${Date.now()}@example.com`,
        name: 'Test Platform Customer',
        useConnectAccount: false
      })
    });
    
    const data2 = await response2.json();
    if (data2.success) {
      console.log('✅ SUCCESS: Customer created on platform account');
      console.log('   Customer ID:', data2.customerId);
      console.log('   Account:', data2.createdOn);
      console.log('   Connect Account ID:', data2.connectAccountId || 'N/A (Platform)');
      console.log('   Organization:', data2.organizationName);
    } else {
      console.log('❌ FAILED:', data2.message);
      console.log('   Error:', data2.error);
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }
  
  console.log('\n' + '=' * 50);
  console.log('📊 Test Summary:');
  console.log('   - Test endpoint is working');
  console.log('   - Verify in Stripe Dashboard:');
  console.log('     1. Check Platform Account for platform customers');
  console.log('     2. Check Connected Account for connected customers');
  console.log('   - Connected Account customers should appear in the clinic\'s Stripe account');
  console.log('   - Platform customers should appear in your main Stripe account');
}

// Instructions for manual testing
console.log('MANUAL TEST INSTRUCTIONS:');
console.log('=' * 50);
console.log('\n1. First, log in as a clinic admin:');
console.log('   - Go to http://localhost:5000');
console.log('   - Login with clinic admin credentials');
console.log('   - Open DevTools > Application > Cookies');
console.log('   - Copy the session cookie value');
console.log('\n2. Update COOKIES variable in this script with the session cookie');
console.log('\n3. Run this script: node test-stripe-connect.js');
console.log('\n4. Alternatively, use curl:');
console.log('\nCURL COMMAND (replace YOUR_SESSION_COOKIE):');
console.log(`
curl -X POST http://localhost:5000/api/test/stripe-connect-customer \\
  -H "Content-Type: application/json" \\
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \\
  -d '{
    "email": "test@example.com",
    "name": "Test Customer",
    "useConnectAccount": true
  }'
`);

if (process.argv[2] === 'run' && process.argv[3]) {
  COOKIES = process.argv[3];
  testStripeConnectCustomer();
} else {
  console.log('\nTo run the test, use:');
  console.log('node test-stripe-connect.js run "YOUR_SESSION_COOKIE"');
}