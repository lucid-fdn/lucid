"use strict";
module.exports = {
  default: {
    description: "List all Zaps in the Zapier account with status and configuration.",
    exec: async (nango, input) => {
      const params = {};
      if (input.state) params.state = input.state;
      if (input.limit) params.limit = input.limit;
      if (input.offset) params.offset = input.offset;

      const response = await nango.get({
        endpoint: "/v2/zaps",
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
