import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { tenantIsolationMiddleware, tenantStore } from '../shared/middleware/tenantIsolation';
import { messageQueue } from '../shared/utils/messageQueue';
import { MessageType } from '../shared/types/tenant';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(tenantIsolationMiddleware);

const serviceRoutes = {
  '/waf': { target: 'http://localhost:3001', service: 'waf' },
  '/ngfw': { target: 'http://localhost:3002', service: 'ngfw' },
  '/siem-soar': { target: 'http://localhost:3003', service: 'siem-soar' },
  '/vuln-scanner': { target: 'http://localhost:3004', service: 'vuln-scanner' },
  '/fraud-detection': { target: 'http://localhost:3005', service: 'fraud-detection' },
  '/awareness': { target: 'http://localhost:3006', service: 'awareness' },
  '/grc': { target: 'http://localhost:3007', service: 'grc' },
  '/iam': { target: 'http://localhost:3008', service: 'iam' }
};

Object.entries(serviceRoutes).forEach(([path, { target, service }]) => {
  app.use(path, createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^${path}`]: '' },
    onError: (err, req, res) => {
      console.error(`Service ${service} unavailable:`, err.message);
      res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: `${service} service temporarily unavailable` },
        tenantId: (req as any).tenantContext?.tenantId,
        timestamp: new Date()
      });
    }
  }));
});

app.get('/health', async (req, res) => {
  const tenantId = (req as any).tenantContext?.tenantId;
  res.json({
    service: 'api-gateway',
    status: 'healthy',
    timestamp: new Date(),
    tenantId,
    services: Object.keys(serviceRoutes)
  });
});

app.post('/tenants', async (req, res) => {
  const tenant = req.body;
  await tenantStore.addTenant(tenant);
  await messageQueue.publish(tenant.id, 'api-gateway', MessageType.EVENT, { action: 'tenant_created', tenant });
  res.json({ success: true, data: tenant, tenantId: tenant.id, timestamp: new Date() });
});

app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
