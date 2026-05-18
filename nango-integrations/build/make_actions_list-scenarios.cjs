"use strict";
module.exports = {
  default: {
    description: "List all automation scenarios in the Make account.",
    exec: async (nango, input) => {
      const params = {};
      if (input.limit) params.limit = input.limit;
      if (input.offset) params["pg[offset]"] = input.offset;

      const response = await nango.get({
        endpoint: "/scenarios",
        params,
        retries: 3,
      });

      return response.data.scenarios || response.data;
    },
  },
};
