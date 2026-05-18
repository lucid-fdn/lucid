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

// hubspot/actions/create-contact.ts
var create_contact_exports = {};
__export(create_contact_exports, {
  default: () => create_contact_default
});
module.exports = __toCommonJS(create_contact_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  email: z.string().email().describe("Contact email address"),
  firstname: z.string().optional().describe("First name"),
  lastname: z.string().optional().describe("Last name"),
  company: z.string().optional().describe("Company name"),
  phone: z.string().optional().describe("Phone number"),
  jobtitle: z.string().optional().describe("Job title"),
  lifecyclestage: z.string().optional().describe("Lifecycle stage (e.g. lead, customer)"),
  properties: z.record(z.string(), z.string()).optional().describe("Additional properties as key-value pairs")
});
var outputSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  created_at: z.string().optional()
});
var action = {
  type: "action",
  description: "Create a new contact in HubSpot CRM",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/hubspot/contacts",
    group: "Contacts"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const properties = {
      email: input.email,
      ...input.firstname ? {
        firstname: input.firstname
      } : {},
      ...input.lastname ? {
        lastname: input.lastname
      } : {},
      ...input.company ? {
        company: input.company
      } : {},
      ...input.phone ? {
        phone: input.phone
      } : {},
      ...input.jobtitle ? {
        jobtitle: input.jobtitle
      } : {},
      ...input.lifecyclestage ? {
        lifecyclestage: input.lifecyclestage
      } : {},
      ...input.properties || {}
    };
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/crm/v3/objects/contacts",
      data: {
        properties
      }
    });
    if (response.data?.status === "error") {
      throw new Error(`HubSpot error: ${response.data.message}`);
    }
    return {
      id: response.data.id,
      email: response.data.properties?.email,
      firstname: response.data.properties?.firstname,
      lastname: response.data.properties?.lastname,
      created_at: response.data.createdAt
    };
  }
};
var create_contact_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiaHVic3BvdC9hY3Rpb25zL2NyZWF0ZS1jb250YWN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZW1haWw6IHouc3RyaW5nKCkuZW1haWwoKS5kZXNjcmliZSgnQ29udGFjdCBlbWFpbCBhZGRyZXNzJyksXG4gIGZpcnN0bmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGaXJzdCBuYW1lJyksXG4gIGxhc3RuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xhc3QgbmFtZScpLFxuICBjb21wYW55OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbXBhbnkgbmFtZScpLFxuICBwaG9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQaG9uZSBudW1iZXInKSxcbiAgam9idGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnSm9iIHRpdGxlJyksXG4gIGxpZmVjeWNsZXN0YWdlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xpZmVjeWNsZSBzdGFnZSAoZS5nLiBsZWFkLCBjdXN0b21lciknKSxcbiAgcHJvcGVydGllczogei5yZWNvcmQoei5zdHJpbmcoKSwgei5zdHJpbmcoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWRkaXRpb25hbCBwcm9wZXJ0aWVzIGFzIGtleS12YWx1ZSBwYWlycycpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIGVtYWlsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGZpcnN0bmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsYXN0bmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkX2F0OiB6LnN0cmluZygpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIG5ldyBjb250YWN0IGluIEh1YlNwb3QgQ1JNJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2h1YnNwb3QvY29udGFjdHMnLFxuICAgIGdyb3VwOiAnQ29udGFjdHMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpID0+IHtcbiAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgZW1haWw6IGlucHV0LmVtYWlsLFxuICAgICAgLi4uKGlucHV0LmZpcnN0bmFtZSA/IHtcbiAgICAgICAgZmlyc3RuYW1lOiBpbnB1dC5maXJzdG5hbWVcbiAgICAgIH0gOiB7fSksXG4gICAgICAuLi4oaW5wdXQubGFzdG5hbWUgPyB7XG4gICAgICAgIGxhc3RuYW1lOiBpbnB1dC5sYXN0bmFtZVxuICAgICAgfSA6IHt9KSxcbiAgICAgIC4uLihpbnB1dC5jb21wYW55ID8ge1xuICAgICAgICBjb21wYW55OiBpbnB1dC5jb21wYW55XG4gICAgICB9IDoge30pLFxuICAgICAgLi4uKGlucHV0LnBob25lID8ge1xuICAgICAgICBwaG9uZTogaW5wdXQucGhvbmVcbiAgICAgIH0gOiB7fSksXG4gICAgICAuLi4oaW5wdXQuam9idGl0bGUgPyB7XG4gICAgICAgIGpvYnRpdGxlOiBpbnB1dC5qb2J0aXRsZVxuICAgICAgfSA6IHt9KSxcbiAgICAgIC4uLihpbnB1dC5saWZlY3ljbGVzdGFnZSA/IHtcbiAgICAgICAgbGlmZWN5Y2xlc3RhZ2U6IGlucHV0LmxpZmVjeWNsZXN0YWdlXG4gICAgICB9IDoge30pLFxuICAgICAgLi4uKGlucHV0LnByb3BlcnRpZXMgfHwge30pXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnByb3h5KHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgZW5kcG9pbnQ6ICcvY3JtL3YzL29iamVjdHMvY29udGFjdHMnLFxuICAgICAgZGF0YToge1xuICAgICAgICBwcm9wZXJ0aWVzXG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBIdWJTcG90IGVycm9yOiAke3Jlc3BvbnNlLmRhdGEubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiByZXNwb25zZS5kYXRhLmlkLFxuICAgICAgZW1haWw6IHJlc3BvbnNlLmRhdGEucHJvcGVydGllcz8uZW1haWwsXG4gICAgICBmaXJzdG5hbWU6IHJlc3BvbnNlLmRhdGEucHJvcGVydGllcz8uZmlyc3RuYW1lLFxuICAgICAgbGFzdG5hbWU6IHJlc3BvbnNlLmRhdGEucHJvcGVydGllcz8ubGFzdG5hbWUsXG4gICAgICBjcmVhdGVkX2F0OiByZXNwb25zZS5kYXRhLmNyZWF0ZWRBdFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE9BQVMsU0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLHVCQUF1QjtBQUFBLEVBQzFELFdBQWEsU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLFlBQVk7QUFBQSxFQUN0RCxVQUFZLFNBQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxXQUFXO0FBQUEsRUFDcEQsU0FBVyxTQUFPLEVBQUUsU0FB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
