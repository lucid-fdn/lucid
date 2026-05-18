"use strict";
module.exports = {
  default: {
    description: "List email sequences in your Apollo account.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/emailer_campaigns/search",
        data: {
          per_page: input.per_page,
          page: input.page,
        },
        retries: 3,
      });
      return response.data;
    },
  },
};
