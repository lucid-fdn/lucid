"use strict";
module.exports = {
  default: {
    description: "List available apps (integrations) in Zapier.",
    exec: async (nango, input) => {
      const response = await nango.get({
        endpoint: "/v2/apps",
        retries: 3,
      });

      return response.data;
    },
  },
};
