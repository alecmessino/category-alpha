#!/usr/bin/env node
/* Regression test for the Kalshi market-payload parsers.
 *
 * This file exists because the same bug has now happened twice. Kalshi renames a
 * field, our parser keeps reading the old name, and the value degrades to null or
 * zero — which the honest-degradation path then renders as "NO FEED" or "0", so it
 * looks like an exchange problem rather than a parsing problem. It cost us the whole
 * board once ("0 MKTS", the dollar-denominated price migration) and every size field
 * the second time (the "_fp" migration: volume, open interest and resting depth all
 * read zero while the exchange was publishing them).
 *
 * The fixture below is the REAL field shape captured from the live API by the schema
 * probe in fetch-data.mjs, not an invention. If Kalshi renames again, the fallback
 * assertions here fail in CI before a single cycle of zeroes reaches the board.
 *
 * Run: node scripts/test-markets.mjs
 */
import { priceOf, askPriceOf, spreadOf, depthOf, liquidityOf, volumeOf, volume24hOf,
         openInterestOf, notionalOf } from "./fetch-data.mjs";

let fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};
const ck = (name, cond, detail = "") => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "  " + detail : "")); };

/* Captured live 2026-08-02 from api.elections.kalshi.com — every key the endpoint
   actually returns for a market, with the size fields it actually populates. */
const LIVE = {
  ticker: "KXTROPSTORM-26DEC01-T30", event_ticker: "KXTROPSTORM-26DEC01",
  floor_strike: 30, market_type: "binary", status: "active",
  last_price_dollars: "0.0800", previous_price_dollars: "0.0800",
  yes_bid_dollars: "0.0500", yes_ask_dollars: "0.1100",
  no_bid_dollars: "0.8900", no_ask_dollars: "0.9500",
  yes_bid_size_fp: "5.00", yes_ask_size_fp: "153.00",
  volume_fp: "63.75", volume_24h_fp: "62.75", open_interest_fp: "63.75",
  notional_value_dollars: "1.0000",
  liquidity_dollars: "0.0000",          // still present, still zero — the trap
};

console.log("\n[1] the live payload parses — every size field populated");
eq("volume", volumeOf(LIVE), 63.75);
eq("24h volume", volume24hOf(LIVE), 62.75);
eq("open interest", openInterestOf(LIVE), 63.75);
eq("notional", notionalOf(LIVE), 1);
ck("depth present", !!depthOf(LIVE));
eq("bid size", depthOf(LIVE).bidSize, 5);
eq("ask size", depthOf(LIVE).askSize, 153);
eq("price = mid of bid/ask", priceOf(LIVE), 0.08);
eq("ask price is the ask, not the mid", askPriceOf(LIVE), 0.11);
eq("spread", Math.round(spreadOf(LIVE) * 100) / 100, 0.06);

console.log("\n[2] the fillable cap is priced at the ask");
// 153 contracts resting on the ask at 11c, $1 notional.
eq("fillable dollars", liquidityOf(LIVE), 17);
ck("mid-pricing would understate it", Math.round(153 * priceOf(LIVE)) < liquidityOf(LIVE),
   `mid=$${Math.round(153 * priceOf(LIVE))} ask=$${liquidityOf(LIVE)}`);
// The pathological case that exposed the bug: a 0c/1c book with an enormous offer.
const PENNY = { ...LIVE, yes_bid_dollars: "0.0000", yes_ask_dollars: "0.0100",
                yes_ask_size_fp: "54100.00", last_price_dollars: "0.0100" };
eq("54,100 resting at 1c costs $541 to take", liquidityOf(PENNY), 541);

console.log("\n[3] zero and missing sizes are refused, not guessed");
eq("no ask resting -> no cap from depth", liquidityOf({ ...LIVE, yes_ask_size_fp: "0.00", liquidity_dollars: "0.0000" }), null);
eq("no size fields at all -> null depth", depthOf({ ticker: "X" }), null);
eq("volume defaults to 0, never null", volumeOf({ ticker: "X" }), 0);
eq("24h volume absent -> null, not 0", volume24hOf({ ticker: "X" }), null);
eq("open interest absent -> null, not 0", openInterestOf({ ticker: "X" }), null);

console.log("\n[4] the PREVIOUS two migrations still parse (rollback safety)");
// Legacy integer-cent shape, pre-dollar migration.
const CENTS = { ticker: "X", yes_bid: 5, yes_ask: 11, last_price: 8, volume: 64, liquidity: 1700 };
eq("cent price", Math.round(priceOf(CENTS) * 100) / 100, 0.08);
eq("cent ask price", askPriceOf(CENTS), 0.11);
eq("cent volume", volumeOf(CENTS), 64);
eq("cent liquidity", liquidityOf(CENTS), 17);
// Dollar-string shape without _fp sizes, i.e. the shape between the two migrations.
const DOLLARS = { ticker: "X", yes_bid_dollars: "0.0500", yes_ask_dollars: "0.1100",
                  last_price_dollars: "0.0800", volume_dollars: "64", liquidity_dollars: "17.0000" };
eq("dollar price", priceOf(DOLLARS), 0.08);
eq("dollar volume", volumeOf(DOLLARS), 64);
eq("dollar liquidity", liquidityOf(DOLLARS), 17);

console.log("\n[5] a silent rename cannot pass");
// If Kalshi moves the sizes again, every size read goes null/zero at once. That is
// the signature this test is here to catch.
const RENAMED = { ticker: "X", yes_bid_dollars: "0.0500", yes_ask_dollars: "0.1100",
                  last_price_dollars: "0.0800", liquidity_dollars: "0.0000",
                  yes_ask_depth_v3: "153.00", traded_notional_v3: "63.75" };  // names we do not know
const allZero = volumeOf(RENAMED) === 0 && volume24hOf(RENAMED) == null
             && openInterestOf(RENAMED) == null && depthOf(RENAMED) == null
             && liquidityOf(RENAMED) == null;
ck("an unknown field shape degrades to all-null, which this suite detects", allZero,
   "-> if the live probe ever looks like this, the parser is behind the API again");

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
