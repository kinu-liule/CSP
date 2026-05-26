// Policy Engine for API Gateway
const fs = require('fs');
const path = require('path');

class PolicyEngine {
  constructor() {
    this.policies = new Map();
    this.policiesPath = path.join(__dirname, 'policies');
    this.loadPolicies();
  }

  loadPolicies() {
    if (!fs.existsSync(this.policiesPath)) {
      fs.mkdirSync(this.policiesPath, { recursive: true });
      this.createDefaultPolicies();
    }

    const files = fs.readdirSync(this.policiesPath)
      .filter(f => f.endsWith('.json'));

    files.forEach(file => {
      try {
        const policyPath = path.join(this.policiesPath, file);
        const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
        if (policy.id && policy.rules) {
          this.policies.set(policy.id, policy);
          console.log(`Loaded policy: ${policy.name || policy.id}`);
        }
      } catch (err) {
        console.error(`Failed to load policy ${file}:`, err.message);
      }
    });
  }

  createDefaultPolicies() {
    const defaultPolicies = [
      {
        id: 'rate-limit-policy',
        name: 'Tenant Rate Limit Policy',
        description: 'Rate limiting based on tenant tier',
        priority: 1,
        rules: [
          {
            condition: 'tenant.tier == "free"',
            action: 'rate_limit',
            parameters: { max: 100, window: 900000 }
          },
          {
            condition: 'tenant.tier == "premium"',
            action: 'rate_limit',
            parameters: { max: 1000, window: 900000 }
          },
          {
            condition: 'tenant.tier == "enterprise"',
            action: 'rate_limit',
            parameters: { max: 10000, window: 900000 }
          }
        ]
      },
      {
        id: 'auth-policy',
        name: 'Authentication Policy',
        description: 'Require authentication for protected endpoints',
        priority: 2,
        rules: [
          {
            condition: 'request.path =~ /^\/api\/public/',
            action: 'allow'
          },
          {
            condition: 'request.path =~ /^\/api\//',
            action: 'require_auth',
            parameters: { scopes: ['read'] }
          }
        ]
      },
      {
        id: 'geo-block-policy',
        name: 'Geographic Block Policy',
        description: 'Block requests from restricted countries',
        priority: 3,
        rules: [
          {
            condition: 'request.geo.country in ["KP", "IR", "SY"]',
            action: 'deny',
            parameters: { status: 403, message: 'Access from your region is restricted' }
          }
        ]
      },
      {
        id: 'payload-policy',
        name: 'Payload Inspection Policy',
        description: 'Inspect and validate request payloads',
        priority: 4,
        rules: [
          {
            condition: 'request.method in ["POST", "PUT", "PATCH"]',
            action: 'validate_payload',
            parameters: { 
              maxSize: '10mb',
              allowedContentTypes: ['application/json', 'multipart/form-data']
            }
          }
        ]
      }
    ];

    defaultPolicies.forEach(policy => {
      fs.writeFileSync(
        path.join(this.policiesPath, `${policy.id}.json`),
        JSON.stringify(policy, null, 2)
      );
    });
  }

  evaluateRequest(req) {
    const context = {
      request: {
        method: req.method,
        path: req.path,
        headers: req.headers,
        ip: req.ip,
        geo: req.geo || {}
      },
      tenant: req.tenant || {},
      user: req.user || {}
    };

    const results = [];
    const sortedPolicies = Array.from(this.policies.values())
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));

    for (const policy of sortedPolicies) {
      for (const rule of policy.rules) {
        try {
          const matched = this.evaluateCondition(rule.condition, context);
          if (matched) {
            results.push({
              policyId: policy.id,
              policyName: policy.name,
              rule: rule,
              action: rule.action,
              parameters: rule.parameters || {}
            });
          }
        } catch (err) {
          console.error(`Policy evaluation error (${policy.id}):`, err.message);
        }
      }
    }

    return results;
  }

  evaluateCondition(condition, context) {
    try {
      const prepared = condition
        .replace(/request\./g, 'context.request.')
        .replace(/tenant\./g, 'context.tenant.')
        .replace(/user\./g, 'context.user.')
        .replace(/==/g, '===')
        .replace(/=~/g, 'matchRegex')
        .replace(/ in /g, ' inArray ');

      if (prepared.includes('matchRegex')) {
        return this.evaluateRegexCondition(condition, context);
      }
      if (prepared.includes('inArray')) {
        return this.evaluateInArrayCondition(condition, context);
      }

      return eval(prepared);
    } catch (err) {
      return false;
    }
  }

  evaluateRegexCondition(condition, context) {
    const match = condition.match(/(.+) =~ (.+)/);
    if (!match) return false;
    
    const [_, left, right] = match;
    const value = this.resolveValue(left.trim(), context);
    const regex = new RegExp(right.trim().replace(/^\/|\/$/g, ''));
    
    return regex.test(value);
  }

  evaluateInArrayCondition(condition, context) {
    const match = condition.match(/(.+) inArray \[(.+)\]/);
    if (!match) return false;
    
    const [_, left, right] = match;
    const value = this.resolveValue(left.trim(), context);
    const array = right.split(',').map(v => v.trim().replace(/"/g, ''));
    
    return array.includes(value);
  }

  resolveValue(expr, context) {
    try {
      return eval(expr.replace(/request\./g, 'context.request.')
        .replace(/tenant\./g, 'context.tenant.')
        .replace(/user\./g, 'context.user.'));
    } catch {
      return undefined;
    }
  }

  getPolicy(id) {
    return this.policies.get(id);
  }

  addPolicy(policy) {
    if (policy.id && policy.rules) {
      this.policies.set(policy.id, policy);
      fs.writeFileSync(
        path.join(this.policiesPath, `${policy.id}.json`),
        JSON.stringify(policy, null, 2)
      );
    }
  }
}

module.exports = new PolicyEngine();
