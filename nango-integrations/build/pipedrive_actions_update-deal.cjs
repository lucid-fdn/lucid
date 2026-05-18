"use strict";
module.exports = {
  default: {
    description: "Update an existing deal.",
    exec: async (nango, input) => {
      const { dealId, ...data } = input;

      const response = await nango.put({
        endpoint: `/v1/deals/${dealId}`,
        data,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
