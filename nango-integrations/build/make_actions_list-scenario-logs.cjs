"use strict";
module.exports = {
  default: {
    description: "Get execution logs for a scenario.",
    exec: async (nango, input) => {
      const params = {};
      if (input.limit) params.limit = input.limit;

      const response = await nango.get({
        endpoint: `/scenarios/${input.scenarioId}/logs`,
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
