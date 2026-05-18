"use strict";
module.exports = {
  default: {
    description: "Search for companies/organizations in Apollo.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/mixed_companies/search",
        data: input,
        retries: 3,
      });
      return response.data;
    },
  },
};
