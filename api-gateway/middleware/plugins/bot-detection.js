
module.exports = {
  name: 'bot-detection',
  priority: 10,
  handler: (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const botPatterns = [
      /bot/i, /crawl/i, /spider/i, /scrape/i,
      /curl/i, /wget/i, /python/i, /java/i
    ];
    
    const isBot = botPatterns.some(p => p.test(userAgent));
    if (isBot && !req.headers['x-allowed-bot']) {
      return res.status(403).json({
        error: 'Bot detected',
        requestId: req.headers['x-request-id']
      });
    }
    next();
  }
};
