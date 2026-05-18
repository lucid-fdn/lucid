"use strict";
module.exports = {
  default: {
    description: "Get detailed information about a specific scenario.",
    exec: async (nango, input) => {
      const response = await nango.get({
        endpoint: `/scenarios/${input.scenarioId}`,
        retries: 3,
      });

      return response.data.scenario || response.data;
    },
  },
};
