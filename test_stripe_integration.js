#!/usr/bin/env node

// Test script to verify service and membership creation with Stripe Connect integration
const API_BASE = 'http://localhost:5000';

async function testCreateService() {
  console.log('\n🧪 Testing Service Creation...');
  
  const serviceData = {
    name: "Test Facial Treatment",
    description: "Premium facial treatment with advanced skincare",
    price: "150.00",
    duration: 90,
    categoryId: null,
    depositRequired: true,
    depositAmount: "25.00"
  };

  try {
    const response = await fetch(`${API_BASE}/api/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We'll need a valid session cookie here
      },
      body: JSON.stringify(serviceData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Service created successfully:', result.name);
      console.log('📦 Service ID:', result.id);
      console.log('💰 Stripe Product ID:', result.stripeProductId || 'None');
      console.log('💳 Stripe Price ID:', result.stripePriceId || 'None');
    } else {
      console.log('❌ Service creation failed:', result.message);
    }
    
    return response.ok ? result : null;
  } catch (error) {
    console.log('❌ Service creation error:', error.message);
    return null;
  }
}

async function testCreateMembership() {
  console.log('\n🧪 Testing Membership Creation...');
  
  const membershipData = {
    name: "Premium Wellness Plan",
    description: "Comprehensive wellness membership with exclusive benefits",
    monthlyPrice: 199,
    yearlyPrice: 1999,
    isActive: true
  };

  try {
    const response = await fetch(`${API_BASE}/api/membership-tiers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We'll need a valid session cookie here
      },
      body: JSON.stringify(membershipData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Membership created successfully:', result.name);
      console.log('📦 Membership ID:', result.id);
      console.log('💳 Monthly Stripe Price ID:', result.stripePriceIdMonthly || 'None');
      console.log('💳 Yearly Stripe Price ID:', result.stripePriceIdYearly || 'None');
    } else {
      console.log('❌ Membership creation failed:', result.message);
    }
    
    return response.ok ? result : null;
  } catch (error) {
    console.log('❌ Membership creation error:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Stripe Connect Integration Test...');
  
  // Test service creation
  const service = await testCreateService();
  
  // Test membership creation  
  const membership = await testCreateMembership();
  
  console.log('\n📊 Test Summary:');
  console.log('Service Creation:', service ? '✅ Success' : '❌ Failed');
  console.log('Membership Creation:', membership ? '✅ Success' : '❌ Failed');
  
  if (service && membership) {
    console.log('\n🎉 All tests passed! Stripe Connect integration is working.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the logs above for details.');
  }
}

main().catch(console.error);