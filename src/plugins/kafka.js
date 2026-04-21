const fp = require('fastify-plugin');
const { Kafka } = require('kafkajs');
const config = require('../config');

const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

async function connectWithRetry(producer, log) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await producer.connect();
      log.info('Kafka producer connected');
      return;
    } catch (err) {
      log.warn({ attempt, err: err.message }, 'Kafka producer connect failed, retrying...');
      if (attempt === RETRY_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

async function kafkaPlugin(fastify) {
  const kafka = new Kafka({
    clientId: 'url-shortener',
    brokers: config.kafka.brokers,
  });

  const producer = kafka.producer({ allowAutoTopicCreation: false });

  fastify.addHook('onReady', async () => {
    await connectWithRetry(producer, fastify.log);
  });

  fastify.decorate('kafkaProducer', producer);

  fastify.addHook('onClose', async () => {
    await producer.disconnect();
  });
}

module.exports = fp(kafkaPlugin, { name: 'kafka' });
