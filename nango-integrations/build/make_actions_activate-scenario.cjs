"use strict";
module.exports = {
  default: {
    description: "Activate (turn on) a scenario so it runs on its schedule.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: `/scenarios/${input.scenarioId}/activate`,
        retries: 3,
      });

      return response.data;
    },
  },
};
