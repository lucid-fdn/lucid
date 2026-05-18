## Google Sheets

### Common Patterns
- "Create a spreadsheet" → create-spreadsheet with title and optional sheet names
- "Read data from my sheet" → get-values(spreadsheetId, range: "Sheet1!A1:D10")
- "Read multiple ranges" → batch-get-values(spreadsheetId, ranges array)
- "Add a row" → append-values-to-spreadsheet(spreadsheetId, range, values: [["col1", "col2"]])
- "Update a cell" → update-values(spreadsheetId, range: "Sheet1!B2", values: [["new value"]])
- "Add a row with headers" → create-spreadsheet-row(spreadsheetId, sheetName, values: {Header1: "val1"})
- "Update or insert by key" → upsert-row(spreadsheetId, sheetName, keyColumn, keyValue, values)
- "Clear a range" → clear-values(spreadsheetId, range)
- "List my spreadsheets" → list-spreadsheets

### Input Formats
- Range notation: "Sheet1!A1:D10", "Sheet1!A:A" (whole column), "Sheet1" (whole sheet)
- Values: 2D array — [["row1col1", "row1col2"], ["row2col1", "row2col2"]]
- For create-spreadsheet-row: object with header names as keys

### CRITICAL RULES
- Range MUST include the sheet name (e.g., "Sheet1!A1:B2", not just "A1:B2")
- Values are always a 2D array (array of rows, each row is array of cells)
- Use get-values first to understand the sheet structure before writing
