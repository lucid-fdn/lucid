"use strict";
module.exports = {
  default: {
    description: "Get detailed company info including tech stack, funding, and employee data.",
    exec: async (nango, input) => {
      const response = await nango.get({
        endpoint: "/v1/organizations/enrich",
        params: {
          domain: input.domain,
        },
        retries: 3,
      });
      return response.data.organization || response.data;
    },
  },
};
