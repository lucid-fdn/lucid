"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => { if (from && typeof from === "object" || typeof from === "function") { for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable }); } return to; };
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var exports_mod = {};
__export(exports_mod, { default: () => action_default });
module.exports = __toCommonJS(exports_mod);

var action = {
  type: "action",
  description: "List PayPal transactions within a date range",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/transactions", group: "PayPal" },
  exec: async (nango, input) => {
    if (!input.start_date || !input.end_date) {
      return { error: "start_date and end_date are required" };
    }
    const page_size = input.page_size ?? 20;
    const response = await nango.get({
      endpoint: "/v1/reporting/transactions",
      params: {
        start_date: input.start_date,
        end_date: input.end_date,
        page_size
      },
      retries: 3
    });
    if (!response.data) {
      return { transactions: [], total_items: 0 };
    }
    const txns = (response.data.transaction_details || []).map((t) => ({
      id: t.transaction_info?.transaction_id,
      amount: t.transaction_info?.transaction_amount,
      status: t.transaction_info?.transaction_status,
      payer: t.payer_info?.payer_name
    }));
    return {
      transactions: txns,
      total_items: response.data.total_items || txns.length
    };
  }
};
var action_default = action;
