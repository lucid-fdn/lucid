"use strict";
module.exports = {
  default: {
    description: "List stages of a pipeline.",
    exec: async (nango, input) => {
      const params = {};
      if (input.pipeline_id) params.pipeline_id = input.pipeline_id;

      const response = await nango.get({
        endpoint: "/v1/stages",
        params,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
