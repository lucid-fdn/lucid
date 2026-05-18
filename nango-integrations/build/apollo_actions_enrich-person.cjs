"use strict";
module.exports = {
  default: {
    description: "Enrich a person with full profile data (uses 1 credit).",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/people/match",
        data: {
          email: input.email,
          first_name: input.first_name,
          last_name: input.last_name,
          domain: input.domain,
        },
        retries: 3,
      });
      return response.data.person || response.data;
    },
  },
};
