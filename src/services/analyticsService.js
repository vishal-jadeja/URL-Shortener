const INDEX = 'click_events';

async function getClickStats(esClient, code, { from, to, interval = 'day' } = {}) {
  const rangeFilter = {};
  if (from) rangeFilter.gte = from;
  if (to) rangeFilter.lte = to;

  const filters = [{ term: { code } }];
  if (Object.keys(rangeFilter).length > 0) {
    filters.push({ range: { timestamp: rangeFilter } });
  }

  const result = await esClient.search({
    index: INDEX,
    body: {
      query: {
        bool: { filter: filters },
      },
      aggs: {
        clicks_over_time: {
          date_histogram: {
            field: 'timestamp',
            calendar_interval: interval,
          },
        },
        top_referers: {
          terms: { field: 'referer', size: 10 },
        },
        unique_visitors: {
          cardinality: { field: 'ip' },
        },
      },
      size: 0,
    },
  });

  const aggs = result.aggregations;

  return {
    totalClicks: result.hits.total.value,
    clicksOverTime: aggs.clicks_over_time.buckets.map(b => ({
      date: b.key_as_string,
      count: b.doc_count,
    })),
    topReferers: aggs.top_referers.buckets.map(b => ({
      referer: b.key,
      count: b.doc_count,
    })),
    uniqueVisitors: aggs.unique_visitors.value,
  };
}

module.exports = { getClickStats };
