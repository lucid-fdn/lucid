"use strict";
module.exports = {
  default: {
    description: "List contacts (persons) in Pipedrive.",
    exec: async (nango, input) => {
      const params = {};
      if (input.start !== undefined) params.start = input.start;
      if (input.limit) params.limit = input.limit;
      if (input.sort) params.sort = input.sort;

      const response = await nango.get({
        endpoint: "/v1/persons",
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
