"use strict";
module.exports = {
  default: {
    description: "Deactivate (pause) a scenario.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: `/scenarios/${input.scenarioId}/deactivate`,
        retries: 3,
      });

      return response.data;
    },
  },
};
