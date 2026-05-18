"use strict";
module.exports = {
  default: {
    description: "List deals with optional filtering and pagination.",
    exec: async (nango, input) => {
      const params = {};
      if (input.status) params.status = input.status;
      if (input.start !== undefined) params.start = input.start;
      if (input.limit) params.limit = input.limit;
      if (input.sort) params.sort = input.sort;

      const response = await nango.get({
        endpoint: "/v1/deals",
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
