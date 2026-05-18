"use strict";
module.exports = {
  default: {
    description: "Create a new activity (call, meeting, task, etc.).",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/activities",
        data: input,
        retries: 3,
      });

      return response.data.data || response.data;
    },
  },
};
