
module.exports = {
  name: 'request-logging',
  priority: 1,
  handler: (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        tenantId: req.tenant?.id,
        ip: req.ip
      }));
    });
    next();
  }
};
