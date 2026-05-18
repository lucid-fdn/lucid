"use strict";
module.exports = {
  default: {
    description: "List activities (calls, meetings, tasks).",
    exec: async (nango, input) => {
      const params = {};
      if (input.start !== undefined) params.start = input.start;
      if (input.limit) params.limit = input.limit;
      if (input.type) params.type = input.type;
      if (input.done !== undefined) params.done = input.done;

      const response = await nango.get({
        endpoint: "/v1/activities",
        params,
        retries: 3,
      });

      return response.data;
    },
  },
};
