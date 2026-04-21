const TOPIC = 'click_events';

async function publishClickEvent(producer, { code, originalUrl, ip, userAgent, referer }) {
  const message = {
    code,
    originalUrl,
    ip,
    userAgent,
    referer,
    timestamp: new Date().toISOString(),
  };

  await producer.send({
    topic: TOPIC,
    messages: [
      {
        key: code,
        value: JSON.stringify(message),
      },
    ],
  });
}

module.exports = { publishClickEvent };
