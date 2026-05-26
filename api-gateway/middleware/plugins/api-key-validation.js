
module.exports = {
  name: 'api-key-validation',
  priority: 5,
  handler: (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validKeys = (process.env.VALID_API_KEYS?.split(',') || []).filter(Boolean);
    
    if (validKeys.length > 0) {
      if (req.path.startsWith('/api/') && !apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }
      
      if (apiKey && !validKeys.includes(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
    }
    next();
  }
};
