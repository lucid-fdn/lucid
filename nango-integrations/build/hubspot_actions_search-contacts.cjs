"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// hubspot/actions/search-contacts.ts
var search_contacts_exports = {};
__export(search_contacts_exports, {
  default: () => search_contacts_default
});
module.exports = __toCommonJS(search_contacts_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  query: z.string().optional().describe("Search query (searches across name, email, phone)"),
  limit: z.number().min(1).max(100).optional().describe("Max results (1-100, default 10)"),
  properties: z.array(z.string()).optional().describe("Properties to return (default: common fields)")
});
var contactSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  lifecyclestage: z.string().optional(),
  createdate: z.string().optional(),
  lastmodifieddate: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});
var outputSchema = z.object({
  contacts: z.array(contactSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "Search contacts in HubSpot CRM",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/hubspot/contacts/search",
    group: "Contacts"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const props = input.properties || ["email", "firstname", "lastname", "company", "phone", "lifecyclestage", "createdate", "lastmodifieddate"];
    const body = {
      limit: input.limit ?? 10,
      properties: props
    };
    if (input.query) {
      body["query"] = input.query;
    }
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/crm/v3/objects/contacts/search",
      data: body
    });
    if (response.data?.status === "error") {
      throw new Error(`HubSpot error: ${response.data.message}`);
    }
    const contacts = (response.data?.results || []).map((c) => ({
      id: c.id,
      email: c.properties?.email,
      firstname: c.properties?.firstname,
      lastname: c.properties?.lastname,
      company: c.properties?.company,
      phone: c.properties?.phone,
      lifecyclestage: c.properties?.lifecyclestage,
      createdate: c.properties?.createdate,
      lastmodifieddate: c.properties?.lastmodifieddate,
      properties: c.properties
    }));
    return {
      contacts,
      total: response.data?.total || contacts.length
    };
  }
};
var search_contacts_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiaHVic3BvdC9hY3Rpb25zL3NlYXJjaC1jb250YWN0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHF1ZXJ5OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NlYXJjaCBxdWVyeSAoc2VhcmNoZXMgYWNyb3NzIG5hbWUsIGVtYWlsLCBwaG9uZSknKSxcbiAgbGltaXQ6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01heCByZXN1bHRzICgxLTEwMCwgZGVmYXVsdCAxMCknKSxcbiAgcHJvcGVydGllczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQcm9wZXJ0aWVzIHRvIHJldHVybiAoZGVmYXVsdDogY29tbW9uIGZpZWxkcyknKVxufSk7XG5jb25zdCBjb250YWN0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgZW1haWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZmlyc3RuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGxhc3RuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNvbXBhbnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcGhvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbGlmZWN5Y2xlc3RhZ2U6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZGF0ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsYXN0bW9kaWZpZWRkYXRlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHByb3BlcnRpZXM6IHoucmVjb3JkKHouc3RyaW5nKCksIHoudW5rbm93bigpKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY29udGFjdHM6IHouYXJyYXkoY29udGFjdFNjaGVtYSksXG4gIHRvdGFsOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdTZWFyY2ggY29udGFjdHMgaW4gSHViU3BvdCBDUk0nLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvaHVic3BvdC9jb250YWN0cy9zZWFyY2gnLFxuICAgIGdyb3VwOiAnQ29udGFjdHMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpID0+IHtcbiAgICBjb25zdCBwcm9wcyA9IGlucHV0LnByb3BlcnRpZXMgfHwgWydlbWFpbCcsICdmaXJzdG5hbWUnLCAnbGFzdG5hbWUnLCAnY29tcGFueScsICdwaG9uZScsICdsaWZlY3ljbGVzdGFnZScsICdjcmVhdGVkYXRlJywgJ2xhc3Rtb2RpZmllZGRhdGUnXTtcbiAgICBjb25zdCBib2R5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICAgIGxpbWl0OiBpbnB1dC5saW1pdCA/PyAxMCxcbiAgICAgIHByb3BlcnRpZXM6IHByb3BzXG4gICAgfTtcbiAgICBpZiAoaW5wdXQucXVlcnkpIHtcbiAgICAgIGJvZHlbJ3F1ZXJ5J10gPSBpbnB1dC5xdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGVuZHBvaW50OiAnL2NybS92My9vYmplY3RzL2NvbnRhY3RzL3NlYXJjaCcsXG4gICAgICBkYXRhOiBib2R5XG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBIdWJTcG90IGVycm9yOiAke3Jlc3BvbnNlLmRhdGEubWVzc2FnZX1gKTtcbiAgICB9XG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IGNvbnRhY3RzID0gKHJlc3BvbnNlLmRhdGE/LnJlc3VsdHMgfHwgW10pLm1hcCgoYzogYW55KSA9PiAoe1xuICAgICAgaWQ6IGMuaWQsXG4gICAgICBlbWFpbDogYy5wcm9wZXJ0aWVzPy5lbWFpbCxcbiAgICAgIGZpcnN0bmFtZTogYy5wcm9wZXJ0aWVzPy5maXJzdG5hbWUsXG4gICAgICBsYXN0bmFtZTogYy5wcm9wZXJ0aWVzPy5sYXN0bmFtZSxcbiAgICAgIGNvbXBhbnk6IGMucHJvcGVydGllcz8uY29tcGFueSxcbiAgICAgIHBob25lOiBjLnByb3BlcnRpZXM/LnBob25lLFxuICAgICAgbGlmZWN5Y2xlc3RhZ2U6IGMucHJvcGVydGllcz8ubGlmZWN5Y2xlc3RhZ2UsXG4gICAgICBjcmVhdGVkYXRlOiBjLnByb3BlcnRpZXM/LmNyZWF0ZWRhdGUsXG4gICAgICBsYXN0bW9kaWZpZWRkYXRlOiBjLnByb3BlcnRpZXM/Lmxhc3Rtb2RpZmllZGRhdGUsXG4gICAgICBwcm9wZXJ0aWVzOiBjLnByb3BlcnRpZXNcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRhY3RzLFxuICAgICAgdG90YWw6IHJlc3BvbnNlLmRhdGE/LnRvdGFsIHx8IGNvbnRhY3RzLmxlbmd0aFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE9BQVMsU0FBTyxFQUFFLFNBQVMsRUFB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
