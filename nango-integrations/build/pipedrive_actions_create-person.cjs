"use strict";
module.exports = {
  default: {
    description: "Create a new contact person.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/persons",
        data: input,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
