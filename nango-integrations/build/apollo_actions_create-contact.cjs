"use strict";
module.exports = {
  default: {
    description: "Add a contact to your Apollo CRM.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/contacts",
        data: input,
        retries: 3,
      });
      return response.data.contact || response.data;
    },
  },
};
