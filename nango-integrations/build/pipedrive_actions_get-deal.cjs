"use strict";
module.exports = {
  default: {
    description: "Get full details of a specific deal.",
    exec: async (nango, input) => {
      const { dealId } = input;

      const response = await nango.get({
        endpoint: `/v1/deals/${dealId}`,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
