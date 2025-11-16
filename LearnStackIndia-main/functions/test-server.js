// debug-test.js - Test script to debug registration issues
const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test functions
async function testServerHealth() {
  try {
    console.log('🔍 Testing server health...');
    const response = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testRegistration() {
  try {
    console.log('🔍 Testing registration...');
    
    const testUser = {
      username: 'testuser123',
      email: 'test@example.com',
      password: 'password123'
    };
    
    console.log('📝 Sending registration request:', testUser);
    
    const response = await axios.post(`${API_BASE}/auth/register`, testUser, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Registration successful:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('❌ Registration failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}

async function testLogin(email, password) {
  try {
    console.log('🔍 Testing login...');
    
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Login successful:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('❌ Login failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting debug tests...\n');
  
  // Test 1: Server health
  const healthOk = await testServerHealth();
  if (!healthOk) {
    console.log('❌ Server is not responding. Make sure it\'s running on port 5000');
    return;
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Registration
  const registrationResult = await testRegistration();
  
  if (registrationResult) {
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Login with the registered user
    await testLogin('test@example.com', 'password123');
  }
  
  console.log('\n🏁 Tests completed!');
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testServerHealth, testRegistration, testLogin };