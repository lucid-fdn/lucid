"use strict";
module.exports = {
  default: {
    description: "Search contacts in your Apollo CRM (saved contacts, not prospecting DB).",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/contacts/search",
        data: input,
        retries: 3,
      });
      return response.data;
    },
  },
};
