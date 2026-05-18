"use strict";
module.exports = {
  default: {
    description: "Add contacts to an email sequence.",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: `/v1/emailer_campaigns/${input.sequenceId}/add_contact_ids`,
        data: {
          contact_ids: input.contact_ids,
        },
        retries: 3,
      });
      return response.data;
    },
  },
};
