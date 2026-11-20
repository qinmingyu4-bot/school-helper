"use strict";
const { createHash, randomUUID } = require('node:crypto');
const DAY = 86400000, TTL = 5 * 60000;
function createOfficialCosts({ db, request, now, env }) {
  const scope = createHash('sha256').update(`${env.OPENAI_COSTS_PROJECT_ID}:${env.OPENAI_COSTS_API_KEY_ID || ''}`).digest('hex');
  const prefix = `official:${scope}:`, pending = new Map();
  let queue = Promise.resolve();
  function read(from, through) {
    if (!env.OPENAI_COSTS_ADMIN_KEY || !env.OPENAI_COSTS_PROJECT_ID) return Promise.resolve({ status: 'not_configured' });
    const key = `${prefix}${from}:${through}`;
    if (!pending.has(key)) {
      const work = queue.then(() => load(key, from, through)).finally(() => pending.delete(key));
      pending.set(key, work); queue = work.catch(() => {});
    }
    return pending.get(key);
  }
  async function archive(from, through, buckets) {
    const months = new Map();
    for (let time=Date.parse(from); time<=Date.parse(through); time+=DAY) {
      const day=new Date(time).toISOString().slice(0,10), month=day.slice(0,7);
      if (!months.has(month)) months.set(month,{});
      months.get(month)[day]={ items:buckets.get(day)||[], fetchedAt:new Date(now()).toISOString() };
    }
    for (const [month,days] of months) await db.changeAiCostControl(`${prefix}month:${month}`,state=>({days:{...state?.days,...days}}));
    await db.changeAiCostControl(`${prefix}history`,state=>({from:state?.from && state.from<from?state.from:from}));
  }
  async function olderArchive(from, before) {
    const index=await db.getAiCostControl(`${prefix}history`);
    const start=index?.from && index.from>from?index.from:from;
    const rows=new Map();
    if (!index || start>=before) return rows;
    let month=start.slice(0,7);
    while (month<=before.slice(0,7)) {
      const record=await db.getAiCostControl(`${prefix}month:${month}`);
      for (const [day,value] of Object.entries(record?.days||{})) if(day>=from && day<before) rows.set(day,value.items);
      const date=new Date(month+'-01');date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);
    }
    return rows;
  }
  async function load(key, from, through) {
    const cached = await db.getAiCostControl(key);
    if (cached?.value && now() - cached.at < TTL) return cached.value;
    const backoffKey = `${prefix}backoff`, backoff = await db.getAiCostControl(backoffKey);
    const fallback = (retryAt) => cached?.value ? { ...cached.value, stale: true, retryAt }
      : { status: 'unavailable', from, through, retryAt };
    if (backoff?.until > now()) return fallback(new Date(backoff.until).toISOString());
    // A shared lease also prevents different workers from hammering the same
    // organization while another range is loading. UI keeps its last snapshot.
    const lease = randomUUID();
    const claim = await db.changeAiCostControl(backoffKey, state => {
      if (state?.until > now() || state?.leaseUntil > now()) return undefined;
      return { ...state, lease, leaseUntil: now() + 100000 };
    });
    if (!claim) return fallback(new Date(now() + 100000).toISOString());
    // Verified live: the provider retains one year, not arbitrary all-time data.
    // Preserve dated daily snapshots so All can extend beyond that window later.
    const floor = new Date(now()); floor.setUTCFullYear(floor.getUTCFullYear()-1);
    let availableFrom = from > floor.toISOString().slice(0,10) ? from : floor.toISOString().slice(0,10);
    let start = Date.parse(availableFrom) / 1000;
    const end = (Date.parse(through) + DAY) / 1000;
    let page; const buckets = new Map(), seen = new Set();
    const signal = AbortSignal.timeout(90000);
    try {
      for (let index = 0; index < 100; index++) {
        if (start >= end) break;
        const url = new URL('https://api.openai.com/v1/organization/costs');
        for (const [k,v] of Object.entries({ start_time:start, end_time:end, limit:180, bucket_width:'1d' })) url.searchParams.set(k,String(v));
        url.searchParams.append('project_ids',env.OPENAI_COSTS_PROJECT_ID);
        if (env.OPENAI_COSTS_API_KEY_ID) url.searchParams.append('api_key_ids',env.OPENAI_COSTS_API_KEY_ID);
        url.searchParams.append('group_by','line_item'); if (page) url.searchParams.set('page',page);
        const response = await request(url.toString(), { headers: { authorization: `Bearer ${env.OPENAI_COSTS_ADMIN_KEY}` }, signal });
        if (!response.ok) {
          if (response.status === 400 && !page) {
            const error = (await response.json().catch(()=>({}))).error;
            const date = /Earliest supported start date: (\d{4}-\d{2}-\d{2})/.exec(error?.message || '')?.[1];
            if (error?.code === 'reporting_lookback_exceeded' && date && date > availableFrom && Date.parse(date) / 1000 < end) {
              availableFrom=date;start=Date.parse(date)/1000;continue;
            }
          }
          const value = response.headers.get('retry-after');
          const retry = /^\d+(\.\d+)?$/.test(value || '') ? Number(value) * 1000 : Date.parse(value) - now();
          throw Object.assign(Error('costs-unavailable'), { wait: response.status === 429 ? Math.max(TTL, Number.isFinite(retry) ? retry : 0) : 60000 });
        }
        const data = await response.json();
        if (!Array.isArray(data.data)) throw Error('costs-invalid');
        for (const bucket of data.data) {
          if (bucket.start_time < start || bucket.start_time >= end || !Array.isArray(bucket.results)) throw Error('costs-invalid');
          for (const item of bucket.results) {
            if (item.amount?.currency !== 'usd' || !Number.isFinite(item.amount.value)) throw Error('costs-invalid');
            const day=new Date(bucket.start_time*1000).toISOString().slice(0,10);
            if(!buckets.has(day))buckets.set(day,[]);
            buckets.get(day).push({label:String(item.line_item || 'other'),amountUsd:item.amount.value});
          }
        }
        if (!data.has_more) {
          await archive(availableFrom,through,buckets);
          const older = await olderArchive(from,availableFrom), items=new Map();
          let total=0;
          for (const rows of [...older.values(),...buckets.values()]) for (const item of rows) {
            total+=item.amountUsd;items.set(item.label,(items.get(item.label)||0)+item.amountUsd);
          }
          const missingDays=Math.max(0,Math.round((Date.parse(availableFrom)-Date.parse(from))/DAY)-older.size);
          const value = { status:'available', amountUsd:total, requestedFrom:from,
            from:[availableFrom,...older.keys()].sort()[0], through, missingDays, coverageLimited:missingDays>0,
            fetchedAt:new Date(now()).toISOString(),
            projectId:env.OPENAI_COSTS_PROJECT_ID, keyFiltered:Boolean(env.OPENAI_COSTS_API_KEY_ID),
            items:[...items].map(([label,amountUsd])=>({label,amountUsd})) };
          await db.changeAiCostControl(key,()=>({at:now(),value}));
          return value;
        }
        if (!data.next_page || seen.has(data.next_page)) throw Error('costs-pagination');
        page=data.next_page; seen.add(page);
      }
      throw Error('costs-pagination');
    } catch(error) {
      const until = now() + (error.wait || 60000);
      await db.changeAiCostControl(backoffKey,state=>state?.lease===lease?{...state,until}:undefined);
      return fallback(new Date(until).toISOString());
    } finally {
      await db.changeAiCostControl(backoffKey,state=>state?.lease===lease?{...state,leaseUntil:0}:undefined);
    }
  }
  return { read };
}
module.exports = { createOfficialCosts };
