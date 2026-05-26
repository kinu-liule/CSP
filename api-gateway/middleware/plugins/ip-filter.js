
module.exports = {
  name: 'ip-filter',
  priority: 2,
  handler: (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const blacklist = (process.env.IP_BLACKLIST?.split(',') || []).filter(Boolean);
    const whitelist = (process.env.IP_WHITELIST?.split(',') || []).filter(Boolean);
    
    if (blacklist.includes(clientIP)) {
      return res.status(403).json({ error: 'IP blocked' });
    }
    
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      return res.status(403).json({ error: 'IP not allowed' });
    }
    next();
  }
};
