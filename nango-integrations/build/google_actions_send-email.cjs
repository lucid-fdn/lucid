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

// google/actions/send-email.ts
var send_email_exports = {};
__export(send_email_exports, {
  default: () => send_email_default
});
module.exports = __toCommonJS(send_email_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  from: import_zod.z.string().describe("Sender email address"),
  to: import_zod.z.string().describe("Recipient email address"),
  subject: import_zod.z.string().describe("Email subject line"),
  body: import_zod.z.string().describe("Email body (plain text)"),
  headers: import_zod.z.record(import_zod.z.string(), import_zod.z.string()).optional().describe("Optional additional email headers (e.g. Cc, Bcc, Reply-To)")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  threadId: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Send an email using Gmail",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/gmail/send",
    group: "Gmail"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
  exec: async (nango, input) => {
    let headerString = "";
    if (input.headers) {
      Object.entries(input.headers).forEach(([key, value]) => {
        headerString += `${key}: ${value}
`;
      });
    }
    const email = `From: ${input.from}
To: ${input.to}
${headerString}Subject: ${input.subject}

${input.body}`;
    const base64EncodedEmail = Buffer.from(email).toString("base64");
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/gmail/v1/users/me/messages/send",
      data: {
        raw: base64EncodedEmail
      },
      retries: 3
    });
    return {
      id: response.data.id,
      threadId: response.data.threadId
    };
  }
};
var send_email_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvc2VuZC1lbWFpbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZnJvbTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VuZGVyIGVtYWlsIGFkZHJlc3MnKSxcbiAgdG86IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlY2lwaWVudCBlbWFpbCBhZGRyZXNzJyksXG4gIHN1YmplY3Q6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0VtYWlsIHN1YmplY3QgbGluZScpLFxuICBib2R5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdFbWFpbCBib2R5IChwbGFpbiB0ZXh0KScpLFxuICBoZWFkZXJzOiB6LnJlY29yZCh6LnN0cmluZygpLCB6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBhZGRpdGlvbmFsIGVtYWlsIGhlYWRlcnMgKGUuZy4gQ2MsIEJjYywgUmVwbHktVG8pJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgdGhyZWFkSWQ6IHouc3RyaW5nKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1NlbmQgYW4gZW1haWwgdXNpbmcgR21haWwnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvZ21haWwvc2VuZCcsXG4gICAgZ3JvdXA6ICdHbWFpbCdcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvZ21haWwuc2VuZCddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgbGV0IGhlYWRlclN0cmluZyA9ICcnO1xuICAgIGlmIChpbnB1dC5oZWFkZXJzKSB7XG4gICAgICBPYmplY3QuZW50cmllcyhpbnB1dC5oZWFkZXJzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgICAgaGVhZGVyU3RyaW5nICs9IGAke2tleX06ICR7dmFsdWV9XFxuYDtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBlbWFpbCA9IGBGcm9tOiAke2lucHV0LmZyb219XFxuVG86ICR7aW5wdXQudG99XFxuJHtoZWFkZXJTdHJpbmd9U3ViamVjdDogJHtpbnB1dC5zdWJqZWN0fVxcblxcbiR7aW5wdXQuYm9keX1gO1xuICAgIGNvbnN0IGJhc2U2NEVuY29kZWRFbWFpbCA9IEJ1ZmZlci5mcm9tKGVtYWlsKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGVuZHBvaW50OiAnL2dtYWlsL3YxL3VzZXJzL21lL21lc3NhZ2VzL3NlbmQnLFxuICAgICAgZGF0YToge1xuICAgICAgICByYXc6IGJhc2U2NEVuY29kZWRFbWFpbFxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHJlc3BvbnNlLmRhdGEuaWQsXG4gICAgICB0aHJlYWRJZDogcmVzcG9uc2UuZGF0YS50aHJlYWRJZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMsc0JBQXNCO0FBQUEsRUFDaEQsSUFBSSxhQUFFLE9BQU8sRUFBRSxTQUFTLHlCQUF5QjtBQUFBLEVBQ2pELFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxvQkFBb0I7QUFBQSxFQUNqRCxNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMseUJBQXlCO0FBQUEsRUFDbkQsU0FBUyxhQUFFLE9BQU8sYUFBRSxPQUFPLEdBQUcsYUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyw0REFBNEQ7QUFDNUgsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsVUFBVSxhQUFFLE9BQU87QUFDckIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw0Q0FBNEM7QUFBQSxFQUNyRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxRQUFJLGVBQWU7QUFDbkIsUUFBSSxNQUFNLFNBQVM7QUFDakIsYUFBTyxRQUFRLE1BQU0sT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNO0FBQ3RELHdCQUFnQixHQUFHLEdBQUcsS0FBSyxLQUFLO0FBQUE7QUFBQSxNQUNsQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFVBQU0sUUFBUSxTQUFTLE1BQU0sSUFBSTtBQUFBLE1BQVMsTUFBTSxFQUFFO0FBQUEsRUFBSyxZQUFZLFlBQVksTUFBTSxPQUFPO0FBQUE7QUFBQSxFQUFPLE1BQU0sSUFBSTtBQUM3RyxVQUFNLHFCQUFxQixPQUFPLEtBQUssS0FBSyxFQUFFLFNBQVMsUUFBUTtBQUMvRCxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDSixLQUFLO0FBQUEsTUFDUDtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNMLElBQUksU0FBUyxLQUFLO0FBQUEsTUFDbEIsVUFBVSxTQUFTLEtBQUs7QUFBQSxJQUMxQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8scUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
