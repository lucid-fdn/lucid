"use strict";
module.exports = {
  default: {
    description: "Turn off a Zap to stop processing triggers.",
    exec: async (nango, input) => {
      const response = await nango.patch({
        endpoint: `/v2/zaps/${input.zapId}`,
        data: { state: "off" },
        retries: 3,
      });

      return response.data;
    },
  },
};
