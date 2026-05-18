"use strict";
module.exports = {
  default: {
    description: "Trigger an immediate execution of a scenario.",
    exec: async (nango, input) => {
      const config = {
        endpoint: `/scenarios/${input.scenarioId}/run`,
        retries: 3,
      };
      if (input.data) config.data = input.data;

      const response = await nango.post(config);

      return response.data;
    },
  },
};
