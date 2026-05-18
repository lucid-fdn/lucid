"use strict";
module.exports = {
  default: {
    description: "Global search across deals, persons, organizations, and products.",
    exec: async (nango, input) => {
      const params = {};
      if (input.term) params.term = input.term;
      if (input.item_types) params.item_types = input.item_types;
      if (input.limit) params.limit = input.limit;

      const response = await nango.get({
        endpoint: "/v1/itemSearch",
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
