"use strict";
module.exports = {
  default: {
    description: "List all sales pipelines.",
    exec: async (nango, input) => {
      const response = await nango.get({
        endpoint: "/v1/pipelines",
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
