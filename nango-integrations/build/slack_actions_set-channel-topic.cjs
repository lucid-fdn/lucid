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

// slack/actions/set-channel-topic.ts
var set_channel_topic_exports = {};
__export(set_channel_topic_exports, {
  default: () => set_channel_topic_default
});
module.exports = __toCommonJS(set_channel_topic_exports);
var import_zod = require("zod");
function stripNullProperties(value) {
  if (Array.isArray(value)) {
    return value.map(stripNullProperties);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== null).map(([key, nestedValue]) => [key, stripNullProperties(nestedValue)]));
  }
  return value;
}
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The ID of the channel to set the topic for. Example: "C12345678"'),
  topic: import_zod.z.string().describe('The new topic string. Does not support formatting or linkification. Example: "Apply topically for best effects"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean(),
  channel: import_zod.z.record(import_zod.z.string(), import_zod.z.any()),
  warning: import_zod.z.string().optional(),
  response_metadata: import_zod.z.record(import_zod.z.string(), import_zod.z.any()).optional()
});
var action = {
  type: "action",
  description: "Set the topic of a channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/set-channel-topic",
    group: "Channels"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:write.topic", "groups:write.topic"],
  exec: async (nango, input) => {
    const response = await nango.post({
      // https://api.slack.com/methods/conversations.setTopic
      endpoint: "/conversations.setTopic",
      data: {
        channel: input.channel_id,
        topic: input.topic
      },
      retries: 3
    });
    return OutputSchema.parse({
      ...response.data,
      channel: stripNullProperties(response.data.channel),
      response_metadata: stripNullProperties(response.data.response_metadata)
    });
  }
};
var set_channel_topic_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zZXQtY2hhbm5lbC10b3BpYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5mdW5jdGlvbiBzdHJpcE51bGxQcm9wZXJ0aWVzKHZhbHVlOiB1bmtub3duKTogdW5rbm93biB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZS5tYXAoc3RyaXBOdWxsUHJvcGVydGllcyk7XG4gIH1cbiAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHZhbHVlKS5maWx0ZXIoKFssIG5lc3RlZFZhbHVlXSkgPT4gbmVzdGVkVmFsdWUgIT09IG51bGwpLm1hcCgoW2tleSwgbmVzdGVkVmFsdWVdKSA9PiBba2V5LCBzdHJpcE51bGxQcm9wZXJ0aWVzKG5lc3RlZFZhbHVlKV0pKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2hhbm5lbF9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBjaGFubmVsIHRvIHNldCB0aGUgdG9waWMgZm9yLiBFeGFtcGxlOiBcIkMxMjM0NTY3OFwiJyksXG4gIHRvcGljOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmV3IHRvcGljIHN0cmluZy4gRG9lcyBub3Qgc3VwcG9ydCBmb3JtYXR0aW5nIG9yIGxpbmtpZmljYXRpb24uIEV4YW1wbGU6IFwiQXBwbHkgdG9waWNhbGx5IGZvciBiZXN0IGVmZmVjdHNcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb2s6IHouYm9vbGVhbigpLFxuICBjaGFubmVsOiB6LnJlY29yZCh6LnN0cmluZygpLCB6LmFueSgpKSxcbiAgd2FybmluZzogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICByZXNwb25zZV9tZXRhZGF0YTogei5yZWNvcmQoei5zdHJpbmcoKSwgei5hbnkoKSkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnU2V0IHRoZSB0b3BpYyBvZiBhIGNoYW5uZWwnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9zZXQtY2hhbm5lbC10b3BpYycsXG4gICAgZ3JvdXA6ICdDaGFubmVscydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2NoYW5uZWxzOndyaXRlLnRvcGljJywgJ2dyb3Vwczp3cml0ZS50b3BpYyddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIC8vIGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9tZXRob2RzL2NvbnZlcnNhdGlvbnMuc2V0VG9waWNcbiAgICAgIGVuZHBvaW50OiAnL2NvbnZlcnNhdGlvbnMuc2V0VG9waWMnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0b3BpYzogaW5wdXQudG9waWNcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgcmV0dXJuIE91dHB1dFNjaGVtYS5wYXJzZSh7XG4gICAgICAuLi5yZXNwb25zZS5kYXRhLFxuICAgICAgY2hhbm5lbDogc3RyaXBOdWxsUHJvcGVydGllcyhyZXNwb25zZS5kYXRhLmNoYW5uZWwpLFxuICAgICAgcmVzcG9uc2VfbWV0YWRhdGE6IHN0cmlwTnVsbFByb3BlcnRpZXMocmVzcG9uc2UuZGF0YS5yZXNwb25zZV9tZXRhZGF0YSlcbiAgICB9KTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsU0FBUyxvQkFBb0IsT0FBeUI7QUFDcEQsTUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3hCLFdBQU8sTUFBTSxJQUFJLG1CQUFtQjtBQUFBLEVBQ3RDO0FBQ0EsTUFBSSxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3RDLFdBQU8sT0FBTyxZQUFZLE9BQU8sUUFBUSxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxXQUFXLE1BQU0sZ0JBQWdCLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxLQUFLLFdBQVcsTUFBTSxDQUFDLEtBQUssb0JBQW9CLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUN4SztBQUNBLFNBQU87QUFDVDtBQUNBLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0VBQWtFO0FBQUEsRUFDbEcsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLGlIQUFpSDtBQUM5SSxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxRQUFRO0FBQUEsRUFDZCxTQUFTLGFBQUUsT0FBTyxhQUFFLE9BQU8sR0FBRyxhQUFFLElBQUksQ0FBQztBQUFBLEVBQ3JDLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQzdCLG1CQUFtQixhQUFFLE9BQU8sYUFBRSxPQUFPLEdBQUcsYUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTO0FBQzVELENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsd0JBQXdCLG9CQUFvQjtBQUFBLEVBQ3JELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBO0FBQUEsTUFFaEMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osU0FBUyxNQUFNO0FBQUEsUUFDZixPQUFPLE1BQU07QUFBQSxNQUNmO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsV0FBTyxhQUFhLE1BQU07QUFBQSxNQUN4QixHQUFHLFNBQVM7QUFBQSxNQUNaLFNBQVMsb0JBQW9CLFNBQVMsS0FBSyxPQUFPO0FBQUEsTUFDbEQsbUJBQW1CLG9CQUFvQixTQUFTLEtBQUssaUJBQWlCO0FBQUEsSUFDeEUsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUVBLElBQU8sNEJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
