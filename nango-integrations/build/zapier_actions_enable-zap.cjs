"use strict";
module.exports = {
  default: {
    description: "Turn on a Zap so it starts processing triggers.",
    exec: async (nango, input) => {
      const response = await nango.patch({
        endpoint: `/v2/zaps/${input.zapId}`,
        data: { state: "on" },
        retries: 3,
      });

      return response.data;
    },
  },
};
