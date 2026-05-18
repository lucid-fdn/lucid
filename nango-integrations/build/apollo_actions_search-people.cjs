"use strict";
module.exports = {
  default: {
    description: "Search for people/contacts in the Apollo prospecting database (no credit cost).",
    exec: async (nango, input) => {
      const response = await nango.post({
        endpoint: "/v1/mixed_people/search",
        data: {
          q_person_title: input.q_person_title,
          q_organization_name: input.q_organization_name,
          person_locations: input.person_locations,
          person_seniorities: input.person_seniorities,
          per_page: input.per_page,
          page: input.page,
        },
        retries: 3,
      });
      return response.data;
    },
  },
};
