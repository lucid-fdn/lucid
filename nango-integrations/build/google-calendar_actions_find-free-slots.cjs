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

// google/actions/find-free-slots.ts
var find_free_slots_exports = {};
__export(find_free_slots_exports, {
  default: () => find_free_slots_default
});
module.exports = __toCommonJS(find_free_slots_exports);
var import_zod = require("zod");
var TimeMinSchema = import_zod.z.string().describe('Start of the time range in RFC3339 format. Example: "2024-03-15T09:00:00Z"');
var TimeMaxSchema = import_zod.z.string().describe('End of the time range in RFC3339 format. Example: "2024-03-15T17:00:00Z"');
var InputSchema = import_zod.z.object({
  calendarIds: import_zod.z.array(import_zod.z.string()).optional().default(["primary"]).describe('List of calendar IDs to check for free/busy information. Defaults to ["primary"]. Example: ["primary", "work@example.com"]'),
  timeMin: TimeMinSchema,
  timeMax: TimeMaxSchema,
  durationMinutes: import_zod.z.number().min(1).describe("Minimum duration in minutes for a free slot to be returned. Example: 30")
});
var FreeSlotSchema = import_zod.z.object({
  start: import_zod.z.string().describe("Start time of the free slot in RFC3339 format"),
  end: import_zod.z.string().describe("End time of the free slot in RFC3339 format"),
  durationMinutes: import_zod.z.number().describe("Duration of the free slot in minutes")
});
var OutputSchema = import_zod.z.object({
  freeSlots: import_zod.z.array(FreeSlotSchema).describe("List of free time slots meeting the minimum duration"),
  calendarsChecked: import_zod.z.number().describe("Number of calendars checked")
});
var action = {
  type: "action",
  description: "Query free/busy data and return gaps meeting a minimum duration",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/find-free-slots",
    group: "Calendar"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.freebusy"],
  exec: async (nango, input) => {
    const calendarIds = input.calendarIds || ["primary"];
    const response = await nango.post({
      endpoint: "/calendar/v3/freeBusy",
      data: {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        items: calendarIds.map((id) => ({
          id
        })),
        timeZone: "UTC"
      },
      retries: 3
    });
    if (!response.data || !response.data.calendars) {
      throw new nango.ActionError({
        type: "api_error",
        message: "Failed to retrieve free/busy data from Google Calendar"
      });
    }
    const calendars = response.data.calendars;
    const calendarCount = Object.keys(calendars).length;
    const allBusyPeriods = [];
    for (const calendarId of calendarIds) {
      const calendarData = calendars[calendarId];
      if (!calendarData || calendarData.errors) {
        continue;
      }
      const busyPeriods = calendarData.busy || [];
      for (const period of busyPeriods) {
        allBusyPeriods.push({
          start: period.start,
          end: period.end
        });
      }
    }
    allBusyPeriods.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const mergedBusyPeriods = [];
    for (const period of allBusyPeriods) {
      if (mergedBusyPeriods.length === 0) {
        mergedBusyPeriods.push(period);
        continue;
      }
      const lastPeriod = mergedBusyPeriods[mergedBusyPeriods.length - 1];
      if (!lastPeriod) {
        mergedBusyPeriods.push(period);
        continue;
      }
      const lastEnd = new Date(lastPeriod.end).getTime();
      const currentStart = new Date(period.start).getTime();
      if (currentStart <= lastEnd) {
        const currentEnd = new Date(period.end).getTime();
        if (currentEnd > lastEnd) {
          lastPeriod.end = period.end;
        }
      } else {
        mergedBusyPeriods.push(period);
      }
    }
    const freeSlots = [];
    const rangeStart = new Date(input.timeMin).getTime();
    const rangeEnd = new Date(input.timeMax).getTime();
    const minDurationMs = input.durationMinutes * 60 * 1e3;
    if (mergedBusyPeriods.length === 0) {
      const totalDuration = rangeEnd - rangeStart;
      if (totalDuration >= minDurationMs) {
        freeSlots.push({
          start: input.timeMin,
          end: input.timeMax,
          durationMinutes: Math.floor(totalDuration / (60 * 1e3))
        });
      }
    } else {
      const firstBusyPeriod = mergedBusyPeriods[0];
      if (firstBusyPeriod) {
        const firstBusyStart = new Date(firstBusyPeriod.start).getTime();
        if (firstBusyStart > rangeStart) {
          const gapDuration = firstBusyStart - rangeStart;
          if (gapDuration >= minDurationMs) {
            freeSlots.push({
              start: input.timeMin,
              end: firstBusyPeriod.start,
              durationMinutes: Math.floor(gapDuration / (60 * 1e3))
            });
          }
        }
      }
      for (let i = 0; i < mergedBusyPeriods.length - 1; i++) {
        const currentPeriod = mergedBusyPeriods[i];
        const nextPeriod = mergedBusyPeriods[i + 1];
        if (!currentPeriod || !nextPeriod) {
          continue;
        }
        const currentEnd = new Date(currentPeriod.end).getTime();
        const nextStart = new Date(nextPeriod.start).getTime();
        if (nextStart > currentEnd) {
          const gapDuration = nextStart - currentEnd;
          if (gapDuration >= minDurationMs) {
            freeSlots.push({
              start: currentPeriod.end,
              end: nextPeriod.start,
              durationMinutes: Math.floor(gapDuration / (60 * 1e3))
            });
          }
        }
      }
      const lastBusyPeriod = mergedBusyPeriods[mergedBusyPeriods.length - 1];
      if (lastBusyPeriod) {
        const lastBusyEnd = new Date(lastBusyPeriod.end).getTime();
        if (lastBusyEnd < rangeEnd) {
          const gapDuration = rangeEnd - lastBusyEnd;
          if (gapDuration >= minDurationMs) {
            freeSlots.push({
              start: lastBusyPeriod.end,
              end: input.timeMax,
              durationMinutes: Math.floor(gapDuration / (60 * 1e3))
            });
          }
        }
      }
    }
    return {
      freeSlots,
      calendarsChecked: calendarCount
    };
  }
};
var find_free_slots_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZmluZC1mcmVlLXNsb3RzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IFRpbWVNaW5TY2hlbWEgPSB6LnN0cmluZygpLmRlc2NyaWJlKCdTdGFydCBvZiB0aGUgdGltZSByYW5nZSBpbiBSRkMzMzM5IGZvcm1hdC4gRXhhbXBsZTogXCIyMDI0LTAzLTE1VDA5OjAwOjAwWlwiJyk7XG5jb25zdCBUaW1lTWF4U2NoZW1hID0gei5zdHJpbmcoKS5kZXNjcmliZSgnRW5kIG9mIHRoZSB0aW1lIHJhbmdlIGluIFJGQzMzMzkgZm9ybWF0LiBFeGFtcGxlOiBcIjIwMjQtMDMtMTVUMTc6MDA6MDBaXCInKTtcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkczogei5hcnJheSh6LnN0cmluZygpKS5kZXNjcmliZSgnTGlzdCBvZiBjYWxlbmRhciBJRHMgdG8gY2hlY2sgZm9yIGZyZWUvYnVzeSBpbmZvcm1hdGlvbi4gRXhhbXBsZTogW1wicHJpbWFyeVwiLCBcIndvcmtAZXhhbXBsZS5jb21cIl0nKSxcbiAgdGltZU1pbjogVGltZU1pblNjaGVtYSxcbiAgdGltZU1heDogVGltZU1heFNjaGVtYSxcbiAgZHVyYXRpb25NaW51dGVzOiB6Lm51bWJlcigpLm1pbigxKS5kZXNjcmliZSgnTWluaW11bSBkdXJhdGlvbiBpbiBtaW51dGVzIGZvciBhIGZyZWUgc2xvdCB0byBiZSByZXR1cm5lZC4gRXhhbXBsZTogMzAnKVxufSk7XG5jb25zdCBGcmVlU2xvdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3RhcnQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1N0YXJ0IHRpbWUgb2YgdGhlIGZyZWUgc2xvdCBpbiBSRkMzMzM5IGZvcm1hdCcpLFxuICBlbmQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0VuZCB0aW1lIG9mIHRoZSBmcmVlIHNsb3QgaW4gUkZDMzMzOSBmb3JtYXQnKSxcbiAgZHVyYXRpb25NaW51dGVzOiB6Lm51bWJlcigpLmRlc2NyaWJlKCdEdXJhdGlvbiBvZiB0aGUgZnJlZSBzbG90IGluIG1pbnV0ZXMnKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGZyZWVTbG90czogei5hcnJheShGcmVlU2xvdFNjaGVtYSkuZGVzY3JpYmUoJ0xpc3Qgb2YgZnJlZSB0aW1lIHNsb3RzIG1lZXRpbmcgdGhlIG1pbmltdW0gZHVyYXRpb24nKSxcbiAgY2FsZW5kYXJzQ2hlY2tlZDogei5udW1iZXIoKS5kZXNjcmliZSgnTnVtYmVyIG9mIGNhbGVuZGFycyBjaGVja2VkJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1F1ZXJ5IGZyZWUvYnVzeSBkYXRhIGFuZCByZXR1cm4gZ2FwcyBtZWV0aW5nIGEgbWluaW11bSBkdXJhdGlvbicsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2ZpbmQtZnJlZS1zbG90cycsXG4gICAgZ3JvdXA6ICdDYWxlbmRhcidcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIucmVhZG9ubHknLCAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9jYWxlbmRhci5mcmVlYnVzeSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9mcmVlYnVzeS9xdWVyeVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJy9jYWxlbmRhci92My9mcmVlQnVzeScsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHRpbWVNaW46IGlucHV0LnRpbWVNaW4sXG4gICAgICAgIHRpbWVNYXg6IGlucHV0LnRpbWVNYXgsXG4gICAgICAgIGl0ZW1zOiBpbnB1dC5jYWxlbmRhcklkcy5tYXAoaWQgPT4gKHtcbiAgICAgICAgICBpZFxuICAgICAgICB9KSksXG4gICAgICAgIHRpbWVab25lOiAnVVRDJ1xuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEuY2FsZW5kYXJzKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnYXBpX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byByZXRyaWV2ZSBmcmVlL2J1c3kgZGF0YSBmcm9tIEdvb2dsZSBDYWxlbmRhcidcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjYWxlbmRhcnMgPSByZXNwb25zZS5kYXRhLmNhbGVuZGFycztcbiAgICBjb25zdCBjYWxlbmRhckNvdW50ID0gT2JqZWN0LmtleXMoY2FsZW5kYXJzKS5sZW5ndGg7XG5cbiAgICAvLyBDb2xsZWN0IGFsbCBidXN5IHBlcmlvZHMgZnJvbSBhbGwgY2FsZW5kYXJzXG4gICAgY29uc3QgYWxsQnVzeVBlcmlvZHM6IEFycmF5PHtcbiAgICAgIHN0YXJ0OiBzdHJpbmc7XG4gICAgICBlbmQ6IHN0cmluZztcbiAgICB9PiA9IFtdO1xuICAgIGZvciAoY29uc3QgY2FsZW5kYXJJZCBvZiBpbnB1dC5jYWxlbmRhcklkcykge1xuICAgICAgY29uc3QgY2FsZW5kYXJEYXRhID0gY2FsZW5kYXJzW2NhbGVuZGFySWRdO1xuICAgICAgaWYgKCFjYWxlbmRhckRhdGEgfHwgY2FsZW5kYXJEYXRhLmVycm9ycykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJ1c3lQZXJpb2RzID0gY2FsZW5kYXJEYXRhLmJ1c3kgfHwgW107XG4gICAgICBmb3IgKGNvbnN0IHBlcmlvZCBvZiBidXN5UGVyaW9kcykge1xuICAgICAgICBhbGxCdXN5UGVyaW9kcy5wdXNoKHtcbiAgICAgICAgICBzdGFydDogcGVyaW9kLnN0YXJ0LFxuICAgICAgICAgIGVuZDogcGVyaW9kLmVuZFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTb3J0IGJ1c3kgcGVyaW9kcyBieSBzdGFydCB0aW1lXG4gICAgYWxsQnVzeVBlcmlvZHMuc29ydCgoYSwgYikgPT4gbmV3IERhdGUoYS5zdGFydCkuZ2V0VGltZSgpIC0gbmV3IERhdGUoYi5zdGFydCkuZ2V0VGltZSgpKTtcblxuICAgIC8vIE1lcmdlIG92ZXJsYXBwaW5nIGJ1c3kgcGVyaW9kc1xuICAgIGNvbnN0IG1lcmdlZEJ1c3lQZXJpb2RzOiBBcnJheTx7XG4gICAgICBzdGFydDogc3RyaW5nO1xuICAgICAgZW5kOiBzdHJpbmc7XG4gICAgfT4gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHBlcmlvZCBvZiBhbGxCdXN5UGVyaW9kcykge1xuICAgICAgaWYgKG1lcmdlZEJ1c3lQZXJpb2RzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBtZXJnZWRCdXN5UGVyaW9kcy5wdXNoKHBlcmlvZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgbGFzdFBlcmlvZCA9IG1lcmdlZEJ1c3lQZXJpb2RzW21lcmdlZEJ1c3lQZXJpb2RzLmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKCFsYXN0UGVyaW9kKSB7XG4gICAgICAgIG1lcmdlZEJ1c3lQZXJpb2RzLnB1c2gocGVyaW9kKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBsYXN0RW5kID0gbmV3IERhdGUobGFzdFBlcmlvZC5lbmQpLmdldFRpbWUoKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRTdGFydCA9IG5ldyBEYXRlKHBlcmlvZC5zdGFydCkuZ2V0VGltZSgpO1xuICAgICAgaWYgKGN1cnJlbnRTdGFydCA8PSBsYXN0RW5kKSB7XG4gICAgICAgIC8vIE92ZXJsYXBwaW5nIG9yIGNvbnRpZ3VvdXMgLSBtZXJnZSB0aGVtXG4gICAgICAgIGNvbnN0IGN1cnJlbnRFbmQgPSBuZXcgRGF0ZShwZXJpb2QuZW5kKS5nZXRUaW1lKCk7XG4gICAgICAgIGlmIChjdXJyZW50RW5kID4gbGFzdEVuZCkge1xuICAgICAgICAgIGxhc3RQZXJpb2QuZW5kID0gcGVyaW9kLmVuZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTm8gb3ZlcmxhcCAtIGFkZCBuZXcgcGVyaW9kXG4gICAgICAgIG1lcmdlZEJ1c3lQZXJpb2RzLnB1c2gocGVyaW9kKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGaW5kIGZyZWUgc2xvdHMgKGdhcHMgYmV0d2VlbiBidXN5IHBlcmlvZHMpXG4gICAgY29uc3QgZnJlZVNsb3RzOiBBcnJheTx7XG4gICAgICBzdGFydDogc3RyaW5nO1xuICAgICAgZW5kOiBzdHJpbmc7XG4gICAgICBkdXJhdGlvbk1pbnV0ZXM6IG51bWJlcjtcbiAgICB9PiA9IFtdO1xuICAgIGNvbnN0IHJhbmdlU3RhcnQgPSBuZXcgRGF0ZShpbnB1dC50aW1lTWluKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgcmFuZ2VFbmQgPSBuZXcgRGF0ZShpbnB1dC50aW1lTWF4KS5nZXRUaW1lKCk7XG4gICAgY29uc3QgbWluRHVyYXRpb25NcyA9IGlucHV0LmR1cmF0aW9uTWludXRlcyAqIDYwICogMTAwMDtcbiAgICBpZiAobWVyZ2VkQnVzeVBlcmlvZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyBObyBidXN5IHBlcmlvZHMgYXQgYWxsIC0gZW50aXJlIHJhbmdlIGlzIGZyZWVcbiAgICAgIGNvbnN0IHRvdGFsRHVyYXRpb24gPSByYW5nZUVuZCAtIHJhbmdlU3RhcnQ7XG4gICAgICBpZiAodG90YWxEdXJhdGlvbiA+PSBtaW5EdXJhdGlvbk1zKSB7XG4gICAgICAgIGZyZWVTbG90cy5wdXNoKHtcbiAgICAgICAgICBzdGFydDogaW5wdXQudGltZU1pbixcbiAgICAgICAgICBlbmQ6IGlucHV0LnRpbWVNYXgsXG4gICAgICAgICAgZHVyYXRpb25NaW51dGVzOiBNYXRoLmZsb29yKHRvdGFsRHVyYXRpb24gLyAoNjAgKiAxMDAwKSlcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENoZWNrIGZvciBmcmVlIHRpbWUgYmVmb3JlIGZpcnN0IGJ1c3kgcGVyaW9kXG4gICAgICBjb25zdCBmaXJzdEJ1c3lQZXJpb2QgPSBtZXJnZWRCdXN5UGVyaW9kc1swXTtcbiAgICAgIGlmIChmaXJzdEJ1c3lQZXJpb2QpIHtcbiAgICAgICAgY29uc3QgZmlyc3RCdXN5U3RhcnQgPSBuZXcgRGF0ZShmaXJzdEJ1c3lQZXJpb2Quc3RhcnQpLmdldFRpbWUoKTtcbiAgICAgICAgaWYgKGZpcnN0QnVzeVN0YXJ0ID4gcmFuZ2VTdGFydCkge1xuICAgICAgICAgIGNvbnN0IGdhcER1cmF0aW9uID0gZmlyc3RCdXN5U3RhcnQgLSByYW5nZVN0YXJ0O1xuICAgICAgICAgIGlmIChnYXBEdXJhdGlvbiA+PSBtaW5EdXJhdGlvbk1zKSB7XG4gICAgICAgICAgICBmcmVlU2xvdHMucHVzaCh7XG4gICAgICAgICAgICAgIHN0YXJ0OiBpbnB1dC50aW1lTWluLFxuICAgICAgICAgICAgICBlbmQ6IGZpcnN0QnVzeVBlcmlvZC5zdGFydCxcbiAgICAgICAgICAgICAgZHVyYXRpb25NaW51dGVzOiBNYXRoLmZsb29yKGdhcER1cmF0aW9uIC8gKDYwICogMTAwMCkpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgZ2FwcyBiZXR3ZWVuIGJ1c3kgcGVyaW9kc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXJnZWRCdXN5UGVyaW9kcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgY29uc3QgY3VycmVudFBlcmlvZCA9IG1lcmdlZEJ1c3lQZXJpb2RzW2ldO1xuICAgICAgICBjb25zdCBuZXh0UGVyaW9kID0gbWVyZ2VkQnVzeVBlcmlvZHNbaSArIDFdO1xuICAgICAgICBpZiAoIWN1cnJlbnRQZXJpb2QgfHwgIW5leHRQZXJpb2QpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjdXJyZW50RW5kID0gbmV3IERhdGUoY3VycmVudFBlcmlvZC5lbmQpLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3QgbmV4dFN0YXJ0ID0gbmV3IERhdGUobmV4dFBlcmlvZC5zdGFydCkuZ2V0VGltZSgpO1xuICAgICAgICBpZiAobmV4dFN0YXJ0ID4gY3VycmVudEVuZCkge1xuICAgICAgICAgIGNvbnN0IGdhcER1cmF0aW9uID0gbmV4dFN0YXJ0IC0gY3VycmVudEVuZDtcbiAgICAgICAgICBpZiAoZ2FwRHVyYXRpb24gPj0gbWluRHVyYXRpb25Ncykge1xuICAgICAgICAgICAgZnJlZVNsb3RzLnB1c2goe1xuICAgICAgICAgICAgICBzdGFydDogY3VycmVudFBlcmlvZC5lbmQsXG4gICAgICAgICAgICAgIGVuZDogbmV4dFBlcmlvZC5zdGFydCxcbiAgICAgICAgICAgICAgZHVyYXRpb25NaW51dGVzOiBNYXRoLmZsb29yKGdhcER1cmF0aW9uIC8gKDYwICogMTAwMCkpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgZm9yIGZyZWUgdGltZSBhZnRlciBsYXN0IGJ1c3kgcGVyaW9kXG4gICAgICBjb25zdCBsYXN0QnVzeVBlcmlvZCA9IG1lcmdlZEJ1c3lQZXJpb2RzW21lcmdlZEJ1c3lQZXJpb2RzLmxlbmd0aCAtIDFdO1xuICAgICAgaWYgKGxhc3RCdXN5UGVyaW9kKSB7XG4gICAgICAgIGNvbnN0IGxhc3RCdXN5RW5kID0gbmV3IERhdGUobGFzdEJ1c3lQZXJpb2QuZW5kKS5nZXRUaW1lKCk7XG4gICAgICAgIGlmIChsYXN0QnVzeUVuZCA8IHJhbmdlRW5kKSB7XG4gICAgICAgICAgY29uc3QgZ2FwRHVyYXRpb24gPSByYW5nZUVuZCAtIGxhc3RCdXN5RW5kO1xuICAgICAgICAgIGlmIChnYXBEdXJhdGlvbiA+PSBtaW5EdXJhdGlvbk1zKSB7XG4gICAgICAgICAgICBmcmVlU2xvdHMucHVzaCh7XG4gICAgICAgICAgICAgIHN0YXJ0OiBsYXN0QnVzeVBlcmlvZC5lbmQsXG4gICAgICAgICAgICAgIGVuZDogaW5wdXQudGltZU1heCxcbiAgICAgICAgICAgICAgZHVyYXRpb25NaW51dGVzOiBNYXRoLmZsb29yKGdhcER1cmF0aW9uIC8gKDYwICogMTAwMCkpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGZyZWVTbG90czogZnJlZVNsb3RzLFxuICAgICAgY2FsZW5kYXJzQ2hlY2tlZDogY2FsZW5kYXJDb3VudFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sZ0JBQWdCLGFBQUUsT0FBTyxFQUFFLFNBQVMsNEVBQTRFO0FBQ3RILElBQU0sZ0JBQWdCLGFBQUUsT0FBTyxFQUFFLFNBQVMsMEVBQTBFO0FBQ3BILElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixhQUFhLGFBQUUsTUFB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
