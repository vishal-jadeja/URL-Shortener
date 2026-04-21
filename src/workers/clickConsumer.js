require('dotenv').config();
const { Kafka } = require('kafkajs');
const { Client } = require('@elastic/elasticsearch');
const config = require('../config');

const INDEX = 'click_events';
const GROUP_ID = 'analytics-consumer';
const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;

async function ensureIndex(esClient) {
  await esClient.indices.create(
    {
      index: INDEX,
      body: {
        mappings: {
          properties: {
            code:        { type: 'keyword' },
            originalUrl: { type: 'keyword' },
            ip:          { type: 'ip' },
            userAgent:   { type: 'text' },
            referer:     { type: 'keyword' },
            timestamp:   { type: 'date' },
          },
        },
      },
    },
    { ignore: [400] }
  );
}

async function connectWithRetry(consumer) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await consumer.connect();
      console.log('[worker] Kafka consumer connected');
      return;
    } catch (err) {
      console.warn(`[worker] connect attempt ${attempt} failed: ${err.message}`);
      if (attempt === RETRY_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

async function run() {
  const kafka = new Kafka({
    clientId: 'url-shortener-worker',
    brokers: config.kafka.brokers,
  });

  const esClient = new Client({ node: config.elasticsearch.node });

  await ensureIndex(esClient);
  console.log('[worker] Elasticsearch index ready');

  const consumer = kafka.consumer({ groupId: GROUP_ID });
  await connectWithRetry(consumer);

  await consumer.subscribe({ topic: 'click_events', fromBeginning: false });

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
      const docs = [];

      for (const message of batch.messages) {
        let event;
        try {
          event = JSON.parse(message.value.toString());
        } catch {
          resolveOffset(message.offset);
          await heartbeat();
          continue;
        }

        docs.push({ index: { _index: INDEX } });
        docs.push(event);
        resolveOffset(message.offset);
        await heartbeat();
      }

      if (docs.length > 0) {
        const { errors } = await esClient.bulk({ body: docs });
        if (errors) {
          console.error('[worker] Elasticsearch bulk had errors');
        }
      }

      await commitOffsetsIfNecessary();
    },
  });

  process.on('SIGTERM', async () => {
    console.log('[worker] SIGTERM received, disconnecting...');
    await consumer.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[worker] SIGINT received, disconnecting...');
    await consumer.disconnect();
    process.exit(0);
  });
}

run().catch(err => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
