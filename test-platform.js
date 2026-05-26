const axios = require('axios');
const GATEWAY = 'http://localhost:3000';

async function testPlatform() {
  console.log('Testing Cybersecurity Platform...\n');

  try {
    // Create tenant
    console.log('1. Creating tenant...');
    const tenant = await axios.post(`${GATEWAY}/tenants`, {
      id: 'tenant-test',
      name: 'Test Corp',
      domain: 'test.com',
      plan: 'enterprise',
      settings: {
        dataRetentionDays: 90,
        maxRequestsPerSecond: 1000,
        enabledModules: ['waf', 'ngfw', 'siem-soar', 'vuln-scanner', 'fraud-detection', 'awareness', 'grc', 'iam'],
        alertChannels: []
      },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('   Tenant created:', tenant.data.data.name);

    const headers = { 'x-tenant-id': 'tenant-test' };

    // Test WAF
    console.log('\n2. Testing WAF...');
    const wafRule = await axios.post(`${GATEWAY}/waf/rules`, {
      pattern: 'SELECT.*FROM', action: 'block', type: 'sql-injection'
    }, { headers });
    console.log('   WAF rule created:', wafRule.data.data.id);

    // Test NGFW
    console.log('\n3. Testing NGFW...');
    const ngfwRule = await axios.post(`${GATEWAY}/ngfw/rules`, {
      sourceIP: '192.168.1.100', destinationPort: 80, protocol: 'tcp', action: 'allow'
    }, { headers });
    console.log('   NGFW rule created:', ngfwRule.data.data.id);

    // Test SIEM/SOAR
    console.log('\n4. Testing SIEM/SOAR...');
    const log = await axios.post(`${GATEWAY}/siem-soar/logs`, {
      source: 'firewall', level: 'critical', message: 'Intrusion detected'
    }, { headers });
    console.log('   Log entry created:', log.data.data.id);

    // Test Vulnerability Scanner
    console.log('\n5. Testing Vulnerability Scanner...');
    const scan = await axios.post(`${GATEWAY}/vuln-scanner/scans`, {
      target: '10.0.0.0/24'
    }, { headers });
    console.log('   Scan started:', scan.data.data.id);

    // Test Fraud Detection
    console.log('\n6. Testing Fraud Detection...');
    const txn = await axios.post(`${GATEWAY}/fraud-detection/transactions`, {
      userId: 'user-1', amount: 15000, currency: 'USD', location: 'CN'
    }, { headers });
    console.log('   Transaction processed, risk score:', txn.data.data.riskScore);

    // Test Awareness Platform
    console.log('\n7. Testing Awareness Platform...');
    const campaign = await axios.post(`${GATEWAY}/awareness/campaigns`, {
      name: 'Phishing Test', template: 'fake-login', targetEmails: ['user@test.com']
    }, { headers });
    console.log('   Campaign created:', campaign.data.data.id);

    // Test GRC
    console.log('\n8. Testing GRC...');
    const policy = await axios.post(`${GATEWAY}/grc/policies`, {
      name: 'Password Policy', framework: 'ISO27001', controls: []
    }, { headers });
    console.log('   Policy created:', policy.data.data.id);

    // Test IAM
    console.log('\n9. Testing IAM...');
    const user = await axios.post(`${GATEWAY}/iam/users`, {
      email: 'admin@test.com', password: 'SecurePass123!', roles: ['admin']
    }, { headers });
    console.log('   User created:', user.data.data.email);

    console.log('\n✅ All tests passed! Platform is operational.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

testPlatform();
