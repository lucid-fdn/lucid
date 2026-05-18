"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// notion/actions/retrieve-database.ts
var retrieve_database_exports = {};
__export(retrieve_database_exports, {
  default: () => retrieve_database_default
});
module.exports = __toCommonJS(retrieve_database_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  database_id: import_zod.z.string().describe('The ID of the database to retrieve. Example: "2b6ce298-3121-8079-a497-d3eca16d875c"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.string(),
  created_time: import_zod.z.string(),
  last_edited_time: import_zod.z.string(),
  title: import_zod.z.array(import_zod.z.any()),
  properties: import_zod.z.record(import_zod.z.string(), import_zod.z.any())
});
var action = {
  type: "action",
  description: "Gets database schema and column structure.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/databases/get",
    group: "Databases"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/retrieve-a-database
      endpoint: `v1/databases/${input.database_id}`,
      retries: 3
    };
    const response = await nango.get(config);
    const data = response.data;
    return {
      id: data.id,
      object: data.object,
      created_time: data.created_time,
      last_edited_time: data.last_edited_time,
      title: data.title,
      properties: data.properties
    };
  }
};
var retrieve_database_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvcmV0cmlldmUtZGF0YWJhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZGF0YWJhc2VfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZGF0YWJhc2UgdG8gcmV0cmlldmUuIEV4YW1wbGU6IFwiMmI2Y2UyOTgtMzEyMS04MDc5LWE0OTctZDNlY2ExNmQ4NzVjXCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWRfdGltZTogei5zdHJpbmcoKSxcbiAgbGFzdF9lZGl0ZWRfdGltZTogei5zdHJpbmcoKSxcbiAgdGl0bGU6IHouYXJyYXkoei5hbnkoKSksXG4gIHByb3BlcnRpZXM6IHoucmVjb3JkKHouc3RyaW5nKCksIHouYW55KCkpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdHZXRzIGRhdGFiYXNlIHNjaGVtYSBhbmQgY29sdW1uIHN0cnVjdHVyZS4nLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgcGF0aDogJy9kYXRhYmFzZXMvZ2V0JyxcbiAgICBncm91cDogJ0RhdGFiYXNlcydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZzogUHJveHlDb25maWd1cmF0aW9uID0ge1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLm5vdGlvbi5jb20vcmVmZXJlbmNlL3JldHJpZXZlLWEtZGF0YWJhc2VcbiAgICAgIGVuZHBvaW50OiBgdjEvZGF0YWJhc2VzLyR7aW5wdXQuZGF0YWJhc2VfaWR9YCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KGNvbmZpZyk7XG4gICAgY29uc3QgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBkYXRhLmlkLFxuICAgICAgb2JqZWN0OiBkYXRhLm9iamVjdCxcbiAgICAgIGNyZWF0ZWRfdGltZTogZGF0YS5jcmVhdGVkX3RpbWUsXG4gICAgICBsYXN0X2VkaXRlZF90aW1lOiBkYXRhLmxhc3RfZWRpdGVkX3RpbWUsXG4gICAgICB0aXRsZTogZGF0YS50aXRsZSxcbiAgICAgIHByb3BlcnRpZXM6IGRhdGEucHJvcGVydGllc1xuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBR2xCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixhQUFhLGFBQUUsT0FBTyxFQUFFLFNBQVMscUZBQXFGO0FBQ3hILENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLFFBQVEsYUFBRSxPQUFPO0FBQUEsRUFDakIsY0FBYyxhQUFFLE9BQU87QUFBQSxFQUN2QixrQkFBa0IsYUFBRSxPQUFPO0FBQUEsRUFDM0IsT0FBTyxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUM7QUFBQSxFQUN0QixZQUFZLGFBQUUsT0FBTyxhQUFFLE9BQU8sR0FBRyxhQUFFLElBQUksQ0FBQztBQUMxQyxDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDO0FBQUEsRUFDVCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLFNBQTZCO0FBQUE7QUFBQSxNQUVqQyxVQUFVLGdCQUFnQixNQUFNLFdBQVc7QUFBQSxNQUMzQyxTQUFTO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxNQUFNO0FBQ3ZDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFdBQU87QUFBQSxNQUNMLElBQUksS0FBSztBQUFBLE1BQ1QsUUFBUSxLQUFLO0FBQUEsTUFDYixjQUFjLEtBQUs7QUFBQSxNQUNuQixrQkFBa0IsS0FBSztBQUFBLE1BQ3ZCLE9BQU8sS0FBSztBQUFBLE1BQ1osWUFBWSxLQUFLO0FBQUEsSUFDbkI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLDRCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
