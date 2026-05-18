"use strict";
module.exports = {
  default: {
    description: "Get detailed information about a specific Zap.",
    exec: async (nango, input) => {
      const response = await nango.get({
        endpoint: `/v2/zaps/${input.zapId}`,
        retries: 3,
      });

      return response.data;
    },
  },
};
