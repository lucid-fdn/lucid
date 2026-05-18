"use strict";
module.exports = {
  default: {
    description: "Create a new deal in a pipeline.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/deals",
        data: input,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
